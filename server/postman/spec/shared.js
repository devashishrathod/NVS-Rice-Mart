/**
 * Postman spec ke shared helpers — tags, common query params, error rows aur
 * markdown description builder.
 *
 * Har endpoint ki description isi builder se banti hai taaki teeno folder me
 * format bilkul same rahe.
 */

const TAG = {
  NEW: "🆕 **NEW** — ye endpoint pehle tha hi nahi",
  CHANGED: "🔶 **CHANGED** — request ya response badla hai",
  BREAKING: "⚠️ **BREAKING** — purana client tut jayega, code badalna padega",
  LOCKED: "🔒 **CHANGED (auth)** — ab role restriction lag gaya hai",
  SAME: "✅ **unchanged** — pehle jaisa hi hai",
  REMOVED: "❌ **REMOVED** — route hata diya gaya hai",
};

/** getAll endpoints pe har jagah available paging params. */
const paging = (extra = []) => [
  { key: "page", value: "1", description: "Page number (default 1)", disabled: true },
  { key: "limit", value: "20", description: "Per page (default 10)", disabled: true },
  { key: "search", value: "", description: "Free text search", disabled: true },
  { key: "sortBy", value: "createdAt", description: "Field to sort on", disabled: true },
  {
    key: "sortOrder",
    value: "desc",
    description: "`asc` | `desc`",
    disabled: true,
  },
  ...extra,
];

/** Catalog endpoints pe service-context params (customer ke liye). */
const serviceCtx = () => [
  {
    key: "zipcode",
    value: "577001",
    description:
      "Explicit pincode. Diya to default address ko override karega. Na do to customer ka default address use hota hai.",
    disabled: true,
  },
  {
    key: "locationId",
    value: "{{locationId}}",
    description:
      "Saved address ka id. Sabse zyada priority isi ki hai (locationId > zipcode > default address).",
    disabled: true,
  },
];

/** Baar-baar aane wale error rows. */
const E = {
  PINCODE_REQUIRED: [
    "400",
    "`PINCODE_REQUIRED`",
    "Customer ka koi default address nahi aur query me bhi pincode nahi. App ko address-add screen kholni chahiye.",
  ],
  PINCODE_NOT_SERVICEABLE: [
    "404",
    "`PINCODE_NOT_SERVICEABLE`",
    "Is pincode pe koi vendor assign nahi hai. App ko \"abhi yahan available nahi\" screen dikhani chahiye.",
  ],
  PINCODE_ALREADY_ASSIGNED: [
    "409",
    "`PINCODE_ALREADY_ASSIGNED`",
    "Ye pincode pehle se kisi aur vendor ka hai (response me uska `shopName` aata hai). Transfer karna ho to `PUT /service-areas/reassign` use karo.",
  ],
  CART_VENDOR_CONFLICT: [
    "409",
    "`CART_VENDOR_CONFLICT`",
    "Cart me already doosre vendor ka item pada hai. `?replaceCart=true` bhejo to purana cart clear karke naya item add ho jayega.",
  ],
  PRODUCT_NOT_AVAILABLE_HERE: [
    "404",
    "`PRODUCT_NOT_AVAILABLE_HERE`",
    "Product exist karta hai par customer ke pincode wale vendor ka nahi hai.",
  ],
  VENDOR_NOT_SERVICEABLE: [
    "409",
    "`VENDOR_NOT_SERVICEABLE`",
    "Cart ka vendor is delivery address pe deliver nahi karta.",
  ],
  VENDOR_PICKUP_MISSING: [
    "503",
    "`VENDOR_PICKUP_MISSING`",
    "Vendor ka default branch missing hai — data issue. Admin ko `PUT /vendors/:id/branches/:locationId/default` chalana hoga.",
  ],
  STOCK_UNAVAILABLE: [
    "409",
    "`STOCK_UNAVAILABLE`",
    "Order place karte waqt kisi item ka stock kam nikla. Response me kaunsa item hai wo aata hai.",
  ],
  OUT_OF_RADIUS: [
    "400",
    "`OUT_OF_RADIUS`",
    "Delivery address vendor ke `maxRadiusKm` se bahar hai.",
  ],
  MIN_ORDER_NOT_MET: [
    "400",
    "`MIN_ORDER_NOT_MET`",
    "Subtotal vendor ke `minOrderAmount` se kam hai.",
  ],
  CART_NOT_VERIFIED: [
    "409",
    "`CART_NOT_VERIFIED`",
    "Order se pehle `POST /carts/verify-delivery` call karna zaroori hai.",
  ],
  INVALID_STATUS_TRANSITION: [
    "409",
    "`INVALID_STATUS_TRANSITION`",
    "Is role ko current status se us status pe jaane ki permission nahi. Allowed transitions neeche table me hain.",
  ],
  FORBIDDEN: ["403", "`FORBIDDEN`", "Ye resource aapka nahi hai."],
  UNAUTH: ["401", "—", "Token missing / expired / invalid."],
  VALIDATION: ["422", "—", "Joi validation fail. `message` me saari galtiyan comma-separated aati hain."],
  NOT_FOUND: ["404", "—", "Resource nahi mila (ya aapke scope me nahi hai)."],
};

const table = (headers, rows) => {
  if (!rows || !rows.length) return "";
  return [
    `| ${headers.join(" | ")} |`,
    `|${headers.map(() => "---").join("|")}|`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
};

/**
 * Endpoint description ka markdown banata hai.
 *
 * @param {object} o
 * @param {string} o.tag       TAG.* me se ek
 * @param {string} o.summary   ek line
 * @param {string} [o.auth]    kaun call kar sakta hai
 * @param {string[]} [o.when]  sequence me kab call hota hai
 * @param {string[]} [o.notes] bullet points
 * @param {Array} [o.fields]   [name, type, req, description]
 * @param {Array} [o.query]    [name, description]
 * @param {Array} [o.enums]    [name, values, description]
 * @param {Array} [o.errors]   E.* rows
 * @param {string} [o.extra]   raw markdown neeche chipka do
 */
const describe = (o) => {
  const p = [];
  p.push(o.summary);
  p.push("");
  p.push(o.tag);
  if (o.auth) p.push(`\n**Auth:** ${o.auth}`);
  if (o.when && o.when.length) {
    p.push("\n**Sequence me kab:**");
    o.when.forEach((w) => p.push(`- ${w}`));
  }
  if (o.notes && o.notes.length) {
    p.push("\n**Zaroori baatein:**");
    o.notes.forEach((n) => p.push(`- ${n}`));
  }
  if (o.fields && o.fields.length) {
    p.push("\n### Request body");
    p.push(table(["Field", "Type", "Required", "Matlab / sample"], o.fields));
  }
  if (o.query && o.query.length) {
    p.push("\n### Query params");
    p.push(table(["Param", "Matlab"], o.query));
  }
  if (o.enums && o.enums.length) {
    p.push("\n### Enums");
    p.push(table(["Field", "Allowed values", "Matlab"], o.enums));
  }
  if (o.errors && o.errors.length) {
    p.push("\n### Errors");
    p.push(table(["HTTP", "`code`", "Kab aata hai"], o.errors));
  }
  if (o.extra) {
    p.push("");
    p.push(o.extra);
  }
  return p.join("\n");
};

/** Login ke baad token env me save karne wala script. */
const saveToken = (varName, idVar) => [
  "const j = pm.response.json();",
  "if (pm.response.code === 200 && j && j.data && j.data.token) {",
  `    pm.environment.set("${varName}", j.data.token);`,
  ...(idVar
    ? [`    pm.environment.set("${idVar}", j.data.user && j.data.user._id);`]
    : []),
  `    console.log("✅ ${varName} saved");`,
  "} else {",
  `    console.log("❌ token nahi mila:", pm.response.code, j && j.message);`,
  "}",
  "",
  "pm.test(\"200 OK + token mila\", function () {",
  "    pm.response.to.have.status(200);",
  "    pm.expect(pm.response.json().data).to.have.property(\"token\");",
  "});",
];

/** List response se pehla id uthaa ke env me daal do. */
const saveFirstId = (envVar, listPath = "data.data") => [
  "const j = pm.response.json();",
  `const list = ${listPath
    .split(".")
    .reduce((acc, k) => `(${acc} || {})["${k}"]`, "j")};`,
  "if (Array.isArray(list) && list.length) {",
  `    pm.environment.set("${envVar}", list[0]._id);`,
  `    console.log("✅ ${envVar} =", list[0]._id);`,
  "}",
  "",
  "pm.test(\"200 OK\", () => pm.response.to.have.status(200));",
];

/** Single-object response se id uthaa lo. */
const saveId = (envVar, path, expect = 201) => [
  "const j = pm.response.json();",
  `const doc = ${path.split(".").reduce((acc, k) => `(${acc} || {})["${k}"]`, "j")};`,
  "if (doc && doc._id) {",
  `    pm.environment.set("${envVar}", doc._id);`,
  `    console.log("✅ ${envVar} =", doc._id);`,
  "}",
  "",
  `pm.test("${expect} OK", () => pm.response.to.have.status(${expect}));`,
];

const expectStatus = (code = 200) => [
  `pm.test("${code} OK", () => pm.response.to.have.status(${code}));`,
];

module.exports = {
  TAG,
  E,
  paging,
  serviceCtx,
  table,
  describe,
  saveToken,
  saveFirstId,
  saveId,
  expectStatus,
};
