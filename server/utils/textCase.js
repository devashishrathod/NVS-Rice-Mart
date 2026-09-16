/**
 * Text casing helpers.
 *
 * Pehle poora project `.toLowerCase()` karke save karta tha — "Davangere"
 * DB me "davangere" ban jata tha aur wahi customer ko wapas dikhta tha.
 * Ab display fields **jaise dikhne chahiye waise** save hote hain, aur
 * comparison/filter case-insensitive ho gaye hain.
 *
 * 🔑 SABSE ZAROORI RULE — "user ne jo mixed-case type kiya, use chhedo mat".
 *    Auto-casing lossy hai ("iPhone" → "Iphone" ek corruption hai). Isliye
 *    jis string me upper aur lower dono maujood hain, use hum deliberate
 *    maan ke waisa hi rakhte hain.
 *
 * ⚠️ Ye helpers `email`, `role`, `loginType`, `product.type` pe NAHI lagte.
 *    Wo enum/identity values hain — unka lowercase normalization functional
 *    hai, cosmetic nahi. (`email` pe lowercase hatane se `findOne({ email })`
 *    fail ho jata aur duplicate account ban jate.)
 */

// ── State / UT abbreviations ───────────────────────────────────
// StageDB me `state: "mp"` pada mila tha. Title case usse "Mp" bana deta,
// isliye ye dictionary. Match sirf **poori string** pe hota hai (per-word
// nahi) — warna "rice as grain" → "Rice AS Grain" ho jata.
const STATE_ABBR = Object.freeze({
  ap: "AP", ar: "AR", as: "AS", br: "BR", cg: "CG", dl: "DL",
  ga: "GA", gj: "GJ", hp: "HP", hr: "HR", jh: "JH", jk: "JK",
  ka: "KA", kl: "KL", la: "LA", ld: "LD", mh: "MH", ml: "ML",
  mn: "MN", mp: "MP", mz: "MZ", nl: "NL", od: "OD", pb: "PB",
  py: "PY", rj: "RJ", sk: "SK", tn: "TN", tr: "TR", ts: "TS",
  uk: "UK", up: "UP", wb: "WB",
});

/**
 * Jo tokens lowercase pade hain par hain ACRONYM — inhe uppercase rakha
 * jayega ("rnr raw rice" → "RNR Raw Rice", "nvs admin" → "NVS Admin").
 *
 * ⚠️ Ye jaan-boojh ke EXPLICIT LIST hai, koi heuristic nahi. "vowel nahi
 *    hai to acronym hai" wala rule is data pe TOOT jata hai:
 *      "17 th cross"  → "17 TH Cross"   ❌  (th/nd/rd/st 69 baar aate hain)
 *      "hhhhg"        → "HHHHG"         ❌  (junk data)
 *
 * 📝 Naya acronym add karna ho to bas yahan likh dena — uppercase me.
 *    (Ye StageDB ke asli data se nikale gaye hain.)
 */
const KNOWN_ACRONYMS = new Set([
  "NVS", // brand — NVS Rice Mart
  "RNR", // rice variety
  "RNT", // rice variety
  "MM", // MM Rice (brand)
  "KTJ", // KTJ Nagar, Davangere
  "MCC", // MCC Block, Davangere
  "DVG", // Davangere
  "HKR", // HKR Circle, Davangere
]);

const isStr = (v) => typeof v === "string";

/** trim + andar ke multiple spaces ko ek space */
const collapse = (s) => s.trim().replace(/\s+/g, " ");

// Kannada/Devanagari/digits me case hota hi nahi — inke liye dono false.
const hasUpper = (s) => s !== s.toLowerCase();
const hasLower = (s) => s !== s.toUpperCase();
const isCaseless = (s) => !hasUpper(s) && !hasLower(s);
const isMixed = (s) => hasUpper(s) && hasLower(s);

/**
 * "NVS", "GST", "MP", "HDFC" jaise tokens ko title-case se bachata hai.
 *
 * Heuristic: ALL-CAPS + 2-5 letters + **koi vowel nahi**. Vowel wala test
 * isliye ki "NVS RICE MART" me "MART"/"RICE" title-case hon aur "NVS" bacha
 * rahe. Sirf length dekhte to "MART" bhi acronym maan liya jata.
 */
const VOWEL = /[AEIOU]/;
const isLikelyAcronym = (tok) =>
  tok.length >= 2 && tok.length <= 5 && /^[A-Z]+$/.test(tok) && !VOWEL.test(tok);

/**
 * Ek word ke andar capitalization — separator ke baad bhi capital.
 * "jai-shree" → "Jai-Shree", "d'souza" → "D'Souza", par "don't" → "Don't".
 */
const HARD_SEP = new Set(["-", "/", ".", "(", "[", "&", ",", "_"]);
const capWord = (word) => {
  let out = "";
  let capNext = true;
  for (let i = 0; i < word.length; i++) {
    const ch = word[i];
    if (capNext && /[a-z]/i.test(ch)) {
      out += ch.toUpperCase();
      capNext = false;
    } else {
      out += ch;
    }
    if (HARD_SEP.has(ch)) {
      capNext = true;
    } else if (ch === "'") {
      // Apostrophe ke baad capital sirf tab jab 2+ letters aayein —
      // warna "don't" → "Don'T" ho jata.
      const run = (word.slice(i + 1).match(/^[a-z]+/i) || [""])[0];
      capNext = run.length >= 2;
    }
  }
  return out;
};

/**
 * Proper nouns ke liye — name, city, district, state, country, area,
 * address, brand, title, shopName.
 *
 * String ke alawa kuch bhi (undefined/null/number) jaisa hai waisa wapas —
 * taaki `toTitleCase(payload.name)` purane `payload.name?.toLowerCase()`
 * ki tarah hi behave kare.
 */
exports.toTitleCase = (value) => {
  if (!isStr(value)) return value;
  const s = collapse(value);
  if (!s) return s;

  // "ಕರ್ನಾಟಕ", "ಇಂಡಿಯಾ", "123" — inme case ka concept hi nahi
  if (isCaseless(s)) return s;

  // Poori string ek state/UT abbreviation ho to wahi rakho ("mp" → "MP")
  if (!isMixed(s)) {
    const abbr = STATE_ABBR[s.toLowerCase()];
    if (abbr) return abbr;
  }

  // Mixed case = user ne jaan-boojh ke likha. "iPhone 15", "NVS Rice Mart",
  // "McDonald's" — sab safe. Sirf tab pehla letter capital karte hain jab
  // pehla word poora lowercase ho ("home Address" → "Home Address"), warna
  // "iPhone" → "IPhone" corrupt ho jata.
  if (isMixed(s)) {
    const firstWord = s.split(" ")[0];
    return hasUpper(firstWord) ? s : s.charAt(0).toUpperCase() + s.slice(1);
  }

  // Yahan string poori lowercase ya poori UPPERCASE hai
  return s
    .split(" ")
    .map((tok) => {
      // Digit se SHURU hone wale tokens jaise ke waise — "4a", "12c", "17".
      // Sirf "digit hai kahin bhi" check karte to "shop(4)" bhi chhut jata.
      if (/^\d/.test(tok)) return tok;
      // Explicit list — lowercase pada acronym bhi theek ho jata hai
      if (KNOWN_ACRONYMS.has(tok.toUpperCase())) return tok.toUpperCase();
      if (isLikelyAcronym(tok)) return tok; // ALL-CAPS: NVS, GST, PVT
      return capWord(tok.toLowerCase());
    })
    .join(" ");
};

/**
 * "rice i.e. basmati" me ka `.` sentence ka end NAHI hai — warna
 * "Rice i.e. Basmati" ban jata. Ye check karta hai ki `.` se pehle wala
 * token ek abbreviation hai ya nahi.
 */
const ABBREVIATIONS = new Set([
  "ie", "eg", "etc", "vs", "mr", "mrs", "ms", "dr", "st", "no", "approx", "rs",
]);
const isAbbrevEnd = (before) => {
  const lastWord = (before.match(/[A-Za-z.]+$/) || [""])[0].toLowerCase();
  if (!lastWord) return false;
  // "i" / "e" jaisa single letter → "i.e." ka hissa
  if (lastWord.length === 1) return true;
  // "i.e" / "e.g" pattern
  if (/^[a-z](\.[a-z])+$/.test(lastWord)) return true;
  return ABBREVIATIONS.has(lastWord.replace(/\./g, ""));
};

/**
 * Lambi text ke liye — description, title jaisa content jahan har word
 * capital karna galat lagta hai.
 *
 * Har sentence (`.` `!` `?` ke baad) ka pehla letter capital — par
 * abbreviation ("i.e.", "etc.", "Mr.") ke baad nahi.
 *
 *   "best quality rice. grown locally" → "Best quality rice. Grown locally"
 *   "best quality rice. from MP"       → "Best quality rice. From MP"
 *   "BEST QUALITY RICE"                → "Best quality rice"
 *   "GST INVOICE AVAILABLE"            → "GST invoice available"
 */
exports.toSentenceCase = (value) => {
  if (!isStr(value)) return value;
  const s = collapse(value);
  if (!s) return s;
  if (isCaseless(s)) return s;

  // Sirf ALL-CAPS text ko lowercase karte hain (acronym chhod ke).
  //
  // ⚠️ Yahan `toTitleCase` wala "mixed case = bilkul mat chhedo" rule
  //    NAHI lagta. Warna "best quality rice. from MP" me sirf ek acronym
  //    ki wajah se poora string mixed ban jata aur "from" kabhi capital
  //    hi na hota. Isliye: kisi token ki casing badalte nahi, bas sentence
  //    ka pehla letter theek karte hain.
  const base = hasLower(s)
    ? s
    : s
        .split(" ")
        .map((tok) => (isLikelyAcronym(tok) ? tok : tok.toLowerCase()))
        .join(" ");

  return (
    base
      // string ka pehla letter
      .replace(/^[a-z]/, (m) => m.toUpperCase())
      // har sentence ka pehla letter — par abbreviation ke baad NAHI
      .replace(/([.!?])(\s+)([a-z])/g, (m, dot, sp, ch, offset, full) => {
        if (dot === "." && isAbbrevEnd(full.slice(0, offset))) return m;
        return dot + sp + ch.toUpperCase();
      })
      // akela "i" → "I" (par "i.e." ko chhod do)
      .replace(/\bi\b(?!\s*\.)/g, "I")
  );
};

/**
 * SIRF comparison ke liye — ye value kabhi DB me save nahi hoti.
 * Duplicate check me "Rice" aur "rice" ko ek maanne ke liye.
 */
exports.normalizeForCompare = (value) => {
  if (!isStr(value)) return value;
  return collapse(value).toLowerCase();
};

/** Regex me user input daalne se pehle — ReDoS / injection guard */
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
exports.escapeRegex = escapeRegex;

/**
 * Exact match, par case-insensitive — Mongo filter ke liye.
 *
 * `\s*` dono taraf isliye ki purane data me trailing space pada hai
 * (StageDB me `district: "davangere "` mila tha). Backfill usse trim kar
 * degi, par tab tak filter dono ko pakadta rahe.
 */
exports.ciExact = (value) => {
  if (!isStr(value)) return value;
  return new RegExp(`^\\s*${escapeRegex(collapse(value))}\\s*$`, "i");
};

// Test aur backfill script inhe seedha use karte hain
exports.STATE_ABBR = STATE_ABBR;
exports.KNOWN_ACRONYMS = KNOWN_ACRONYMS;
