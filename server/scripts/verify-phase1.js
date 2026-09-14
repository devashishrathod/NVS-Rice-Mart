/* eslint-disable no-console */
/** Phase 1 verification — koi DB connection nahi. */
process.env.JWT_SECRET = process.env.JWT_SECRET || "test";
const mongoose = require("mongoose");

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}  ${extra}`);
  }
};
const throws = (fn) => {
  try {
    fn();
    return null;
  } catch (e) {
    return e;
  }
};
const hr = (t) =>
  console.log(`\n── ${t} ${"─".repeat(Math.max(0, 60 - t.length))}`);

const A = new mongoose.Types.ObjectId().toString();
const B = new mongoose.Types.ObjectId().toString();

// ═══════════════════════════════════════════════════════════
hr("Models");
const VendorProfile = require("../models/VendorProfile");
const VendorServiceArea = require("../models/VendorServiceArea");
const Location = require("../models/Location");
const { LOCATION_TYPES, VENDOR_STATUS } = require("../constants");

const idx = (m) => m.schema.indexes();
const hasIdx = (m, keyPart, opt) =>
  idx(m).some(
    ([k, o]) =>
      JSON.stringify(k).includes(keyPart) && (!opt || o?.[opt] === true),
  );

ok("VendorProfile model loads", !!VendorProfile);
ok("VendorServiceArea model loads", !!VendorServiceArea);
ok(
  "VendorProfile.status enum = APPROVED|SUSPENDED",
  JSON.stringify(VendorProfile.schema.path("status").enumValues) ===
    JSON.stringify(Object.values(VENDOR_STATUS)),
);
ok(
  "VendorProfile me `isOpen` NAHI hai (D9 — shop-closed concept nahi)",
  !VendorProfile.schema.path("isOpen"),
);
// 🔑 Delivery defaults — values bhari hui, par switch OFF
const { DEFAULT_VENDOR_DELIVERY } = require("../constants");
const vpDefaults = new VendorProfile({ vendorId: A, shopName: "x" }).delivery;

ok("🔑 delivery.isEnabled default FALSE (master switch)", vpDefaults.isEnabled === false);
ok("baseCharge default 30", vpDefaults.baseCharge === 30);
ok("perKmRate default 5", vpDefaults.perKmRate === 5);
ok("perKgRate default 1.5", vpDefaults.perKgRate === 1.5);
ok("minDeliveryCharge default 40", vpDefaults.minDeliveryCharge === 40);
ok("baseMaxCharge default 150", vpDefaults.baseMaxCharge === 150);
ok("maxPerKgIncrement default 1.2", vpDefaults.maxPerKgIncrement === 1.2);
ok("maxPerKmIncrement default 4", vpDefaults.maxPerKmIncrement === 4);
ok(
  "🔑 freeDeliveryAbove default NULL, 0 nahi (0 hota to SAB free)",
  vpDefaults.freeDeliveryAbove === null,
);
ok("minOrderAmount default 0 (koi minimum nahi)", vpDefaults.minOrderAmount === 0);
ok("maxRadiusKm default null (platform ka 50km lagega)", vpDefaults.maxRadiusKm === null);
ok(
  "defaults constants se aate hain (ek hi source of truth)",
  vpDefaults.baseCharge === DEFAULT_VENDOR_DELIVERY.baseCharge &&
    vpDefaults.perKmRate === DEFAULT_VENDOR_DELIVERY.perKmRate,
);

// 🔑 Sabse zaroori: values bhari hain PAR charge phir bhi 0
const {
  calculateDeliveryCharges,
} = require("../helpers/orders/calculateDeliveryCharges");
ok(
  "🔑 defaults se calculate karo to ₹84 nikalta hai (26kg/3km)...",
  calculateDeliveryCharges(26, 3, vpDefaults.toObject()) === 84,
);
ok(
  "...par isEnabled false hai, isliye customer ko ₹0 hi lagega",
  vpDefaults.isEnabled === false,
);

// 🔑 D1 ka core guarantee
const zipIdx = idx(VendorServiceArea).find(
  ([k]) => JSON.stringify(k) === '{"zipcode":1}',
);
ok("VendorServiceArea me { zipcode } index hai", !!zipIdx);
ok("...aur wo UNIQUE hai (D1 exclusive territory)", zipIdx?.[1]?.unique === true);
ok(
  "...aur partial hai (soft-deleted row pincode block na kare)",
  JSON.stringify(zipIdx?.[1]?.partialFilterExpression) === '{"isDeleted":false}',
);
ok(
  "VendorServiceArea { vendorId, isActive, isDeleted } index",
  hasIdx(VendorServiceArea, '"vendorId":1'),
);

ok("Location me `type` field hai", !!Location.schema.path("type"));
ok(
  "Location.type enum = CUSTOMER|VENDOR_BRANCH",
  JSON.stringify(Location.schema.path("type").enumValues) ===
    JSON.stringify(Object.values(LOCATION_TYPES)),
);
ok(
  "Location.type default CUSTOMER (purane 143 docs safe)",
  Location.schema.path("type").defaultValue === LOCATION_TYPES.CUSTOMER,
);
// Dead fields — schema me hone hi nahi chahiye (koi writer/reader nahi tha)
ok("🗑️ Location.geo hata diya", !Location.schema.path("geo.coordinates"));
ok("🗑️ Location.isVendorAddress hata diya", !Location.schema.path("isVendorAddress"));
ok("🗑️ Location.isProductAddress hata diya", !Location.schema.path("isProductAddress"));
ok(
  "🗑️ User.address hata diya (address Location me hai)",
  !require("../models/User").schema.path("address"),
);
const SettingM = require("../models/Setting");
ok("🗑️ Setting.delivery.shopLocationId hata diya", !SettingM.schema.path("delivery.shopLocationId"));
ok("🗑️ Setting.delivery.baseCharge hata diya", !SettingM.schema.path("delivery.baseCharge"));
ok("Setting me sirf platform caps bache", !!SettingM.schema.path("delivery.maxRadiusKm") &&
  !!SettingM.schema.path("delivery.maxAllowedDeliveryCharge"));
ok(
  "Location ka galat `location_2dsphere` schema me nahi hai",
  !idx(Location).some(([k]) => JSON.stringify(k).includes('"location"')),
);
ok(
  "Location { userId, type, isDeleted, isDefault } index",
  hasIdx(Location, '"type":1'),
);

// ═══════════════════════════════════════════════════════════
hr("TtlCache (scalability layer)");
const { TtlCache } = require("../utils/ttlCache");
const c = new TtlCache({ ttlMs: 50, maxEntries: 3 });

c.set("a", { v: 1 });
ok("set → get", c.get("a")?.v === 1);
ok("missing key → undefined", c.get("nope") === undefined);
c.set("n", null);
ok("null value bhi cache hota hai (negative caching)", c.get("n") === null);
c.del("a");
ok("del works", c.get("a") === undefined);

c.clear();
c.set("x1", 1);
c.set("x2", 2);
c.set("x3", 3);
c.set("x4", 4); // maxEntries 3 → sabse purani nikle
ok(`maxEntries evict (size=${c.store.size})`, c.store.size <= 3);
ok("naya key bacha", c.get("x4") === 4);

c.clear();
c.set("sa:577001", 1);
c.set("sa:577002", 2);
c.set("other", 3);
c.delByPrefix("sa:");
ok(
  "delByPrefix sirf prefix wale hatata hai",
  c.get("sa:577001") === undefined &&
    c.get("sa:577002") === undefined &&
    c.get("other") === 3,
);

const stats = c.stats();
ok(`stats() deta hai (hitRate ${stats.hitRate}%)`, typeof stats.hitRate === "number");

// expiry (async)
const expiryCheck = new Promise((resolve) => {
  const t = new TtlCache({ ttlMs: 30 });
  t.set("k", "v");
  setTimeout(() => resolve(t.get("k") === undefined), 60);
});

// ═══════════════════════════════════════════════════════════
hr("pagination — throwOnEmpty option");
const { pagination } = require("../utils/pagination");
const fakeModel = (rows) => ({
  modelName: "Fake",
  aggregate: async () => [{ data: rows, totalCount: rows.length }],
});
(async () => {
  const empty = await pagination(fakeModel([]), [], 1, 10, {
    throwOnEmpty: false,
  });
  ok(
    "khali result + throwOnEmpty:false → 200 shape",
    empty.total === 0 && Array.isArray(empty.data) && empty.data.length === 0,
  );
  const e = await pagination(fakeModel([]), [], 1, 10).catch((err) => err);
  ok("default (throwOnEmpty:true) abhi bhi 404 karta hai", e?.statusCode === 404);
  const full = await pagination(fakeModel([{ a: 1 }]), [], 1, 10, {
    throwOnEmpty: false,
  });
  ok("bhare result pe normal shape", full.total === 1 && full.totalPages === 1);

  // ═════════════════════════════════════════════════════════
  hr("Validators");
  const {
    validateCreateVendor,
    validateUpdateVendorStatus,
  } = require("../validator/vendors");
  const {
    validateAddServiceAreas,
    validateReassignServiceArea,
  } = require("../validator/serviceAreas");

  const goodVendor = {
    shopName: "Nagraj Mart",
    email: "nagraj@gmail.com",
    mobile: "8210574144",
    password: "nagraj@123",
    branch: {
      address: "vittal mandir road",
      city: "davangere",
      district: "davangere",
      state: "karnataka",
      zipcode: "577001",
      coordinates: [14.464, 75.922],
    },
  };
  ok("valid vendor payload", !validateCreateVendor(goodVendor).error);
  ok(
    "branch ke bina → error",
    !!validateCreateVendor({ ...goodVendor, branch: undefined }).error,
  );
  ok(
    "email+mobile dono na ho → error",
    !!validateCreateVendor({ ...goodVendor, email: undefined, mobile: undefined })
      .error,
  );
  ok(
    "coordinates 2 se kam → error",
    !!validateCreateVendor({
      ...goodVendor,
      branch: { ...goodVendor.branch, coordinates: [14.4] },
    }).error,
  );
  ok(
    "chhota password → error",
    !!validateCreateVendor({ ...goodVendor, password: "123" }).error,
  );
  ok(
    "unknown field strip hota hai",
    validateCreateVendor({ ...goodVendor, role: "admin" }).value.role ===
      undefined,
  );
  ok(
    "status APPROVED valid",
    !validateUpdateVendorStatus({ status: "APPROVED" }).error,
  );
  ok(
    "status BANANA invalid",
    !!validateUpdateVendorStatus({ status: "BANANA" }).error,
  );

  ok(
    "service areas array valid",
    !validateAddServiceAreas({
      locationId: A,
      areas: [{ zipcode: "577001" }, { zipcode: "577002", etaMinutes: 120 }],
    }).error,
  );
  ok(
    "single area object bhi valid",
    !validateAddServiceAreas({ locationId: A, areas: { zipcode: "577001" } })
      .error,
  );
  ok(
    "locationId ke bina → error",
    !!validateAddServiceAreas({ areas: [{ zipcode: "577001" }] }).error,
  );
  ok(
    "khali areas array → error",
    !!validateAddServiceAreas({ locationId: A, areas: [] }).error,
  );
  ok(
    "reassign payload valid",
    !validateReassignServiceArea({
      zipcode: "577002",
      toVendorId: A,
      toLocationId: B,
    }).error,
  );
  ok(
    "reassign bina toVendorId → error",
    !!validateReassignServiceArea({ zipcode: "577002", toLocationId: B }).error,
  );

  // ═════════════════════════════════════════════════════════
  hr("Route guards");
  const MW = require("../middlewares");
  const GUARD = new Map([
    [MW.verifyJwtToken, "verifyJwtToken"],
    [MW.isAdmin, "isAdmin"],
    [MW.isVendor, "isVendor"],
    [MW.isUser, "isUser"],
  ]);
  const collect = (file) => {
    const mod = require(`../routes/${file}`);
    const r = mod.router || mod;
    return (r.stack || [])
      .filter((l) => l.route)
      .map((l) => ({
        method: Object.keys(l.route.methods)[0]?.toUpperCase(),
        path: `/${file.replace(/\.js$/, "")}${l.route.path}`,
        guards: l.route.stack.map((s) => GUARD.get(s.handle)).filter(Boolean),
      }));
  };
  const routes = [...collect("vendors.js"), ...collect("service-areas.js")];
  const g = (method, path, expected) => {
    const r = routes.find((x) => x.method === method && x.path === path);
    if (!r) return ok(`${method} ${path}`, false, "ROUTE NOT FOUND");
    ok(
      `${method} ${path} → ${expected}`,
      r.guards.includes(expected),
      `got [${r.guards.join(", ") || "NONE"}]`,
    );
  };

  g("POST", "/vendors/create", "isAdmin");
  g("GET", "/vendors/getAll", "isAdmin");
  g("PUT", "/vendors/update/:id", "isAdmin");
  g("PUT", "/vendors/status/:id", "isAdmin");
  g("POST", "/vendors/:id/branches", "isAdmin");
  g("PUT", "/vendors/:id/branches/:locationId/default", "isAdmin");
  g("POST", "/vendors/:id/service-areas", "isAdmin");
  g("DELETE", "/vendors/:id/service-areas/:areaId", "isAdmin");
  g("GET", "/vendors/get/:id", "verifyJwtToken");
  g("GET", "/vendors/:id/branches", "verifyJwtToken");
  g("GET", "/vendors/:id/service-areas", "verifyJwtToken");
  g("GET", "/service-areas/check", "verifyJwtToken");
  g("GET", "/service-areas/lookup", "isAdmin");
  g("PUT", "/service-areas/reassign", "isAdmin");

  ok(
    "koi vendor/service-area route bina guard ke nahi",
    routes.every((r) => r.guards.length > 0),
    routes.filter((r) => !r.guards.length).map((r) => r.path).join(", "),
  );
  console.log(`     (routes scanned: ${routes.length})`);

  // ═════════════════════════════════════════════════════════
  hr("Services wiring");
  const sa = require("../services/serviceAreas");
  const v = require("../services/vendors");
  [
    "resolveServiceContext",
    "lookupVendorForPincode",
    "invalidateServiceAreaCache",
    "addServiceAreas",
    "getServiceAreas",
    "removeServiceArea",
    "lookupServiceArea",
    "reassignServiceArea",
    "checkServiceability",
  ].forEach((f) => ok(`serviceAreas.${f} exported`, typeof sa[f] === "function"));
  [
    "createVendor",
    "getAllVendors",
    "getVendor",
    "updateVendor",
    "updateVendorStatus",
    "getBranches",
    "createBranch",
    "setDefaultBranch",
  ].forEach((f) => ok(`vendors.${f} exported`, typeof v[f] === "function"));

  hr("Error codes");
  const { ERROR_CODES } = require("../constants");
  [
    "PINCODE_REQUIRED",
    "PINCODE_NOT_SERVICEABLE",
    "PINCODE_ALREADY_ASSIGNED",
  ].forEach((k) => ok(`ERROR_CODES.${k}`, !!ERROR_CODES[k]));

  const { CustomError } = require("../utils");
  const err = new CustomError(409, "msg", ERROR_CODES.PINCODE_ALREADY_ASSIGNED, {
    conflicts: [],
  });
  ok("CustomError code carry karta hai", err.code === "PINCODE_ALREADY_ASSIGNED");
  ok("CustomError data carry karta hai", Array.isArray(err.data.conflicts));

  hr("Cache expiry");
  ok("TTL expire hone pe entry hat jati hai", await expiryCheck);

  console.log(`\n${"=".repeat(64)}`);
  console.log(`  PASS: ${pass}    FAIL: ${fail}`);
  console.log("=".repeat(64));
  process.exit(fail ? 1 : 0);
})();
