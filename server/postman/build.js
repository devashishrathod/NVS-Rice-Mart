/* eslint-disable no-console */
/**
 * POSTMAN COLLECTION BUILDER
 *
 *   node postman/build.js
 *
 * spec/ (kya likhna hai) + examples.json (asli response) ko jod ke
 * Postman v2.1 collection aur environment file banata hai.
 *
 * Output:
 *   postman/NVS-Rice-Mart.postman_collection.json
 *   postman/NVS-Rice-Mart.postman_environment.json
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SPEC = require("./spec");
const EX_PATH = path.join(__dirname, "examples.json");
const EXAMPLES = fs.existsSync(EX_PATH) ? require("./examples.json") : {};

const COLLECTION_OUT = path.join(__dirname, "NVS-Rice-Mart.postman_collection.json");
const ENV_OUT = path.join(__dirname, "NVS-Rice-Mart.postman_environment.json");

const LOCAL_URL = "http://localhost:8000/nvs-rice-mart";
// Trailing slash jaan-boojh ke nahi hai — requests `{{baseUrl}}/auth/login`
// banati hain, slash rehta to URL me `//` aa jata.
const STAGE_URL = "https://nvs-rice-mart.onrender.com/nvs-rice-mart";
const PROD_URL = "https://api.nvsricemart.com/nvs-rice-mart";

const uid = () => crypto.randomUUID();

const STATUS_TEXT = {
  200: "OK",
  201: "Created",
  204: "No Content",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  422: "Unprocessable Entity",
  500: "Internal Server Error",
};

// ─────────────────────────────────────────────────────────────
// OTP wale 4 endpoints live capture nahi kiye ja sakte (asli SMS/email
// chala jata aur OTP verify nahi ho sakta). Inke examples asli login
// response se banaye gaye hain — shape bilkul wahi hai jo controller deta hai.
// ─────────────────────────────────────────────────────────────
const synthetic = () => {
  const login = EXAMPLES["cust.auth.login"];
  const loginData = (login && login.body && login.body.data) || {
    user: {},
    token: "<jwt>",
  };
  return {
    "cust.auth.otpMobileSend": {
      status: 200,
      body: {
        success: true,
        message: "OTP has been sent to your Mobile. Please check your inbox.",
        data: {
          otpData: {
            Status: "Success",
            Details: "5f1c8b3e-4a2d-11ef-8c2a-0200cd936042",
          },
          isFirst: false,
        },
      },
    },
    "cust.auth.otpMobileVerify": {
      status: 200,
      body: { success: true, message: "OTP Verification successful", data: loginData },
    },
    "cust.auth.otpEmailSend": {
      status: 200,
      body: {
        success: true,
        message: "OTP has been sent to your Email. Please check your inbox.",
        data: { isFirst: false },
      },
    },
    "cust.auth.otpEmailVerify": {
      status: 200,
      body: { success: true, message: "OTP Verification successful", data: loginData },
    },
  };
};

/**
 * Saved example me koi asli credential na jaye.
 * Data (naam/pata/mobile) waisa hi rehta hai — wo StageDB me pehle se hai —
 * par JWT ek chaalu credential hai, wo placeholder se badal dete hain.
 */
const JWT_PLACEHOLDER =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.<payload>.<signature>";
const redact = (node) => {
  if (Array.isArray(node)) return node.map(redact);
  if (node && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === "token" && typeof v === "string" && v.startsWith("ey")) {
        out[k] = JWT_PLACEHOLDER;
      } else if (k === "password") {
        // hona hi nahi chahiye (fix ho chuka hai) — phir bhi safety net
        out[k] = "<hidden>";
      } else {
        out[k] = redact(v);
      }
    }
    return out;
  }
  return node;
};

const SYNTH = synthetic();
const SYNTH_NOTE =
  "\n\n---\n\n> ⚠️ **Iska saved example documented hai, live capture nahi.** " +
  "Ye endpoint chalane pe asli SMS/email chala jata hai aur OTP verify nahi ho sakta, " +
  "isliye example controller ke asli response shape se banaya gaya hai " +
  "(user object asli login response ka hai). Baaki sab endpoints ke examples " +
  "StageDB pe asli call maar ke record kiye gaye hain.";

// ─────────────────────────────────────────────────────────────
/** `/orders/{{orderId}}/cancel` → Postman url object */
const buildUrl = (p, query) => {
  const clean = p.replace(/^\//, "");
  const segments = clean.split("/").filter(Boolean);
  const qs = (query || []).filter((q) => !q.disabled);
  const raw =
    `{{baseUrl}}/${clean}` +
    (qs.length ? `?${qs.map((q) => `${q.key}=${q.value}`).join("&")}` : "");
  const url = { raw, host: ["{{baseUrl}}"], path: segments };
  if (query && query.length) {
    url.query = query.map((q) => ({
      key: q.key,
      value: q.value,
      description: q.description || "",
      ...(q.disabled ? { disabled: true } : {}),
    }));
  }
  return url;
};

const buildBody = (body) => {
  if (!body) return undefined;
  if (body.type === "json") {
    return {
      mode: "raw",
      raw: JSON.stringify(body.value, null, 2),
      options: { raw: { language: "json" } },
    };
  }
  return {
    mode: "formdata",
    formdata: body.fields.map((f) =>
      f.type === "file"
        ? { key: f.key, type: "file", src: [], description: f.description || "" }
        : {
            key: f.key,
            value: f.value,
            type: "text",
            description: f.description || "",
          },
    ),
  };
};

const buildHeaders = (body) => {
  const h = [];
  if (body && body.type === "json") {
    h.push({ key: "Content-Type", value: "application/json" });
  }
  // form-data pe Content-Type Postman khud lagata hai (boundary ke saath)
  return h;
};

const buildAuth = (auth) =>
  auth
    ? { type: "bearer", bearer: [{ key: "token", value: `{{${auth}}}`, type: "string" }] }
    : { type: "noauth" };

/** Test script ka expected status captured example se mila do. */
const alignScript = (lines, code) => {
  if (!lines || !lines.length || !code) return lines || [];
  const text = STATUS_TEXT[code] || "OK";
  return lines.map((l) =>
    l
      .replace(/pm\.response\.to\.have\.status\(\d{3}\)/g, `pm.response.to.have.status(${code})`)
      .replace(/pm\.test\("\d{3}\s*[A-Za-z ]*/g, `pm.test("${code} ${text}`),
  );
};

const buildExample = (entry, ex, isSynth) => {
  const code = ex.status;
  const req = {
    method: entry.method,
    header: buildHeaders(entry.body),
    url: buildUrl(entry.path, entry.query),
  };
  const b = buildBody(entry.body);
  if (b) req.body = b;
  if (entry.auth) req.auth = buildAuth(entry.auth);

  return {
    id: uid(),
    name: `${code} · ${STATUS_TEXT[code] || "Success"}${isSynth ? " (documented)" : ""}`,
    originalRequest: req,
    status: STATUS_TEXT[code] || "OK",
    code,
    _postman_previewlanguage: "json",
    header: [{ key: "Content-Type", value: "application/json; charset=utf-8" }],
    cookie: [],
    body: JSON.stringify(redact(ex.body), null, 2),
  };
};

// ─────────────────────────────────────────────────────────────
let total = 0;
let withExample = 0;
let synthCount = 0;
const noExample = [];

const buildRequest = (entry) => {
  total++;
  const live = EXAMPLES[entry.id];
  const synth = SYNTH[entry.id];
  const ex = live || synth;
  if (live) withExample++;
  else if (synth) synthCount++;
  else noExample.push(entry.id);

  const item = {
    id: uid(),
    name: entry.name,
    request: {
      method: entry.method,
      auth: buildAuth(entry.auth),
      header: buildHeaders(entry.body),
      url: buildUrl(entry.path, entry.query),
      description: entry.desc + (synth && !live ? SYNTH_NOTE : ""),
    },
    response: ex ? [buildExample(entry, ex, !live)] : [],
  };
  const b = buildBody(entry.body);
  if (b) item.request.body = b;

  const script = alignScript(entry.script, ex && ex.status);
  if (script.length) {
    item.event = [
      { listen: "test", script: { id: uid(), type: "text/javascript", exec: script } },
    ];
  }
  return item;
};

/** group ke hisaab se subfolders bana do, order preserve karke. */
const buildFolder = (name, entries, description) => {
  const groups = [];
  const byGroup = new Map();
  entries.forEach((e) => {
    if (!byGroup.has(e.group)) {
      byGroup.set(e.group, []);
      groups.push(e.group);
    }
    byGroup.get(e.group).push(e);
  });
  return {
    id: uid(),
    name,
    description,
    item: groups.map((g) => ({
      id: uid(),
      name: g,
      item: byGroup.get(g).map(buildRequest),
    })),
  };
};

// ─────────────────────────────────────────────────────────────
const PRE_REQUEST = [
  "// `target` badal ke baseUrl switch karo: local | stage | prod",
  "// (env me localUrl / stageUrl / prodUrl already bhare hue hain)",
  'const target = String(pm.environment.get("target") || "local").toLowerCase();',
  "const map = {",
  '    local: pm.environment.get("localUrl"),',
  '    stage: pm.environment.get("stageUrl"),',
  '    prod:  pm.environment.get("prodUrl"),',
  "};",
  "const url = map[target];",
  'if (url) pm.environment.set("baseUrl", url);',
  "else console.log('⚠️ target \"' + target + '\" ka koi URL env me nahi hai');",
];

const COLLECTION_DESC = fs
  .readFileSync(path.join(__dirname, "collection-description.md"), "utf8")
  .trim();

const collection = {
  info: {
    _postman_id: uid(),
    name: "NVS Rice Mart — Vendor Platform API",
    description: COLLECTION_DESC,
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  event: [
    { listen: "prerequest", script: { id: uid(), type: "text/javascript", exec: PRE_REQUEST } },
  ],
  item: [
    buildFolder(
      "1 · Customer (mobile app)",
      SPEC.Customer,
      [
        "**Mobile app ka poora flow — login se delivery tak, isi order me.**",
        "",
        "Sabse pehle `01 Auth → 06 Login with password` chalao; token `{{customerToken}}` me save ho jayega.",
        "",
        "Sabse zyada dhyan in teen pe do — inke bina app tutegi:",
        "- **`400 PINCODE_REQUIRED`** → address add karne ki screen dikhao (stage pe ~93% customers ke paas address hai hi nahi)",
        "- **`404 PINCODE_NOT_SERVICEABLE`** → \"abhi yahan available nahi\" screen",
        "- **`409 CART_VENDOR_CONFLICT`** → \"cart clear karke naya item add karein?\" dialog, phir `?replaceCart=true`",
        "",
        "Aur order se pehle ye sequence tod mat dena: **verify-delivery → preview → create**.",
      ].join("\n"),
    ),
    buildFolder(
      "2 · Vendor (shop panel)",
      SPEC.Vendor,
      [
        "**Vendor panel ka flow — login se order DELIVERED tak.**",
        "",
        "Sabse pehle `01 Auth → 01 Vendor login` chalao; token `{{vendorToken}}` aur `{{vendorId}}` save ho jayenge.",
        "",
        "**Vendor sirf 2 cheezein kar sakta hai:** apna catalog manage karna, aur `PUT /vendors/me/delivery` se delivery charge ki setting badalna.",
        "Shop name, mobile, address, branches, pincode — **sab admin ke haath me hai**. Panel me wo fields read-only rakho.",
        "",
        "⚠️ `isActive` ab **toggle nahi, set** hai (category/subcategory/product teeno me). Purana \"bas field bhej do\" wala code hata dena.",
      ].join("\n"),
    ),
    buildFolder(
      "3 · Admin (admin panel)",
      SPEC.Admin,
      [
        "**Admin panel ka flow — vendor onboarding se monitoring tak.**",
        "",
        "Sabse pehle `01 Auth → 01 Admin login` chalao; token `{{adminToken}}` me save ho jayega.",
        "",
        "**Onboarding ka order fix hai:**",
        "```",
        "vendor create  →  branch  →  lookup (pincode free hai?)  →  service area assign",
        "```",
        "Service area assign hone se **pehle** us vendor ka catalog kisi customer ko nahi dikhta.",
        "",
        "⚠️ **Admin order ka status nahi badal sakta** — `PUT /orders/update/:id` hata diya gaya hai. Panel me status change ke buttons mat banao.",
      ].join("\n"),
    ),
  ],
};

// ─────────────────────────────────────────────────────────────
const envVar = (key, value, type = "default", enabled = true) => ({
  key,
  value,
  type,
  enabled,
});

const environment = {
  id: uid(),
  name: "NVS Rice Mart",
  values: [
    envVar("target", "stage"),
    envVar("baseUrl", STAGE_URL),
    envVar("localUrl", LOCAL_URL),
    envVar("stageUrl", STAGE_URL),
    envVar("prodUrl", PROD_URL),

    envVar("customerToken", "", "secret"),
    envVar("vendorToken", "", "secret"),
    envVar("adminToken", "", "secret"),

    envVar("customerId", ""),
    envVar("vendorId", ""),
    envVar("adminId", ""),
    envVar("someUserId", ""),

    envVar("locationId", ""),
    envVar("branchId", ""),
    envVar("serviceAreaId", ""),
    envVar("categoryId", ""),
    envVar("subCategoryId", ""),
    envVar("productId", ""),
    envVar("orderId", ""),
    envVar("orderNumber", ""),
    envVar("bannerId", ""),
    envVar("termId", ""),
    envVar("privacyId", ""),
    envVar("otpSessionId", ""),
  ],
  _postman_variable_scope: "environment",
  _postman_exported_at: new Date().toISOString(),
  _postman_exported_using: "nvs-rice-mart/postman/build.js",
};

// ─────────────────────────────────────────────────────────────
fs.writeFileSync(COLLECTION_OUT, JSON.stringify(collection, null, 2));
fs.writeFileSync(ENV_OUT, JSON.stringify(environment, null, 2));

const folders = collection.item.map(
  (f) => `${f.name}: ${f.item.reduce((n, g) => n + g.item.length, 0)} requests / ${f.item.length} groups`,
);

console.log("\n📮 POSTMAN COLLECTION BUILD\n");
folders.forEach((f) => console.log(`   ${f}`));
console.log(`\n   total requests      ${total}`);
console.log(`   live examples       ${withExample}`);
console.log(`   documented examples ${synthCount}`);
console.log(`   bina example        ${noExample.length}${noExample.length ? ` → ${noExample.join(", ")}` : ""}`);
console.log(`\n   ${path.relative(process.cwd(), COLLECTION_OUT)}`);
console.log(`   ${path.relative(process.cwd(), ENV_OUT)}\n`);

if (noExample.length) process.exitCode = 1;
