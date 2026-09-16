/* eslint-disable no-console */
/**
 * POSTMAN EXAMPLE CAPTURE — har endpoint ka asli 200/201 response record karta
 * hai, taaki collection me "saved example" asli data ka ho, haath ka likha nahi.
 *
 *   node postman/capture.js            # capture + cleanup
 *   node postman/capture.js --keep     # cleanup skip (debug ke liye)
 *
 * Kaise kaam karta hai:
 *   1. In-process express server start karta hai (asli routes/controllers/DB).
 *   2. READ endpoints stage ke asli data pe chalte hain (Nagraj Mart, 577001).
 *   3. WRITE endpoints apna alag bubble banate hain — do temp vendor,
 *      ek temp customer, temp catalog aur 3 temp orders — aur aakhir me
 *      sab kuch delete ho jata hai.
 *
 * 🔒 PROD DB pe chalne se mana karta hai.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const fileUpload = require("express-fileupload");
const mongoose = require("mongoose");

const { errorHandler } = require("../middlewares");
const { throwError } = require("../utils");

const KEEP = process.argv.includes("--keep");
const OUT = path.join(__dirname, "examples.json");

// 1x1 PNG — banner create ko ek asli file chahiye hoti hai
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

// ─────────────────────────────────────────────────────────────
const REC = {};
let BASE;
let captured = 0;
let missed = 0;
const problems = [];

const call = async (method, p, { token, body, form } = {}) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    payload = new FormData();
    Object.entries(form).forEach(([k, v]) => {
      // { __file: Buffer, name, type } => asli file field
      if (v && typeof v === "object" && v.__file) {
        payload.append(k, new Blob([v.__file], { type: v.type }), v.name);
      } else {
        payload.append(k, String(v));
      }
    });
  } else if (body) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${p}`, { method, headers, body: payload });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-json */
  }
  return { status: res.status, json, ...(json || {}) };
};

// Atlas ka DNS kabhi-kabhi ek-do second ke liye fail hota hai. Aisa 500
// asli response nahi hai, isliye use example me save karne ke bajaye
// thodi der ruk ke dobara maang lo.
const FLAKY = /ENOTFOUND|ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|topology|server selection/i;
const callRetry = async (method, p, opts = {}, tries = 4) => {
  let last;
  for (let i = 0; i < tries; i++) {
    last = await call(method, p, opts);
    const msg = (last.json && last.json.message) || "";
    if (last.status < 500 || !FLAKY.test(msg)) return last;
    const wait = 1500 * (i + 1);
    console.log(`  ↻ retry ${i + 1}/${tries - 1} ${method} ${p} — ${msg.slice(0, 60)}`);
    await new Promise((r) => setTimeout(r, wait));
  }
  return last;
};

/** Response ko example ke roop me record karo. */
const rec = (id, res, req = {}) => {
  const good = res.status >= 200 && res.status < 300;
  if (good) captured++;
  else {
    missed++;
    problems.push(`${id} → ${res.status} ${res.json && res.json.message}`);
  }
  REC[id] = {
    status: res.status,
    body: res.json,
    request: req,
    capturedAt: new Date().toISOString(),
    live: true,
  };
  console.log(
    `  ${good ? "✅" : "❌"} ${id.padEnd(26)} ${res.status}  ${
      good ? "" : (res.json && res.json.message) || ""
    }`,
  );
  return res;
};

const hr = (t) => console.log(`\n${"─".repeat(76)}\n  ${t}\n${"─".repeat(76)}`);

// ═════════════════════════════════════════════════════════════
const run = async () => {
  await mongoose.connect(process.env.MONGO_URL);
  const dbName = mongoose.connection.name;
  if (/prod/i.test(dbName)) {
    throw new Error(`ABORT: ye PRODUCTION DB hai (${dbName}).`);
  }
  console.log(`\n📮 POSTMAN EXAMPLE CAPTURE   DB: ${dbName}\n`);

  const app = express();
  app.use(fileUpload({ useTempFiles: true, tempFileDir: "/tmp/" }));
  app.use(express.json());
  app.use("/nvs-rice-mart/", require("../routes"));
  app.use(() => throwError(404, "Invalid API"));
  app.use(errorHandler);
  const server = await new Promise((r) => {
    const s = app.listen(0, () => r(s));
  });
  BASE = `http://127.0.0.1:${server.address().port}/nvs-rice-mart`;

  const User = require("../models/User");
  const db = mongoose.connection.db;

  const CREATED = {
    users: [],
    locations: [],
    categories: [],
    subcategories: [],
    products: [],
    carts: [],
    orders: [],
    vendorprofiles: [],
    vendorserviceareas: [],
    banners: [],
    termsandconditions: [],
    privacyandpolicies: [],
    subscriptions: [],
    counters: [],
  };

  /** Aisa mobile dhoondo jo is role pe already na ho. */
  const freeMobile = async (start, role) => {
    let n = Number(start);
    for (let i = 0; i < 200; i++) {
      const m = String(n + i);
      if (!(await User.exists({ mobile: m, role }))) return m;
    }
    throw new Error("koi free mobile nahi mila");
  };
  const freeEmail = async (local, domain, role) => {
    for (let i = 0; i < 200; i++) {
      const e = `${local}${i ? i : ""}@${domain}`;
      if (!(await User.exists({ email: e, role }))) return e;
    }
    throw new Error("koi free email nahi mila");
  };

  // cleanup ke liye bahar rakhe gaye (finally block inhe use karta hai)
  let tCustId = null;
  const ymKey = (() => {
    const n = new Date();
    return `order:${String(n.getFullYear()).slice(2)}${String(n.getMonth() + 1).padStart(2, "0")}`;
  })();
  const counterBefore = await db.collection("counters").findOne({ _id: ymKey });
  const seqBefore = counterBefore ? counterBefore.seq : null;

  try {
    // ══════════════════════════════════════════════════════════
    hr("1. LOGIN — stage ke seeded accounts (asli data)");

    let r = rec(
      "adm.auth.login",
      await callRetry("POST", "/auth/login", {
        body: {
          type: "email",
          email: "ricemartnvs@gmail.com",
          password: "Admin@123",
          role: "admin",
          loginType: "password",
        },
      }),
    );
    const adminToken = r.data && r.data.token;
    if (!adminToken) throw new Error("admin login fail — seedStageAccounts chalayi?");

    r = rec(
      "vend.auth.login",
      await callRetry("POST", "/auth/login", {
        body: {
          type: "email",
          email: "nagraj@gmail.com",
          password: "nagraj@123",
          role: "vendor",
          loginType: "password",
        },
      }),
    );
    const vendorToken = r.data && r.data.token;
    const nagrajId = r.data && r.data.user && r.data.user._id;

    r = rec(
      "cust.auth.login",
      await callRetry("POST", "/auth/login", {
        body: {
          type: "mobile",
          mobile: "9886061450",
          password: "Stage@123",
          role: "user",
          loginType: "password",
        },
      }),
    );
    const custToken = r.data && r.data.token;
    const custId = r.data && r.data.user && r.data.user._id;

    // ══════════════════════════════════════════════════════════
    hr("2. ADMIN — read endpoints (asli stage data)");

    r = rec("adm.vendor.getAll", await callRetry("GET", "/vendors/getAll?limit=10", { token: adminToken }));
    rec("adm.vendor.get", await callRetry("GET", `/vendors/get/${nagrajId}`, { token: adminToken }));

    r = rec("adm.branch.getAll", await callRetry("GET", `/vendors/${nagrajId}/branches`, { token: adminToken }));
    rec("adm.area.lookup", await callRetry("GET", "/service-areas/lookup?zipcode=577001", { token: adminToken }));
    r = rec(
      "adm.area.getAll",
      await callRetry("GET", `/vendors/${nagrajId}/service-areas?limit=20`, { token: adminToken }),
    );

    rec("adm.order.summary", await callRetry("GET", "/orders/admin/summary", { token: adminToken }));
    r = rec("adm.order.getAll", await callRetry("GET", "/orders/getAll?limit=5", { token: adminToken }));
    const anyOrderId = r.data && r.data.data && r.data.data[0] && r.data.data[0]._id;
    if (anyOrderId) {
      rec("adm.order.get", await callRetry("GET", `/orders/get/${anyOrderId}`, { token: adminToken }));
    }

    r = rec("adm.user.getAll", await callRetry("GET", "/users/getAll?limit=5&role=user", { token: adminToken }));
    rec("adm.user.get", await callRetry("GET", `/users/get?userId=${custId}`, { token: adminToken }));
    rec(
      "adm.user.locations",
      await callRetry("GET", `/locations/getAll?userId=${custId}&limit=10`, { token: adminToken }),
    );

    rec("adm.setting.get", await callRetry("GET", "/settings/get", { token: adminToken }));
    rec(
      "adm.setting.update",
      await callRetry("PUT", "/settings/update", {
        token: adminToken,
        body: { delivery: { maxRadiusKm: 50, maxAllowedDeliveryCharge: 200 } },
      }),
    );
    rec(
      "adm.setting.create",
      await callRetry("POST", "/settings/create", {
        token: adminToken,
        body: { delivery: { maxRadiusKm: 50, maxAllowedDeliveryCharge: 200 } },
      }),
    );

    // ══════════════════════════════════════════════════════════
    hr("3. VENDOR — read endpoints (Nagraj Mart ka asli data)");

    rec("vend.me.profile", await callRetry("GET", `/vendors/get/${nagrajId}`, { token: vendorToken }));
    rec("vend.me.branches", await callRetry("GET", `/vendors/${nagrajId}/branches`, { token: vendorToken }));
    rec(
      "vend.me.serviceAreas",
      await callRetry("GET", `/vendors/${nagrajId}/service-areas?limit=20`, { token: vendorToken }),
    );

    r = rec("vend.cat.getAll", await callRetry("GET", "/categories/getAll?limit=10", { token: vendorToken }));
    const vCatId = r.data && r.data.data && r.data.data[0] && r.data.data[0]._id;
    if (vCatId) rec("vend.cat.get", await callRetry("GET", `/categories/get/${vCatId}`, { token: vendorToken }));

    r = rec("vend.sub.getAll", await callRetry("GET", "/subCategories/getAll?limit=10", { token: vendorToken }));
    const vSubId = r.data && r.data.data && r.data.data[0] && r.data.data[0]._id;
    if (vSubId) rec("vend.sub.get", await callRetry("GET", `/subCategories/get/${vSubId}`, { token: vendorToken }));

    r = rec("vend.prod.getAll", await callRetry("GET", "/products/getAll?limit=10", { token: vendorToken }));
    const vProdId = r.data && r.data.data && r.data.data[0] && r.data.data[0]._id;
    if (vProdId) rec("vend.prod.get", await callRetry("GET", `/products/get/${vProdId}`, { token: vendorToken }));

    rec("vend.order.summary", await callRetry("GET", "/orders/vendor/summary", { token: vendorToken }));
    r = rec("vend.order.getAll", await callRetry("GET", "/orders/getAll?limit=5", { token: vendorToken }));
    const vOrderId = r.data && r.data.data && r.data.data[0] && r.data.data[0]._id;
    if (vOrderId) rec("vend.order.get", await callRetry("GET", `/orders/get/${vOrderId}`, { token: vendorToken }));

    // ══════════════════════════════════════════════════════════
    hr("4. CUSTOMER — read endpoints (577001 wala asli customer)");

    rec("cust.user.me", await callRetry("GET", "/users/get", { token: custToken }));
    rec("cust.area.check", await callRetry("GET", "/service-areas/check?zipcode=577001", { token: custToken }));

    r = rec("cust.loc.getAll", await callRetry("GET", "/locations/getAll", { token: custToken }));
    const realLocId =
      r.data && r.data.data && (r.data.data.find((l) => l.isDefault) || r.data.data[0]);
    if (realLocId) {
      rec("cust.loc.get", await callRetry("GET", `/locations/get/${realLocId._id}`, { token: custToken }));
    }

    r = rec("cust.cat.getAll", await callRetry("GET", "/categories/getAll?limit=10", { token: custToken }));
    const cCatId = r.data && r.data.data && r.data.data[0] && r.data.data[0]._id;
    if (cCatId) rec("cust.cat.get", await callRetry("GET", `/categories/get/${cCatId}`, { token: custToken }));

    r = rec(
      "cust.sub.getAll",
      await callRetry("GET", `/subCategories/getAll?limit=10${cCatId ? `&categoryId=${cCatId}` : ""}`, {
        token: custToken,
      }),
    );
    const cSubId = r.data && r.data.data && r.data.data[0] && r.data.data[0]._id;
    if (cSubId) rec("cust.sub.get", await callRetry("GET", `/subCategories/get/${cSubId}`, { token: custToken }));

    r = await callRetry("GET", `/products/getAll?limit=10${cSubId ? `&subCategoryId=${cSubId}` : ""}`, {
      token: custToken,
    });
    // chuni hui subcategory khaali ho sakti hai — example me products dikhne
    // chahiye, isliye aise me bina filter ke dobara maang lo
    if (!(r.data && r.data.data && r.data.data.length)) {
      r = await callRetry("GET", "/products/getAll?limit=10", { token: custToken });
    }
    rec("cust.prod.getAll", r);
    const cProdId = r.data && r.data.data && r.data.data[0] && r.data.data[0]._id;
    if (cProdId) rec("cust.prod.get", await callRetry("GET", `/products/get/${cProdId}`, { token: custToken }));

    r = rec("cust.order.getAll", await callRetry("GET", "/orders/getAll?limit=5", { token: custToken }));

    // ══════════════════════════════════════════════════════════
    hr("5. ADMIN — content writes (banaya, capture kiya, delete kiya)");

    r = rec(
      "adm.banner.create",
      await callRetry("POST", "/banners/create", {
        token: adminToken,
        form: {
          name: "Monsoon Rice Offer",
          description: "Basmati pe 10% off — is hafte tak",
          isActive: "true",
          // banner me image ya video me se ek ZARURI hai
          image: { __file: PIXEL_PNG, name: "banner.png", type: "image/png" },
        },
      }),
    );
    const bannerId = r.data && r.data._id;
    if (bannerId) CREATED.banners.push(bannerId);

    r = rec("cust.banner.getAll", await callRetry("GET", "/banners/getAll?limit=10", { token: custToken }));
    const anyBannerId = (r.data && r.data.data && r.data.data[0] && r.data.data[0]._id) || bannerId;
    if (anyBannerId) {
      rec("cust.banner.get", await callRetry("GET", `/banners/get/${anyBannerId}`, { token: custToken }));
    }

    r = rec(
      "adm.terms.create",
      await callRetry("POST", "/terms-and-conditions/create", {
        token: adminToken,
        body: {
          title: "Order aur Delivery",
          description:
            "Order confirm hone ke baad vendor use accept karta hai. Delivery time aapke area ke hisaab se badal sakta hai.",
          isActive: true,
        },
      }),
    );
    const termId = r.data && r.data._id;
    if (termId) CREATED.termsandconditions.push(termId);

    rec("cust.terms.getAll", await callRetry("GET", "/terms-and-conditions/getAll?limit=10", { token: custToken }));
    if (termId) {
      rec("cust.terms.get", await callRetry("GET", `/terms-and-conditions/get/${termId}`, { token: custToken }));
      rec(
        "adm.terms.update",
        await callRetry("PUT", `/terms-and-conditions/update/${termId}`, {
          token: adminToken,
          body: {
            title: "Order aur Delivery",
            description:
              "Order confirm hone ke baad vendor use accept karta hai. PACKED hone ke baad cancel nahi ho sakta.",
            isActive: true,
          },
        }),
      );
    }

    r = rec(
      "adm.privacy.create",
      await callRetry("POST", "/privacy-and-policies/create", {
        token: adminToken,
        body: {
          title: "Aapka data",
          description:
            "Hum aapka naam, mobile aur delivery address sirf order pura karne ke liye use karte hain.",
          isActive: true,
        },
      }),
    );
    const privacyId = r.data && r.data._id;
    if (privacyId) CREATED.privacyandpolicies.push(privacyId);

    rec(
      "cust.privacy.getAll",
      await callRetry("GET", "/privacy-and-policies/getAll?limit=10", { token: custToken }),
    );
    if (privacyId) {
      rec("cust.privacy.get", await callRetry("GET", `/privacy-and-policies/get/${privacyId}`, { token: custToken }));
      rec(
        "adm.privacy.update",
        await callRetry("PUT", `/privacy-and-policies/update/${privacyId}`, {
          token: adminToken,
          body: {
            title: "Aapka data",
            description:
              "Hum aapka naam, mobile aur delivery address sirf order pura karne ke liye use karte hain. Kisi third party ko nahi dete.",
            isActive: true,
          },
        }),
      );
    }

    r = rec(
      "adm.sub.create",
      await callRetry("POST", "/subscriptions/add", {
        token: adminToken,
        body: {
          name: "Monthly Saver",
          description: "Har mahine free delivery aur priority support",
          price: 199,
          type: "monthly",
          durationInDays: 30,
          benefits: ["Free delivery", "Priority support"],
          limitations: ["Ek hi address pe valid"],
          isActive: true,
        },
      }),
    );
    if (r.data && r.data._id) CREATED.subscriptions.push(r.data._id);

    // ══════════════════════════════════════════════════════════
    hr("6. ADMIN — vendor onboarding (temp vendor, baad me delete)");

    const vMobile = await freeMobile("9845012345", "vendor");
    const vEmail = await freeEmail("srilakshmi.traders", "gmail.com", "vendor");
    const VPW = "Lakshmi@123";

    r = rec(
      "adm.vendor.create",
      await callRetry("POST", "/vendors/create", {
        token: adminToken,
        body: {
          shopName: "Sri Lakshmi Traders",
          name: "Lakshmi Narayan",
          email: vEmail,
          mobile: vMobile,
          password: VPW,
          legalName: "Sri Lakshmi Traders",
          gstNumber: "29ABCDE1234F1Z5",
          fssaiNumber: "11223344556677",
          supportMobile: vMobile,
          commissionPercent: 5,
          payout: {
            accountHolder: "Lakshmi Narayan",
            accountNumber: "1234567890123",
            ifsc: "SBIN0001234",
            upiId: "lakshmi@okaxis",
          },
          branch: {
            name: "Main Branch",
            shopOrBuildingNumber: "24",
            address: "24, PB Road, Near Jayadeva Circle",
            area: "Jayanagar",
            city: "Bengaluru",
            district: "Bengaluru Urban",
            state: "Karnataka",
            country: "India",
            zipcode: "560001",
            coordinates: [12.9716, 77.5946],
            isDefault: true,
          },
        },
      }),
    );
    const tVendorId = r.data && r.data.vendor && r.data.vendor._id;
    const tBranchId = r.data && r.data.branch && r.data.branch._id;
    if (tVendorId) CREATED.users.push(tVendorId);
    if (r.data && r.data.profile) CREATED.vendorprofiles.push(r.data.profile._id);
    if (tBranchId) CREATED.locations.push(tBranchId);
    if (!tVendorId) throw new Error("temp vendor nahi bana — aage nahi badh sakte");

    rec(
      "adm.vendor.update",
      await callRetry("PUT", `/vendors/update/${tVendorId}`, {
        token: adminToken,
        body: {
          shopName: "Sri Lakshmi Traders",
          name: "Lakshmi Narayan",
          legalName: "Sri Lakshmi Traders",
          commissionPercent: 5,
          payout: {
            accountHolder: "Lakshmi Narayan",
            accountNumber: "1234567890123",
            ifsc: "SBIN0001234",
            upiId: "lakshmi@okaxis",
          },
        },
      }),
    );

    r = rec(
      "adm.branch.create",
      await callRetry("POST", `/vendors/${tVendorId}/branches`, {
        token: adminToken,
        body: {
          name: "Shivaji Nagar Branch",
          shopOrBuildingNumber: "8",
          address: "8, Shivaji Nagar Main Road",
          area: "Shivaji Nagar",
          city: "Bengaluru",
          district: "Bengaluru Urban",
          state: "Karnataka",
          country: "India",
          zipcode: "560002",
          coordinates: [12.9812, 77.6035],
          isDefault: false,
        },
      }),
    );
    const tBranch2 = r.data && r.data._id;
    if (tBranch2) CREATED.locations.push(tBranch2);

    if (tBranch2) {
      rec(
        "adm.branch.setDefault",
        await callRetry("PUT", `/vendors/${tVendorId}/branches/${tBranch2}/default`, { token: adminToken }),
      );
      // wapas pehli branch ko default karo (aage ka flow usi pe based hai)
      await callRetry("PUT", `/vendors/${tVendorId}/branches/${tBranchId}/default`, { token: adminToken });
    }

    r = rec(
      "adm.area.create",
      await callRetry("POST", `/vendors/${tVendorId}/service-areas`, {
        token: adminToken,
        body: {
          locationId: tBranchId,
          areas: [
            {
              zipcode: "560001",
              city: "Bengaluru",
              district: "Bengaluru Urban",
              state: "Karnataka",
              country: "India",
              etaMinutes: 60,
              minOrderAmount: 0,
              freeDeliveryAbove: 4999,
            },
            {
              zipcode: "560002",
              city: "Bengaluru",
              district: "Bengaluru Urban",
              state: "Karnataka",
              etaMinutes: 90,
            },
          ],
        },
      }),
    );
    (r.data && r.data.areas ? r.data.areas : []).forEach((a) =>
      CREATED.vendorserviceareas.push(a._id),
    );

    // doosra temp vendor sirf reassign dikhane ke liye
    const v2Mobile = await freeMobile("9845098765", "vendor");
    const v2Email = await freeEmail("anjaneya.stores", "gmail.com", "vendor");
    r = await callRetry("POST", "/vendors/create", {
      token: adminToken,
      body: {
        shopName: "Anjaneya Stores",
        name: "Anjaneya",
        email: v2Email,
        mobile: v2Mobile,
        password: VPW,
        branch: {
          name: "Main Branch",
          address: "45, Residency Road",
          city: "Bengaluru",
          district: "Bengaluru Urban",
          state: "Karnataka",
          zipcode: "560003",
          coordinates: [12.9698, 77.6046],
        },
      },
    });
    const t2VendorId = r.data && r.data.vendor && r.data.vendor._id;
    const t2BranchId = r.data && r.data.branch && r.data.branch._id;
    if (t2VendorId) CREATED.users.push(t2VendorId);
    if (r.data && r.data.profile) CREATED.vendorprofiles.push(r.data.profile._id);
    if (t2BranchId) CREATED.locations.push(t2BranchId);

    if (t2VendorId && t2BranchId) {
      rec(
        "adm.area.reassign",
        await callRetry("PUT", "/service-areas/reassign", {
          token: adminToken,
          body: { zipcode: "560002", toVendorId: t2VendorId, toLocationId: t2BranchId },
        }),
      );
      const after = await db
        .collection("vendorserviceareas")
        .find({ zipcode: { $in: ["560001", "560002", "560003"] } })
        .toArray();
      after.forEach((a) => CREATED.vendorserviceareas.push(a._id));
    }

    r = await callRetry("GET", `/vendors/${tVendorId}/service-areas`, { token: adminToken });
    const tAreaId = r.data && r.data.data && r.data.data[0] && r.data.data[0]._id;

    rec(
      "adm.vendor.status",
      await callRetry("PUT", `/vendors/status/${tVendorId}`, {
        token: adminToken,
        body: { status: "SUSPENDED" },
      }),
    );
    await callRetry("PUT", `/vendors/status/${tVendorId}`, {
      token: adminToken,
      body: { status: "APPROVED" },
    });

    // ══════════════════════════════════════════════════════════
    hr("7. VENDOR — catalog writes (temp vendor ke andar)");

    r = await callRetry("POST", "/auth/login", {
      body: { type: "email", email: vEmail, password: VPW, role: "vendor", loginType: "password" },
    });
    const tVendorToken = r.data && r.data.token;

    rec(
      "vend.me.delivery",
      await callRetry("PUT", "/vendors/me/delivery", {
        token: tVendorToken,
        body: {
          isEnabled: true,
          baseCharge: 30,
          perKmRate: 5,
          perKgRate: 1.5,
          minDeliveryCharge: 40,
          baseMaxCharge: 150,
          maxPerKgIncrement: 1.2,
          maxPerKmIncrement: 4,
          freeDeliveryAbove: 4999,
          minOrderAmount: 0,
          maxRadiusKm: 12,
        },
      }),
    );

    r = rec(
      "vend.cat.create",
      await callRetry("POST", "/categories/create", {
        token: tVendorToken,
        form: {
          name: "Rice & Grains",
          description: "Basmati, sona masoori aur doosre chawal",
          isActive: "true",
        },
      }),
    );
    const tCatId = r.data && r.data._id;
    if (tCatId) CREATED.categories.push(tCatId);

    rec(
      "vend.cat.update",
      await callRetry("PUT", `/categories/update/${tCatId}`, {
        token: tVendorToken,
        form: {
          name: "Rice & Grains",
          description: "Basmati, sona masoori aur doosre chawal",
          isActive: "true",
        },
      }),
    );

    r = rec(
      "vend.sub.create",
      await callRetry("POST", `/subCategories/${tCatId}/create`, {
        token: tVendorToken,
        form: {
          name: "Basmati Rice",
          description: "Long grain basmati — 1kg se 25kg tak",
          isActive: "true",
        },
      }),
    );
    const tSubId = r.data && r.data._id;
    if (tSubId) CREATED.subcategories.push(tSubId);

    rec(
      "vend.sub.update",
      await callRetry("PUT", `/subCategories/update/${tSubId}`, {
        token: tVendorToken,
        form: {
          name: "Basmati Rice",
          description: "Long grain basmati — 1kg se 25kg tak",
          isActive: "true",
        },
      }),
    );

    r = rec(
      "vend.prod.create",
      await callRetry("POST", "/products/create", {
        token: tVendorToken,
        form: {
          name: "India Gate Classic Basmati Rice 5kg",
          brand: "India Gate",
          subCategoryId: tSubId,
          description: "Premium aged long grain basmati, 5kg pack",
          type: "grocery",
          generalPrice: "749",
          stockQuantity: "40",
          weightInKg: "5",
          isActive: "true",
        },
      }),
    );
    const tProdId = r.data && r.data._id;
    if (tProdId) CREATED.products.push(tProdId);

    rec(
      "vend.prod.update",
      await callRetry("PUT", `/products/update/${tProdId}`, {
        token: tVendorToken,
        form: { generalPrice: "799", stockQuantity: "25", isActive: "true", isOutOfStock: "false" },
      }),
    );

    // ══════════════════════════════════════════════════════════
    hr("8. CUSTOMER — poora order flow (temp customer)");

    const cMobile = await freeMobile("9845055555", "user");
    const cEmail = await freeEmail("ramesh.kulkarni", "gmail.com", "user");
    const CPW = "Ramesh@123";

    r = rec(
      "cust.auth.register",
      await callRetry("POST", "/auth/register", {
        body: {
          name: "Ramesh Kulkarni",
          email: cEmail,
          mobile: cMobile,
          password: CPW,
          loginType: "password",
        },
      }),
    );
    tCustId = r.data && r.data.user && r.data.user._id;
    const tCustToken = r.data && r.data.token;
    if (tCustId) CREATED.users.push(tCustId);

    rec(
      "cust.user.update",
      await callRetry("PUT", "/users/update", {
        token: tCustToken,
        form: { name: "Ramesh Kulkarni", dob: "1992-08-14" },
      }),
    );

    r = rec(
      "cust.loc.create",
      await callRetry("POST", "/locations/create", {
        token: tCustToken,
        body: {
          name: "Ghar",
          shopOrBuildingNumber: "12-B",
          area: "Jayanagar",
          address: "12-B, Shivam Residency, Jayanagar 4th Block",
          city: "Bengaluru",
          district: "Bengaluru Urban",
          state: "Karnataka",
          country: "India",
          zipcode: "560001",
          coordinates: [12.975, 77.6],
        },
      }),
    );
    const tLocId = r.data && r.data._id;
    if (tLocId) CREATED.locations.push(tLocId);

    // 🆕 upsert — is customer ka default address pehle se hai, isliye ye
    // UPDATE karega aur `created: false` dega. Yahi iska asli point hai:
    // dobara-dobara Save karne se naya doc nahi banta.
    rec(
      "cust.loc.upsert",
      await callRetry("PUT", "/locations/upsert", {
        token: tCustToken,
        body: {
          name: "Ghar",
          shopOrBuildingNumber: "12-B",
          area: "Jayanagar",
          address: "12-B, Shivam Residency, Jayanagar 4th Block",
          city: "Bengaluru",
          district: "Bengaluru Urban",
          state: "Karnataka",
          country: "India",
          zipcode: "560001",
          coordinates: [12.975, 77.6],
        },
      }),
    );

    rec(
      "cust.loc.update",
      await callRetry("PUT", `/locations/update/${tLocId}`, {
        token: tCustToken,
        body: {
          name: "Ghar",
          shopOrBuildingNumber: "14-A",
          address: "14-A, Shivam Residency, Jayanagar 4th Block",
        },
      }),
    );
    rec(
      "cust.loc.setDefault",
      await callRetry("PUT", `/locations/set-default/${tLocId}`, { token: tCustToken }),
    );

    rec(
      "cust.cart.add",
      await callRetry("POST", "/carts/add-or-update", {
        token: tCustToken,
        body: { productId: tProdId, quantity: 3 },
      }),
    );
    rec("cust.cart.get", await callRetry("GET", "/carts/get", { token: tCustToken }));
    rec(
      "cust.cart.remove",
      await callRetry("PUT", `/carts/remove/${tProdId}`, {
        token: tCustToken,
        body: { action: "decrease" },
      }),
    );
    rec(
      "cust.cart.verify",
      await callRetry("POST", "/carts/verify-delivery", {
        token: tCustToken,
        body: { locationId: tLocId },
      }),
    );
    rec(
      "cust.order.preview",
      await callRetry("POST", "/orders/preview", { token: tCustToken, body: { locationId: tLocId } }),
    );

    // ── order 1 — poora happy path ────────────────────────────
    r = rec(
      "cust.order.create",
      await callRetry("POST", "/orders/create", {
        token: tCustToken,
        body: { locationId: tLocId, paymentMethod: "COD" },
      }),
    );
    const order1 = r.data && (r.data.orderId || r.data._id);
    if (order1) CREATED.orders.push(order1);
    if (r.data && r.data.cartId) CREATED.carts.push(r.data.cartId);
    if (!order1) throw new Error("order1 nahi bana — aage ka flow nahi chalega");

    rec("cust.order.get", await callRetry("GET", `/orders/get/${order1}`, { token: tCustToken }));

    rec(
      "vend.order.accept",
      await callRetry("PUT", `/orders/${order1}/status`, {
        token: tVendorToken,
        body: { status: "ACCEPTED", note: "Order confirm, packing shuru" },
      }),
    );
    rec(
      "vend.order.pack",
      await callRetry("PUT", `/orders/${order1}/status`, {
        token: tVendorToken,
        body: { status: "PACKED", note: "3 items pack ho gaye" },
      }),
    );
    rec(
      "vend.order.out",
      await callRetry("PUT", `/orders/${order1}/status`, {
        token: tVendorToken,
        body: { status: "OUT_FOR_DELIVERY", note: "Delivery ke liye nikal gaya" },
      }),
    );
    rec(
      "vend.order.delivered",
      await callRetry("PUT", `/orders/${order1}/status`, {
        token: tVendorToken,
        body: { status: "DELIVERED", note: "Cash mil gaya" },
      }),
    );

    // ── order 2 — vendor reject ───────────────────────────────
    await callRetry("POST", "/carts/add-or-update", {
      token: tCustToken,
      body: { productId: tProdId, quantity: 1 },
    });
    await callRetry("POST", "/carts/verify-delivery", { token: tCustToken, body: { locationId: tLocId } });
    r = await callRetry("POST", "/orders/create", {
      token: tCustToken,
      body: { locationId: tLocId, paymentMethod: "COD" },
    });
    const order2 = r.data && (r.data.orderId || r.data._id);
    if (order2) {
      CREATED.orders.push(order2);
      if (r.data.cartId) CREATED.carts.push(r.data.cartId);
      rec(
        "vend.order.reject",
        await callRetry("PUT", `/orders/${order2}/status`, {
          token: tVendorToken,
          body: { status: "REJECTED", reason: "Stock khatam ho gaya, sorry" },
        }),
      );
    }

    // ── order 3 — customer cancel ─────────────────────────────
    await callRetry("POST", "/carts/add-or-update", {
      token: tCustToken,
      body: { productId: tProdId, quantity: 1 },
    });
    await callRetry("POST", "/carts/verify-delivery", { token: tCustToken, body: { locationId: tLocId } });
    r = await callRetry("POST", "/orders/create", {
      token: tCustToken,
      body: { locationId: tLocId, paymentMethod: "COD" },
    });
    const order3 = r.data && (r.data.orderId || r.data._id);
    if (order3) {
      CREATED.orders.push(order3);
      if (r.data.cartId) CREATED.carts.push(r.data.cartId);
      rec(
        "cust.order.cancel",
        await callRetry("PUT", `/orders/${order3}/cancel`, {
          token: tCustToken,
          body: { reason: "Galti se order ho gaya tha" },
        }),
      );
    }

    // ── cart clear + address delete (aakhri me) ───────────────
    await callRetry("POST", "/carts/add-or-update", {
      token: tCustToken,
      body: { productId: tProdId, quantity: 1 },
    });
    rec("cust.cart.clear", await callRetry("DELETE", "/carts/clear", { token: tCustToken }));
    rec(
      "cust.loc.delete",
      await callRetry("DELETE", `/locations/delete/${tLocId}`, { token: tCustToken }),
    );

    // ══════════════════════════════════════════════════════════
    hr("9. DELETE endpoints (temp data pe)");

    rec(
      "vend.prod.delete",
      await callRetry("DELETE", `/products/delete/${tProdId}`, { token: tVendorToken }),
    );
    rec(
      "vend.sub.delete",
      await callRetry("DELETE", `/subCategories/delete/${tSubId}`, { token: tVendorToken }),
    );
    rec(
      "vend.cat.delete",
      await callRetry("DELETE", `/categories/delete/${tCatId}`, { token: tVendorToken }),
    );
    if (tAreaId) {
      rec(
        "adm.area.delete",
        await callRetry("DELETE", `/vendors/${tVendorId}/service-areas/${tAreaId}`, {
          token: adminToken,
        }),
      );
    }
    if (bannerId) {
      rec("adm.banner.delete", await callRetry("DELETE", `/banners/delete/${bannerId}`, { token: adminToken }));
    }
    if (termId) {
      rec(
        "adm.terms.delete",
        await callRetry("DELETE", `/terms-and-conditions/delete/${termId}`, { token: adminToken }),
      );
    }
    if (privacyId) {
      rec(
        "adm.privacy.delete",
        await callRetry("DELETE", `/privacy-and-policies/delete/${privacyId}`, { token: adminToken }),
      );
    }
  } finally {
    // ══════════════════════════════════════════════════════════
    server.close();

    if (!KEEP) {
      hr("10. CLEANUP — temp data hata rahe hain");
      const { ObjectId } = mongoose.Types;
      let removed = 0;
      for (const [coll, ids] of Object.entries(CREATED)) {
        if (!ids.length) continue;
        const uniq = [...new Set(ids.map(String))];
        const res = await db
          .collection(coll)
          .deleteMany({ _id: { $in: uniq.map((i) => new ObjectId(i)) } });
        removed += res.deletedCount;
        console.log(`  🧹 ${coll.padEnd(22)} ${res.deletedCount}`);
      }
      // temp customer ke baaki docs — carts/orders order flow me apne aap
      // bante hain, isliye unhe userId se dhoondh ke hatana padta hai
      if (tCustId) {
        const uid = new ObjectId(String(tCustId));
        for (const coll of ["carts", "locations", "orders"]) {
          const res = await db.collection(coll).deleteMany({ userId: uid });
          if (res.deletedCount) {
            removed += res.deletedCount;
            console.log(`  🧹 ${(coll + " (by user)").padEnd(22)} ${res.deletedCount}`);
          }
        }
      }

      // orderNumber counter wapas wahi jahan tha — stage me gap na rahe
      if (seqBefore !== null) {
        await db.collection("counters").updateOne({ _id: ymKey }, { $set: { seq: seqBefore } });
        console.log(`  🧹 ${ymKey.padEnd(22)} seq → ${seqBefore}`);
      }
      console.log(`\n  total ${removed} temp docs hataye`);
    } else {
      console.log("\n  ⚠️  --keep diya hai, temp data DB me pada hai");
    }

    fs.writeFileSync(OUT, JSON.stringify(REC, null, 2));
    console.log(`\n📄 ${path.relative(process.cwd(), OUT)}  →  ${Object.keys(REC).length} examples`);
    console.log(`   ✅ ${captured} capture hue   ❌ ${missed} fail`);
    if (problems.length) {
      console.log("\n   Problems:");
      problems.forEach((p) => console.log(`     • ${p}`));
    }
    await mongoose.disconnect();
  }
};

run().catch(async (e) => {
  console.error("\n💥", e.message);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
