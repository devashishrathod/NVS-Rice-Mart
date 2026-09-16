/* eslint-disable no-console */
/**
 * Text casing helpers ka verification — koi DB connection nahi.
 *
 * Test data me **StageDB ka asli ganda data** shamil hai (audit se nikala):
 *   state    : "mp", "karnataka", "karanataka", "ಕರ್ನಾಟಕ", "sdffsd"
 *   district : "davangere " (trailing space), "davanagerw", "hhhhg"
 *   country  : "india", "united states", "fsddfs", "ಇಂಡಿಯಾ"
 */
const {
  toTitleCase,
  toSentenceCase,
  normalizeForCompare,
  ciExact,
  escapeRegex,
} = require("../utils/textCase");

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
const eq = (fn, input, expected) => {
  const got = fn(input);
  ok(
    `${JSON.stringify(input)} → ${JSON.stringify(expected)}`,
    got === expected,
    `got ${JSON.stringify(got)}`,
  );
};
const hr = (t) =>
  console.log(`\n── ${t} ${"─".repeat(Math.max(0, 60 - t.length))}`);

const T = (i, e) => eq(toTitleCase, i, e);
const S = (i, e) => eq(toSentenceCase, i, e);

// ═══════════════════════════════════════════════════════════
hr("toTitleCase — non-string passthrough (purana ?. behaviour)");
ok("undefined → undefined", toTitleCase(undefined) === undefined);
ok("null → null", toTitleCase(null) === null);
ok("number jaisa ka waisa", toTitleCase(42) === 42);
ok("empty string → empty string", toTitleCase("") === "");
ok("sirf spaces → empty string", toTitleCase("   ") === "");

hr("toTitleCase — all-lowercase input (aaj DB me yahi pada hai)");
T("davangere", "Davangere");
T("madhya pradesh", "Madhya Pradesh");
T("near amrutha mai school", "Near Amrutha Mai School");
T("yallamma nagar", "Yallamma Nagar");
T("12c vittal mandir road", "12c Vittal Mandir Road");
// KTJ allowlist me hai; "th" NAHI hai — dono neeche alag se bhi test hain
T("ktj nagar 17 th cross 4 th main road", "KTJ Nagar 17 Th Cross 4 Th Main Road");
T("home", "Home");

hr("toTitleCase — trim + space collapse");
T("davangere ", "Davangere");
T("  davangere  ", "Davangere");
T("madhya    pradesh", "Madhya Pradesh");
T("\tdavangere\n", "Davangere");

hr("toTitleCase — ALL CAPS input");
T("MADHYA PRADESH", "Madhya Pradesh");
T("DAVANGERE", "Davangere");
T("NVS RICE MART", "NVS Rice Mart"); // NVS bacha, RICE/MART title-case
T("HDFC BANK ROAD", "HDFC Bank Road");

hr("toTitleCase — acronym guard (ALL-CAPS, 2-5 letters, koi vowel nahi)");
T("NVS", "NVS");
T("GST", "GST");
T("PVT LTD", "PVT LTD"); // dono me vowel nahi → dono bache
ok("MART acronym NAHI (vowel hai)", toTitleCase("MART") === "Mart");
ok("RICE acronym NAHI (vowel hai)", toTitleCase("RICE") === "Rice");

hr("toTitleCase — state/UT abbreviation dictionary");
T("mp", "MP");
T("MP", "MP");
T("up", "UP");
T("ka", "KA");
T("wb", "WB");
T("jk", "JK");
ok("3-letter word dictionary me nahi", toTitleCase("map") === "Map");
ok("poori string hi match hoti hai", toTitleCase("rice as grain") === "Rice As Grain");

hr("toTitleCase — MIXED CASE = user ne deliberate likha, chhedo mat");
T("NVS Rice Mart", "NVS Rice Mart");
T("iPhone 15 Pro", "iPhone 15 Pro");
T("McDonald's", "McDonald's");
T("eBay Store", "eBay Store");
T("Madhya Pradesh", "Madhya Pradesh");
T("home Address", "Home Address"); // pehla word all-lower → capital
T("myShop road", "myShop road"); // pehla word me caps → bilkul mat chhedo

hr("toTitleCase — caseless scripts (Kannada/Devanagari/digits)");
T("ಕರ್ನಾಟಕ", "ಕರ್ನಾಟಕ");
T("ಇಂಡಿಯಾ", "ಇಂಡಿಯಾ");
T("ಎಚ್ ಕೆ ಆರ್ ಸರ್ಕಲ್", "ಎಚ್ ಕೆ ಆರ್ ಸರ್ಕಲ್");
T("मध्य प्रदेश", "मध्य प्रदेश");
T("577004", "577004");

hr("toTitleCase — separators");
T("jai-shree nagar", "Jai-Shree Nagar");
T("d'souza", "D'Souza");
T("o'brien road", "O'Brien Road");
T("don't stop", "Don't Stop");
T("a/b block", "A/B Block");
T("st. mary road", "St. Mary Road");
T("shop(4) lane", "Shop(4) Lane");

hr("toTitleCase — digit wale tokens jaise ke waise");
T("shop 4a", "Shop 4a");
T("12c", "12c");
T("17 th cross", "17 Th Cross");

hr("toTitleCase — KNOWN_ACRONYMS (lowercase pade acronym)");
T("nvs admin", "NVS Admin");
T("rnr raw rice", "RNR Raw Rice");
T("rnt raw rice", "RNT Raw Rice");
T("ktj nagar 17 th cross", "KTJ Nagar 17 Th Cross"); // 🔑 "th" NAHI badla
T("mcc block dvg", "MCC Block DVG");
T("hkr circle", "HKR Circle");
T("mm rice", "MM Rice");
ok("NVS ALL-CAPS bhi bacha", toTitleCase("NVS ADMIN") === "NVS Admin");
ok("Nvs mixed bhi theek hua", toTitleCase("nvs") === "NVS");

hr("🔴 toTitleCase — ordinal suffix acronym NAHI mane jaate");
T("17 th cross", "17 Th Cross");
T("2 nd main road", "2 Nd Main Road");
T("3 rd block", "3 Rd Block");
T("1 st floor", "1 St Floor");

hr("toTitleCase — junk data casing se theek nahi hota (expected)");
T("fsddfs", "Fsddfs");
T("hhhhg", "Hhhhg");
T("davanagerw", "Davanagerw");
T("sdffsd", "Sdffsd");

hr("toTitleCase — idempotent (backfill dobara chale to 0 changes)");
[
  "davangere ", "MADHYA PRADESH", "mp", "NVS RICE MART", "d'souza",
  "shop 4a", "ಕರ್ನಾಟಕ", "iPhone 15 Pro", "fsddfs", "jai-shree nagar",
].forEach((v) => {
  const once = toTitleCase(v);
  const twice = toTitleCase(once);
  ok(`idempotent: ${JSON.stringify(v)} → ${JSON.stringify(once)}`, once === twice,
     `twice=${JSON.stringify(twice)}`);
});

// ═══════════════════════════════════════════════════════════
hr("toSentenceCase — non-string passthrough");
ok("undefined → undefined", toSentenceCase(undefined) === undefined);
ok("null → null", toSentenceCase(null) === null);
ok("empty → empty", toSentenceCase("") === "");

hr("toSentenceCase — all-lower / ALL-CAPS");
S("best quality rice. grown locally", "Best quality rice. Grown locally");
S("BEST QUALITY RICE", "Best quality rice");
S("premium sona masoori rice", "Premium sona masoori rice");
S("fresh stock! order now. free delivery?", "Fresh stock! Order now. Free delivery?");

hr("toSentenceCase — acronym bach jaate hain");
S("rice from MP", "Rice from MP");
S("GST INVOICE AVAILABLE", "GST invoice available");

hr("toSentenceCase — mixed case: token ki casing nahi badalti, sirf sentence-start");
S("Best quality rice. Grown in MP.", "Best quality rice. Grown in MP.");
S("best rice from MP", "Best rice from MP");
// 🔴 Ek acronym ki wajah se poora sentence-casing band nahi hona chahiye
S("best quality rice. from MP", "Best quality rice. From MP");
S("rice from MP. grown in punjab", "Rice from MP. Grown in punjab");
S("iPhone ke saath. free delivery", "IPhone ke saath. Free delivery");

hr("toSentenceCase — standalone i → I");
S("i sell rice", "I sell rice");

hr("toSentenceCase — abbreviation ke baad sentence-cap NAHI");
S("rice i.e. basmati", "Rice i.e. basmati");
S("rice e.g. sona masoori", "Rice e.g. sona masoori");
S("rice, dal etc. available here", "Rice, dal etc. available here");
S("call mr. sharma today", "Call mr. sharma today");
S("good rice. bad rice", "Good rice. Bad rice"); // asli sentence end

hr("toSentenceCase — caseless + idempotent");
S("ಕರ್ನಾಟಕ ಅಕ್ಕಿ", "ಕರ್ನಾಟಕ ಅಕ್ಕಿ");
["best quality rice. grown locally", "BEST QUALITY RICE", "rice from MP"].forEach((v) => {
  const once = toSentenceCase(v);
  ok(`idempotent: ${JSON.stringify(once)}`, toSentenceCase(once) === once);
});

// ═══════════════════════════════════════════════════════════
hr("normalizeForCompare — sirf comparison ke liye");
ok('"Davangere" → "davangere"', normalizeForCompare("Davangere") === "davangere");
ok('"  DAVANGERE " → "davangere"', normalizeForCompare("  DAVANGERE ") === "davangere");
ok('"Basmati   Rice" → "basmati rice"', normalizeForCompare("Basmati   Rice") === "basmati rice");
ok("undefined passthrough", normalizeForCompare(undefined) === undefined);

// ═══════════════════════════════════════════════════════════
hr("escapeRegex — injection / ReDoS guard");
ok("dot escape", escapeRegex("a.b") === "a\\.b");
ok("star escape", escapeRegex("a*b") === "a\\*b");
ok("bracket escape", escapeRegex("a[b]c") === "a\\[b\\]c");
ok("plain text untouched", escapeRegex("davangere") === "davangere");

hr("ciExact — case-insensitive exact match");
const r = ciExact("Davangere");
ok("exact match", r.test("Davangere"));
ok("lowercase match", r.test("davangere"));
ok("UPPERCASE match", r.test("DAVANGERE"));
ok("trailing space wala purana data match", r.test("davangere "));
ok("leading space match", r.test(" davangere"));
ok("partial NAHI match (anchored)", !r.test("davangere city"));
ok("prefix NAHI match", !r.test("xdavangere"));

const rSpace = ciExact("  Madhya   Pradesh  ");
ok("input khud collapse hota hai", rSpace.test("madhya pradesh"));

const rSpecial = ciExact("a.b*c");
ok("special chars literal treat hote hain", rSpecial.test("A.B*C"));
ok("regex ki tarah NAHI chalta", !rSpecial.test("axbxc"));
ok("undefined passthrough", ciExact(undefined) === undefined);

hr("ciExact — Mongo query value ke roop me valid hai");
ok("RegExp instance hai", ciExact("x") instanceof RegExp);
ok("'i' flag laga hai", ciExact("x").flags.includes("i"));

// ═══════════════════════════════════════════════════════════
hr("🔒 Regression — enum/identity values pe ye helpers NAHI lagte");
ok(
  "email helper se nahi guzarta (design check)",
  toTitleCase("Foo@Example.COM") === "Foo@Example.COM",
  "mixed case passthrough — phir bhi email pe use mat karna",
);

console.log(`\n${"=".repeat(64)}`);
console.log(`  PASS: ${pass}    FAIL: ${fail}`);
console.log("=".repeat(64));
process.exit(fail ? 1 : 0);
