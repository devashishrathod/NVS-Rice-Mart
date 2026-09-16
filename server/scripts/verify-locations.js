/* eslint-disable no-console */
/**
 * Locations module verification — koi DB connection nahi.
 *   Phase 2 → `district` optional · formattedAddress builder · create validator
 */
const {
  buildFormattedAddress,
} = require("../helpers/locations/buildFormattedAddress");
const {
  validateCreateLocation,
  validateUpsertLocation,
} = require("../validator/locations");

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

const FULL = {
  address: "12c vittal mandir road",
  city: "davangere",
  district: "davangere",
  state: "karnataka",
  zipcode: "577004",
  coordinates: [14.4641, 75.9217],
};

// ═══════════════════════════════════════════════════════════
hr("buildFormattedAddress — 'undefined' kabhi nahi aana chahiye");
{
  const out = buildFormattedAddress({
    address: "shop 4",
    city: "indore",
    state: "mp",
    zipcode: "452001",
    country: "india",
  }); // district jaan-boojh ke nahi diya
  ok(`district ke bina → "${out}"`, !out.includes("undefined"));
  ok("sahi string bani", out === "shop 4, indore, mp, 452001, india", out);
}
{
  const out = buildFormattedAddress({ address: "shop 4", zipcode: "452001" });
  ok(`sirf 2 parts → "${out}"`, out === "shop 4, 452001", out);
}
ok("sab khali → empty string", buildFormattedAddress({}) === "");
ok("undefined arg → empty string", buildFormattedAddress() === "");
ok(
  "null/empty parts skip hote hain",
  buildFormattedAddress({ address: "a", city: null, district: "", state: "b" }) ===
    "a, b",
);

hr("buildFormattedAddress — lagatar duplicate ek hi baar (city === district)");
{
  const out = buildFormattedAddress({
    address: "vittal road",
    city: "davangere",
    district: "davangere",
    state: "karnataka",
    zipcode: "577004",
    country: "india",
  });
  ok(
    `"${out}"`,
    out === "vittal road, davangere, karnataka, 577004, india",
    out,
  );
}
ok(
  "alag-alag case wala duplicate bhi pakda jata hai",
  buildFormattedAddress({ city: "Davangere", district: "davangere" }) ===
    "Davangere",
);
ok(
  "NON-lagatar repeat allowed (city aur country same nahi hote, par rule safe ho)",
  buildFormattedAddress({ city: "x", district: "y", state: "x" }) === "x, y, x",
);

hr("buildFormattedAddress — trim");
ok(
  "parts trim hote hain",
  buildFormattedAddress({ address: "  shop 4  ", city: " indore " }) ===
    "shop 4, indore",
);
ok(
  "number zipcode bhi chalta hai",
  buildFormattedAddress({ city: "indore", zipcode: 452001 }) ===
    "indore, 452001",
);

// ═══════════════════════════════════════════════════════════
hr("validateCreateLocation — 5 fields ab OPTIONAL");
[
  ["district", { ...FULL, district: undefined }],
  ["name", FULL],
  ["shopOrBuildingNumber", FULL],
  ["area", FULL],
  ["country", FULL],
].forEach(([field, payload]) => {
  const { error } = validateCreateLocation(payload);
  ok(`${field} ke bina pass hota hai`, !error, error?.message);
});
{
  const { error } = validateCreateLocation({
    address: "a",
    city: "b",
    state: "c",
    zipcode: "577004",
    coordinates: [1, 2],
  });
  ok("paanchon optional ek saath gayab → pass", !error, error?.message);
}
{
  const { error } = validateCreateLocation({ ...FULL, district: "" });
  ok('district: "" (empty string) allowed', !error, error?.message);
}

hr("validateCreateLocation — REQUIRED wale abhi bhi required hain");
["address", "city", "state", "zipcode", "coordinates"].forEach((f) => {
  const payload = { ...FULL };
  delete payload[f];
  const { error } = validateCreateLocation(payload);
  ok(`${f} ke bina → 422`, !!error, "koi error nahi aaya");
});

hr("🔴 REGRESSION — isDefault aur formattedAddress strip NAHI hone chahiye");
{
  const { error, value } = validateCreateLocation({ ...FULL, isDefault: true });
  ok("isDefault bacha rehta hai", !error && value.isDefault === true,
     JSON.stringify(value?.isDefault));
}
{
  const { value } = validateCreateLocation({
    ...FULL,
    formattedAddress: "my custom address",
  });
  ok(
    "formattedAddress bacha rehta hai",
    value.formattedAddress === "my custom address",
    JSON.stringify(value?.formattedAddress),
  );
}
{
  const { value } = validateCreateLocation({
    ...FULL,
    userId: "6a205447d7870e22b163ac52",
  });
  ok("userId bacha rehta hai", value.userId === "6a205447d7870e22b163ac52");
}

hr("validateCreateLocation — purane clients na tootein (stripUnknown)");
{
  const { error, value } = validateCreateLocation({
    ...FULL,
    isProductAddress: false,
    isVendorAddress: true,
    geo: { type: "Point" },
    randomJunk: 123,
  });
  ok("unknown fields se 422 NAHI aata", !error, error?.message);
  ok("unknown fields drop ho jaate hain", value.isProductAddress === undefined);
  ok("geo drop ho gaya", value.geo === undefined);
}

hr("validateCreateLocation — type coercion");
{
  const { error, value } = validateCreateLocation({ ...FULL, zipcode: 577004 });
  ok("number zipcode accept hota hai", !error, error?.message);
  ok("…aur string ban jata hai", value.zipcode === "577004", typeof value?.zipcode);
}
{
  const { error, value } = validateCreateLocation({
    ...FULL,
    coordinates: ["14.4641", "75.9217"],
  });
  ok("string coordinates accept hote hain", !error, error?.message);
  ok("…aur number ban jate hain", value.coordinates[0] === 14.4641);
}
{
  const { error } = validateCreateLocation({ ...FULL, coordinates: [1, 2, 3] });
  ok("3 coordinates → 422", !!error);
  ok(
    "message me [latitude, longitude] likha hai (purana galat tha)",
    /latitude, longitude/.test(error?.message || ""),
    error?.message,
  );
}
{
  const { error } = validateCreateLocation({ ...FULL, userId: "not-an-id" });
  ok("galat userId → 422", !!error);
}
{
  const { value } = validateCreateLocation({ ...FULL, city: "  davangere  " });
  ok("strings trim hoti hain", value.city === "davangere", value?.city);
}

// ═══════════════════════════════════════════════════════════
//  Phase 3 — upsert
// ═══════════════════════════════════════════════════════════
hr("validateUpsertLocation — create jaisi hi shape");
{
  const { error } = validateUpsertLocation(FULL);
  ok("poora payload pass", !error, error?.message);
}
["address", "city", "state", "zipcode", "coordinates"].forEach((f) => {
  const payload = { ...FULL };
  delete payload[f];
  ok(`${f} ke bina → 422`, !!validateUpsertLocation(payload).error);
});
{
  const payload = { ...FULL };
  delete payload.district;
  ok("district optional", !validateUpsertLocation(payload).error);
}
{
  const { value } = validateUpsertLocation({
    ...FULL,
    userId: "6a205447d7870e22b163ac52",
  });
  ok("admin ke liye userId accept hota hai", !!value.userId);
}

hr("validateUpsertLocation — isDefault accept NAHI hota");
{
  const { error, value } = validateUpsertLocation({ ...FULL, isDefault: true });
  ok("isDefault se 422 nahi aata", !error, error?.message);
  ok(
    "…par strip ho jata hai (upsert hamesha default pe kaam karta hai)",
    value.isDefault === undefined,
    JSON.stringify(value?.isDefault),
  );
}

hr("🔴 REGRESSION — Location model ke do bug fix");
{
  const Location = require("../models/Location");
  const { DEFAULT_COUNTRY } = require("../constants");
  ok(
    `country ka default DEFAULT_COUNTRY ("${DEFAULT_COUNTRY}") hai`,
    Location.schema.path("country").defaultValue === DEFAULT_COUNTRY,
    String(Location.schema.path("country").defaultValue),
  );
  ok("DEFAULT_COUNTRY proper case me hai", DEFAULT_COUNTRY === "India");
  const zipValidator = Location.schema.path("zipcode").validators[0];
  const msg = zipValidator.message({ value: "12", path: "zipcode" });
  ok(
    "zipcode error message crash nahi karta (props.instance hata)",
    typeof msg === "string" && msg.includes("12"),
    String(msg),
  );
  ok("message me 'undefined' nahi", !String(msg).includes("undefined"), msg);
}

console.log(`\n${"=".repeat(64)}`);
console.log(`  PASS: ${pass}    FAIL: ${fail}`);
console.log("=".repeat(64));
process.exit(fail ? 1 : 0);
