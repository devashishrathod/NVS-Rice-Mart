const mongoose = require("mongoose");
const User = require("../../models/User");
const Location = require("../../models/Location");
const { ROLES, LOCATION_TYPES, DEFAULT_COUNTRY } = require("../../constants");
const { validateObjectId, throwError, toTitleCase } = require("../../utils");
const { isValidZipCode } = require("../../validator/common");
const { buildFormattedAddress } = require("../../helpers/locations");

/**
 * 🆕 "Mera address save kar do" — ek hi endpoint, chahe address pehle se ho
 * ya na ho.
 *
 * ❓ Ye kyun banaya: `POST /locations/create` HAR baar naya doc banata tha.
 *    Stage/prod data me iska nateeja dikh chuka hai — ek customer ke 8
 *    address, jinme 6 bilkul identical, 20 minute ke andar bane. User bas
 *    "Save" dobara daba raha tha. Upsert us duplicate-spam ko rokta hai.
 *
 * 🎯 Target hamesha customer ka DEFAULT address hai:
 *      1. default CUSTOMER address mila     → wahi update
 *      2. address to hain par koi default nahi → sabse purana update + default
 *         (wahi rule jo `cleanupLegacyArtifacts.js` follow karti hai)
 *      3. kuch nahi mila                    → naya banao, default bana do
 *
 * 🔒 Customer sirf apna. Admin/staff `userId` bhej ke kisi ka bhi.
 */

// Ye fields payload se merge hote hain. `coordinates` / `formattedAddress`
// alag handle hote hain (unka apna logic hai).
const MERGEABLE = [
  "name",
  "shopOrBuildingNumber",
  "address",
  "area",
  "city",
  "district",
  "state",
  "country",
  "zipcode",
];

/** Address kiske account me jayega — aur kya actor ko iska haq hai. */
const resolveTargetUser = async (actor, requestedUserId) => {
  let userId = actor?.userId;
  const isAdmin = actor?.role === ROLES.ADMIN || actor?.role === ROLES.STAFF;

  if (requestedUserId && String(requestedUserId) !== String(actor?.userId)) {
    // 🔒 Warna koi bhi doosre ke account me address daal ke uska default
    // delivery address hijack kar leta.
    if (!isAdmin) {
      throwError(403, "You can only save an address to your own account");
    }
    validateObjectId(requestedUserId, "User Id");
    userId = requestedUserId;
  }

  const user = await User.findById(userId).select("role locationId isDeleted");
  if (!user || user.isDeleted) throwError(404, "User not found");
  return user;
};

/**
 * @param {{ userId: any, role: string }} actor logged-in user
 * @param {object} payload validated address
 * @returns {Promise<{ created: boolean, promoted: boolean, location: object }>}
 */
exports.upsertLocation = async (actor, payload) => {
  const user = await resolveTargetUser(actor, payload?.userId);
  const userId = user._id;

  // ── 1. Target dhoondho ───────────────────────────────────
  let target = await Location.findOne({
    userId,
    type: LOCATION_TYPES.CUSTOMER,
    isDefault: true,
    isDeleted: false,
  });

  // Fallback: address hain par koi default nahi (StageDB pe abhi aisa ek
  // bhi user nahi hai, par prod pe purana data aisa ho sakta hai).
  let promoted = false;
  if (!target) {
    target = await Location.findOne({
      userId,
      type: LOCATION_TYPES.CUSTOMER,
      isDeleted: false,
    }).sort({ createdAt: 1 });
    promoted = Boolean(target);
  }
  const isCreate = !target;

  // ── 2. Nayi values tay karo ──────────────────────────────
  const next = {};
  for (const field of MERGEABLE) {
    if (payload?.[field] !== undefined) next[field] = payload[field];
  }

  // Display fields proper case me save hote hain — `zipcode` chhod ke
  // (wo digits hai) aur `country` alag handle hota hai.
  for (const field of MERGEABLE) {
    if (field !== "zipcode") next[field] = toTitleCase(next[field]);
  }

  // `country` ka default sirf tab jab payload me bhi na ho aur purane doc
  // me bhi na ho — warna existing country overwrite ho jata.
  next.country = next.country ?? target?.country ?? DEFAULT_COUNTRY;

  const zipcode = next.zipcode ?? target?.zipcode;
  if (!isValidZipCode(next.country, zipcode)) {
    throwError(
      422,
      `${zipcode} is not a valid ZIP/postal code for ${next.country}`,
    );
  }

  if (payload?.coordinates !== undefined) {
    const c = payload.coordinates;
    const lat = Number(c?.[0]);
    const lng = Number(c?.[1]);
    // NOTE: `!Number(x)` NAHI use kiya — wo latitude 0 ko reject kar deta.
    if (!Array.isArray(c) || c.length !== 2 || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      throwError(422, "Coordinates must be a valid [latitude, longitude]");
    }
    next.coordinates = [lat, lng];
  }

  // Client ne khud `formattedAddress` bheja to wahi, warna merged values se
  // banao — khali parts skip ho jate hain, "undefined" nahi aata.
  next.formattedAddress =
    toTitleCase(payload?.formattedAddress) ||
    buildFormattedAddress({
      address: next.address ?? target?.address,
      city: next.city ?? target?.city,
      district: next.district ?? target?.district,
      state: next.state ?? target?.state,
      zipcode,
      country: next.country,
    });

  // ── 3. Likho — single-default invariant transaction me ───
  const session = await mongoose.startSession();
  session.startTransaction();
  let locationId;
  try {
    // Naya default banne wala hai to baaki CUSTOMER defaults hata do.
    // (Case 1 me target pehle se default hai, kuch karne ki zarurat nahi.)
    if (isCreate || promoted) {
      await Location.updateMany(
        {
          userId,
          type: LOCATION_TYPES.CUSTOMER,
          isDeleted: false,
          isDefault: true,
        },
        { $set: { isDefault: false } },
        { session },
      );
    }

    if (isCreate) {
      const [created] = await Location.create(
        [
          {
            ...next,
            userId,
            type: LOCATION_TYPES.CUSTOMER,
            isDefault: true,
            isDeleted: false,
          },
        ],
        { session },
      );
      locationId = created._id;
    } else {
      Object.assign(target, next);
      target.isDefault = true;
      await target.save({ session });
      locationId = target._id;
    }

    // 🛡️ Vendor ka `locationId` uske VENDOR_BRANCH pe point karta hai —
    //    usse customer address se overwrite mat karo.
    //    `updateOne` (save nahi) taaki purane user docs ka full-document
    //    validation trigger na ho.
    if (
      user.role !== ROLES.VENDOR &&
      String(user.locationId ?? "") !== String(locationId)
    ) {
      await User.updateOne(
        { _id: userId },
        { $set: { locationId } },
        { session },
      );
    }

    await session.commitTransaction();
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }

  return {
    created: isCreate,
    promoted,
    location: await Location.findById(locationId).lean(),
  };
};
