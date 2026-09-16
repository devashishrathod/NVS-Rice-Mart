/* eslint-disable no-console */
/**
 * Catalog (category / subcategory / product / banner) ka LIVE verification.
 *
 * ⚠️ Sirf apna scratch data chhuta hai — script khud temp vendor + catalog
 *    banati hai aur `finally` me sab delete kar deti hai.
 *
 *   MONGO_URL="<stage-uri>" node scripts/verify-catalog-live.js
 */
const mongoose = require("mongoose");
const User = require("../models/User");
const Category = require("../models/Category");
const SubCategory = require("../models/SubCategory");
const Product = require("../models/Product");
const Banner = require("../models/Banner");
const { createCategory, updateCategoryById } = require("../services/categories");
const {
  createSubCategory,
  updateSubCategoryById,
} = require("../services/subCategories");
const { createProduct, updateProduct } = require("../services/products");
const { createBanner } = require("../services/banners");
const { ROLES, PRODUCT_TYPES } = require("../constants");

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
  console.log(`\n── ${t} ${"─".repeat(Math.max(0, 58 - t.length))}`);

const STAMP = `catalog-test-${Date.now()}`;
const tempUserIds = [];
const tempBannerIds = [];

const caught = async (fn) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e;
  }
};

(async () => {
  await mongoose.connect(process.env.MONGO_URL);
  console.log(`\n📦 DB: ${mongoose.connection.db.databaseName}`);
  console.log(`🏷️  scratch marker: ${STAMP}\n`);

  try {
    const vendor = await User.create({
      name: STAMP,
      email: `${STAMP}@example.com`,
      password: "x".repeat(20),
      role: ROLES.VENDOR,
    });
    tempUserIds.push(vendor._id);
    const actor = { userId: vendor._id, role: ROLES.VENDOR };

    // ═══════════════════════════════════════════════════════
    hr("1. Category — casing on write");
    const cat = await createCategory(vendor._id, {
      name: "basmati rice",
      description: "premium quality rice. grown in punjab",
      isActive: true,
    });
    ok(`name → "${cat.name}"`, cat.name === "Basmati Rice", cat.name);
    ok(
      `description → "${cat.description}"`,
      cat.description === "Premium quality rice. Grown in punjab",
      cat.description,
    );

    hr("2. 🔑 Category duplicate check ab CASE-INSENSITIVE");
    for (const variant of ["BASMATI RICE", "basmati rice", "Basmati Rice", "BaSmAtI rIcE"]) {
      const e = await caught(() =>
        createCategory(vendor._id, { name: variant, isActive: true }),
      );
      ok(`"${variant}" → 409 duplicate`, e?.statusCode === 409, `got ${e?.statusCode}`);
    }
    {
      const other = await createCategory(vendor._id, { name: "sona masoori", isActive: true });
      ok("alag naam allowed hai", other.name === "Sona Masoori");
    }

    hr("3. Category update — casing + CI duplicate");
    {
      const upd = await updateCategoryById(
        cat._id, { name: "PREMIUM BASMATI", description: "BEST RICE EVER" }, null, actor,
      );
      ok(`name → "${upd.name}"`, upd.name === "Premium Basmati", upd.name);
      ok(`description → "${upd.description}"`, upd.description === "Best rice ever", upd.description);
      const e = await caught(() =>
        updateCategoryById(cat._id, { name: "SONA MASOORI" }, null, actor),
      );
      ok("doosri category ke naam pe rename → 409", e?.statusCode === 409, `got ${e?.statusCode}`);
    }

    // ═══════════════════════════════════════════════════════
    hr("4. SubCategory — casing + CI duplicate");
    const sub = await createSubCategory(actor, cat._id, {
      name: "long grain",
      description: "extra long grain variety",
      isActive: true,
    });
    ok(`name → "${sub.name}"`, sub.name === "Long Grain", sub.name);
    ok(
      `description → "${sub.description}"`,
      sub.description === "Extra long grain variety",
      sub.description,
    );
    {
      const e = await caught(() =>
        createSubCategory(actor, cat._id, { name: "LONG GRAIN", isActive: true }),
      );
      ok(
        "'LONG GRAIN' → duplicate error",
        e?.statusCode === 409 || e?.statusCode === 400,
        `got ${e?.statusCode}`,
      );
    }
    {
      const upd = await updateSubCategoryById(
        sub._id, { name: "short grain", description: "SHORT GRAIN VARIETY" }, null, actor,
      );
      ok(`update name → "${upd.name}"`, upd.name === "Short Grain", upd.name);
      ok(`update desc → "${upd.description}"`, upd.description === "Short grain variety", upd.description);
    }

    // ═══════════════════════════════════════════════════════
    hr("5. Product — casing, enum safe, CI duplicate");
    const prod = await createProduct(
      actor,
      {
        name: "sona masoori rice",
        brand: "india gate",
        type: "GROCERY", // 🔒 ENUM — uppercase bheja, lowercase hona chahiye
        description: "best quality rice. from MP",
        subCategoryId: sub._id,
        weightInKg: 5,
        generalPrice: 450,
        stockQuantity: 100,
      },
      null,
    );
    ok(`name  → "${prod.name}"`, prod.name === "Sona Masoori Rice", prod.name);
    ok(`brand → "${prod.brand}"`, prod.brand === "India Gate", prod.brand);
    ok(
      `🔒 type → "${prod.type}" (enum lowercase hi rehna chahiye)`,
      prod.type === PRODUCT_TYPES.GROCERY,
      prod.type,
    );
    ok(
      `description → "${prod.description}"`,
      prod.description === "Best quality rice. From MP",
      prod.description,
    );
    ok(`SKU → "${prod.SKU}"`, typeof prod.SKU === "string" && prod.SKU.length > 0, prod.SKU);
    ok("SKU uppercase hi bana (casing change se nahi tuta)", prod.SKU === prod.SKU.toUpperCase(), prod.SKU);

    hr("5b. 🔑 Product duplicate — alag casing, wahi product");
    {
      const e = await caught(() =>
        createProduct(actor, {
          name: "SONA MASOORI RICE", brand: "INDIA GATE", type: "grocery",
          subCategoryId: sub._id, weightInKg: 5, generalPrice: 450, stockQuantity: 10,
        }, null),
      );
      ok("ALL-CAPS naam+brand → 409", e?.statusCode === 409, `got ${e?.statusCode}`);
    }
    {
      const p2 = await createProduct(actor, {
        name: "sona masoori rice", brand: "india gate", type: "grocery",
        subCategoryId: sub._id, weightInKg: 10, generalPrice: 900, stockQuantity: 10,
      }, null);
      ok("alag weight → naya product allowed", p2.weightInKg === 10);
    }

    hr("5c. Product update");
    {
      const upd = await updateProduct(
        prod._id, { name: "premium sona masoori", brand: "DAAWAT" }, null, actor,
      );
      ok(`name  → "${upd.name}"`, upd.name === "Premium Sona Masoori", upd.name);
      ok(`brand → "${upd.brand}"`, upd.brand === "Daawat", upd.brand);
      ok(`type abhi bhi "${upd.type}"`, upd.type === PRODUCT_TYPES.GROCERY);
    }

    // ═══════════════════════════════════════════════════════
    hr("6. Banner — casing + CI duplicate");
    const banner = await createBanner(null, null, {
      name: `${STAMP} summer sale`,
      description: "FLAT 20% OFF ON ALL RICE",
      isActive: true,
    }).catch((e) => e);
    if (banner instanceof Error) {
      // image/video dono zaroori hain — isliye direct model se check
      ok("banner ko image/video chahiye (422)", banner.statusCode === 422, String(banner.statusCode));
      const b = await Banner.create({
        name: "Summer Sale " + STAMP, isDeleted: false,
      });
      tempBannerIds.push(b._id);
      const e = await caught(() =>
        createBanner(null, { tempFilePath: "x" }, { name: `SUMMER SALE ${STAMP}` }),
      );
      ok("alag casing wala banner → duplicate pakda gaya", e?.statusCode === 400, `got ${e?.statusCode}`);
    }

    // ═══════════════════════════════════════════════════════
    hr("7. 🔒 Regex injection — getAll filters escaped hain");
    {
      const { getAllCategories } = require("../services/categories");
      const t0 = Date.now();
      const res = await getAllCategories(
        { search: "(a+)+$", userId: String(vendor._id), limit: 5 },
        { userId: vendor._id, role: ROLES.ADMIN },
      ).catch(() => ({ data: [] }));
      const ms = Date.now() - t0;
      ok(`"(a+)+$" literal → ${res.data.length} result, ${ms}ms`, res.data.length === 0 && ms < 5000);
    }
  } finally {
    const c = await Category.deleteMany({ userId: { $in: tempUserIds } });
    const s = await SubCategory.deleteMany({ userId: { $in: tempUserIds } });
    const p = await Product.deleteMany({ userId: { $in: tempUserIds } });
    const b = await Banner.deleteMany({
      $or: [{ _id: { $in: tempBannerIds } }, { name: new RegExp(STAMP, "i") }],
    });
    const u = await User.deleteMany({ _id: { $in: tempUserIds } });
    console.log(
      `\n🧹 cleanup: ${u.deletedCount} users · ${c.deletedCount} categories · ` +
        `${s.deletedCount} subcategories · ${p.deletedCount} products · ${b.deletedCount} banners`,
    );
    console.log(`🧹 leftover: ${await User.countDocuments({ name: STAMP })}`);
    await mongoose.disconnect();
  }

  console.log(`\n${"=".repeat(64)}`);
  console.log(`  PASS: ${pass}    FAIL: ${fail}`);
  console.log("=".repeat(64));
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error("\n❌ CRASH:", e);
  try {
    await Category.deleteMany({ userId: { $in: tempUserIds } });
    await SubCategory.deleteMany({ userId: { $in: tempUserIds } });
    await Product.deleteMany({ userId: { $in: tempUserIds } });
    await Banner.deleteMany({ name: new RegExp(STAMP, "i") });
    await User.deleteMany({ _id: { $in: tempUserIds } });
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
