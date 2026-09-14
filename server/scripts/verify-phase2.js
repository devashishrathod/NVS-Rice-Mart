/* eslint-disable no-console */
/** Phase 2 verification — koi DB connection nahi. */
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
const hr = (t) =>
  console.log(`\n── ${t} ${"─".repeat(Math.max(0, 60 - t.length))}`);

const V1 = new mongoose.Types.ObjectId();
const V2 = new mongoose.Types.ObjectId();

// ═══════════════════════════════════════════════════════════
hr("applyServiceScope");
const { applyServiceScope } = require("../services/serviceAreas/applyServiceScope");

const cust = { mode: "CUSTOMER", vendorIds: [V1], activeOnly: true };
const vend = { mode: "VENDOR", vendorIds: [V2], activeOnly: false };
const adm = { mode: "ADMIN", vendorIds: null, activeOnly: false };

let m = applyServiceScope({ isDeleted: false }, cust);
ok("customer → userId $in [vendor]", String(m.userId.$in[0]) === String(V1));
ok("customer → isActive: true force", m.isActive === true);
ok("customer → isDeleted: false force", m.isDeleted === false);

m = applyServiceScope({ isDeleted: false }, vend);
ok("vendor → apna userId", String(m.userId.$in[0]) === String(V2));
ok("vendor → isActive force NAHI (inactive bhi manage kar sake)", m.isActive === undefined);

m = applyServiceScope({ isDeleted: false }, adm);
ok("admin → koi userId filter nahi", m.userId === undefined);

m = applyServiceScope({ userId: new mongoose.Types.ObjectId(V2) }, cust);
ok(
  "🔒 client ka ?userId= scope se OVERRIDE hota hai",
  String(m.userId.$in?.[0]) === String(V1),
);

m = applyServiceScope({ isDeleted: false }, undefined);
ok("ctx ke bina match untouched", m.userId === undefined && m.isActive === undefined);

// admin + explicit vendorId
m = applyServiceScope({}, { mode: "ADMIN", vendorIds: [V2], activeOnly: false });
ok("admin + ?vendorId → us vendor pe filter", String(m.userId.$in[0]) === String(V2));

// ═══════════════════════════════════════════════════════════
hr("attachServiceContext — role branching (DB ke bina)");
const { attachServiceContext } = require("../middlewares/attachServiceContext");
const { ROLES } = require("../constants");

const runMw = (req) =>
  new Promise((resolve) => {
    const res = {};
    attachServiceContext(req, res, (err) => resolve(err));
  });

(async () => {
  let req = { role: ROLES.VENDOR, userId: V1, query: {} };
  await runMw(req);
  ok("vendor → mode VENDOR", req.serviceContext?.mode === "VENDOR");
  ok("vendor → vendorIds = [self]", String(req.serviceContext.vendorIds[0]) === String(V1));
  ok("vendor → activeOnly false", req.serviceContext.activeOnly === false);

  req = { role: ROLES.ADMIN, userId: V1, query: {} };
  await runMw(req);
  ok("admin → mode ADMIN", req.serviceContext?.mode === "ADMIN");
  ok("admin → vendorIds null (no filter)", req.serviceContext.vendorIds === null);

  req = { role: ROLES.ADMIN, userId: V1, query: { vendorId: String(V2) } };
  await runMw(req);
  ok(
    "admin + ?vendorId → us vendor pe filter",
    String(req.serviceContext.vendorIds?.[0]) === String(V2),
  );

  req = { role: ROLES.ADMIN, userId: V1, query: { vendorId: "not-an-id" } };
  await runMw(req);
  ok("admin + galat vendorId → ignore (null)", req.serviceContext.vendorIds === null);

  req = { role: ROLES.STAFF, userId: V1, query: {} };
  await runMw(req);
  ok("staff → ADMIN jaisa", req.serviceContext?.mode === "ADMIN");

  // ═════════════════════════════════════════════════════════
  hr("Service signatures (query, serviceContext)");
  const { getAllCategories } = require("../services/categories");
  const { getAllSubCategories } = require("../services/subCategories");
  const { getAllProducts } = require("../services/products");
  const { getProduct } = require("../services/products");
  const { getCategoryById } = require("../services/categories");
  const { getSubCategoryById } = require("../services/subCategories");

  ok("getAllCategories 2 args leta hai", getAllCategories.length === 2);
  ok("getAllSubCategories 2 args leta hai", getAllSubCategories.length === 2);
  ok("getAllProducts 2 args leta hai", getAllProducts.length === 2);
  ok("getProduct 2 args leta hai", getProduct.length === 2);
  ok("getCategoryById 2 args leta hai", getCategoryById.length === 2);
  ok("getSubCategoryById 2 args leta hai", getSubCategoryById.length === 2);

  // ═════════════════════════════════════════════════════════
  hr("throwOnEmpty — customer ko 200, baakiyon ko 404");
  // services ko fake model chahiye, isliye pagination ko seedha test kar rahe hain
  const { pagination } = require("../utils/pagination");
  const fake = { modelName: "Product", aggregate: async () => [{ data: [], totalCount: 0 }] };
  const custMode = await pagination(fake, [], 1, 10, { throwOnEmpty: false });
  ok("customer mode → 200 + empty array", custMode.total === 0 && custMode.data.length === 0);
  const e = await pagination(fake, [], 1, 10, { throwOnEmpty: true }).catch((x) => x);
  ok("admin/vendor mode → 404 (purana behaviour)", e?.statusCode === 404);

  // ═════════════════════════════════════════════════════════
  hr("Route wiring — attachServiceContext lagaya hai?");
  const MW = require("../middlewares");
  const NAME = new Map([
    [MW.verifyJwtToken, "verifyJwtToken"],
    [MW.isAdmin, "isAdmin"],
    [MW.isVendor, "isVendor"],
    [MW.isUser, "isUser"],
    [MW.attachServiceContext, "attachServiceContext"],
  ]);
  const collect = (file) => {
    const mod = require(`../routes/${file}`);
    const r = mod.router || mod;
    return (r.stack || [])
      .filter((l) => l.route)
      .map((l) => ({
        method: Object.keys(l.route.methods)[0]?.toUpperCase(),
        path: `/${file.replace(/\.js$/, "")}${l.route.path}`,
        mws: l.route.stack.map((s) => NAME.get(s.handle)).filter(Boolean),
      }));
  };
  const routes = [
    ...collect("categories.js"),
    ...collect("subCategories.js"),
    ...collect("products.js"),
  ];
  const has = (method, path, mw) => {
    const r = routes.find((x) => x.method === method && x.path === path);
    if (!r) return ok(`${method} ${path}`, false, "ROUTE NOT FOUND");
    ok(`${method} ${path} → ${mw}`, r.mws.includes(mw), `got [${r.mws.join(", ")}]`);
  };

  has("GET", "/categories/getAll", "attachServiceContext");
  has("GET", "/categories/get/:id", "attachServiceContext");
  has("GET", "/subCategories/getAll", "attachServiceContext");
  has("GET", "/subCategories/get/:id", "attachServiceContext");
  has("GET", "/products/getAll", "attachServiceContext");
  has("GET", "/products/get/:id", "attachServiceContext");

  // order matters — verifyJwtToken pehle (req.role chahiye)
  const orderOk = ["/categories/getAll", "/subCategories/getAll", "/products/getAll"].every(
    (p) => {
      const r = routes.find((x) => x.path === p);
      return (
        r.mws.indexOf("verifyJwtToken") >= 0 &&
        r.mws.indexOf("verifyJwtToken") < r.mws.indexOf("attachServiceContext")
      );
    },
  );
  ok("verifyJwtToken HAMESHA attachServiceContext se pehle", orderOk);

  // write routes pe context nahi lagna chahiye
  const writeNoCtx = routes
    .filter((r) => ["POST", "PUT", "DELETE"].includes(r.method))
    .every((r) => !r.mws.includes("attachServiceContext"));
  ok("write routes (POST/PUT/DELETE) pe context nahi lagaya", writeNoCtx);

  // ═════════════════════════════════════════════════════════
  hr("Validators — naye query params");
  const { validateGetAllCategoriesQuery } = require("../validator/categories");
  const { validateGetAllSubCategoriesQuery } = require("../validator/subCategories");
  const { validateGetAllProductsQuery } = require("../validator/products");
  const q = { zipcode: "577004", locationId: String(V1), vendorId: String(V2) };
  ok("categories: zipcode/locationId/vendorId accept", !validateGetAllCategoriesQuery(q).error);
  ok("subCategories: zipcode/locationId/vendorId accept", !validateGetAllSubCategoriesQuery(q).error);
  ok("products: zipcode/locationId/vendorId accept", !validateGetAllProductsQuery(q).error);
  ok(
    "galat locationId → 422",
    !!validateGetAllProductsQuery({ locationId: "abc" }).error,
  );

  // ═════════════════════════════════════════════════════════
  hr("Error codes");
  const { ERROR_CODES } = require("../constants");
  ok("PRODUCT_NOT_AVAILABLE_HERE exists", !!ERROR_CODES.PRODUCT_NOT_AVAILABLE_HERE);
  ok("PINCODE_REQUIRED exists", !!ERROR_CODES.PINCODE_REQUIRED);
  ok("PINCODE_NOT_SERVICEABLE exists", !!ERROR_CODES.PINCODE_NOT_SERVICEABLE);

  hr("Layering");
  const fs = require("fs");
  const path = require("path");
  const svcFiles = [
    "services/categories/getAllCategories.js",
    "services/subCategories/getAllSubCategories.js",
    "services/products/getAllProducts.js",
  ];
  const leaks = svcFiles.filter((f) =>
    fs.readFileSync(path.join(__dirname, "..", f), "utf8").includes("middlewares/"),
  );
  ok(
    "services middlewares se import nahi karte (layering sahi)",
    leaks.length === 0,
    leaks.join(", "),
  );

  console.log(`\n${"=".repeat(64)}`);
  console.log(`  PASS: ${pass}    FAIL: ${fail}`);
  console.log("=".repeat(64));
  process.exit(fail ? 1 : 0);
})();
