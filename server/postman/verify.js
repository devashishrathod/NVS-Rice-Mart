/* eslint-disable no-console */
/**
 * POSTMAN COLLECTION VERIFY
 *
 *   node postman/verify.js
 *
 * Check karta hai:
 *   1. Collection aur environment valid JSON + sahi structure
 *   2. Server ka HAR route collection me hai (aur collection me koi aisa
 *      route nahi jo server pe hai hi nahi)
 *   3. Har request ka saved example maujood aur 2xx hai
 *   4. Har `{{variable}}` environment me defined hai
 *   5. Login requests token save karti hain
 *   6. Har request me description hai
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || "verify-only";
const fs = require("fs");
const path = require("path");

const COLLECTION = require("./NVS-Rice-Mart.postman_collection.json");
const ENVIRONMENT = require("./NVS-Rice-Mart.postman_environment.json");

let pass = 0;
let fail = 0;
const failures = [];
const ok = (name, cond, extra = "") => {
  if (cond) {
    pass++;
  } else {
    fail++;
    failures.push(`${name}${extra ? ` — ${extra}` : ""}`);
    console.log(`  ❌ ${name}  ${extra}`);
  }
};
const hr = (t) => console.log(`\n${"─".repeat(76)}\n  ${t}\n${"─".repeat(76)}`);

// ─────────────────────────────────────────────────────────────
/** Collection ke saare requests flat list me. */
const walk = (items, trail = []) => {
  const out = [];
  (items || []).forEach((it) => {
    if (it.item) out.push(...walk(it.item, [...trail, it.name]));
    else out.push({ ...it, trail: [...trail, it.name].join(" / ") });
  });
  return out;
};
const requests = walk(COLLECTION.item);

/** `{{baseUrl}}/orders/{{orderId}}/cancel` → `/orders/:id/cancel` jaisa key. */
const urlPath = (u) =>
  "/" +
  (u.path || [])
    .map((s) => (String(s).startsWith("{{") ? ":param" : s))
    .join("/");

// ─────────────────────────────────────────────────────────────
hr("1. Structure");

ok("collection schema v2.1", /v2\.1\.0/.test(COLLECTION.info.schema), COLLECTION.info.schema);
ok("collection ka naam hai", !!COLLECTION.info.name);
ok("collection description hai (>2000 chars)", (COLLECTION.info.description || "").length > 2000);
ok("3 top-level folder", COLLECTION.item.length === 3, `mile ${COLLECTION.item.length}`);
COLLECTION.item.forEach((f) => {
  ok(`folder "${f.name}" me description`, !!f.description);
  ok(`folder "${f.name}" me groups`, (f.item || []).length > 0);
});
ok(
  "collection pre-request script (target → baseUrl)",
  (COLLECTION.event || []).some(
    (e) => e.listen === "prerequest" && e.script.exec.join("\n").includes("baseUrl"),
  ),
);
ok("environment me values", (ENVIRONMENT.values || []).length > 10);

// ─────────────────────────────────────────────────────────────
hr("2. Server ke saare routes cover hue?");

const MW = require("../middlewares");
const routeFiles = fs
  .readdirSync(path.join(__dirname, "..", "routes"))
  .filter((f) => f !== "index.js" && f.endsWith(".js"));

const serverRoutes = new Set();
routeFiles.forEach((f) => {
  const mod = require(path.join(__dirname, "..", "routes", f));
  const r = mod.router || mod;
  const prefix = `/${f.replace(/\.js$/, "")}`;
  (r.stack || [])
    .filter((l) => l.route)
    .forEach((l) => {
      const method = Object.keys(l.route.methods)[0].toUpperCase();
      const p = (prefix + l.route.path).replace(/:[^/]+/g, ":param");
      serverRoutes.add(`${method} ${p}`);
    });
});
void MW;

const collectionRoutes = new Set(
  requests.map((r) => `${r.request.method} ${urlPath(r.request.url)}`),
);

const missing = [...serverRoutes].filter((r) => !collectionRoutes.has(r)).sort();
const ghost = [...collectionRoutes].filter((r) => !serverRoutes.has(r)).sort();

console.log(`  server routes: ${serverRoutes.size}   collection routes: ${collectionRoutes.size}`);
ok(
  "har server route collection me hai",
  missing.length === 0,
  missing.length ? `chhoot gaye: ${missing.join(" | ")}` : "",
);
ok(
  "collection me koi ghost route nahi",
  ghost.length === 0,
  ghost.length ? `server pe nahi: ${ghost.join(" | ")}` : "",
);

// ─────────────────────────────────────────────────────────────
hr("3. Saved examples");

let live = 0;
let documented = 0;
requests.forEach((r) => {
  const ex = (r.response || [])[0];
  ok(`${r.name} — saved example hai`, !!ex);
  if (!ex) return;
  ok(`${r.name} — example 2xx hai`, ex.code >= 200 && ex.code < 300, `code ${ex.code}`);
  let parsed = null;
  try {
    parsed = JSON.parse(ex.body);
  } catch {
    /* niche fail hoga */
  }
  ok(`${r.name} — example body valid JSON`, !!parsed);
  ok(
    `${r.name} — example me success envelope`,
    parsed && parsed.success === true,
    parsed ? `success=${parsed.success}` : "",
  );
  if (/documented/.test(ex.name)) documented++;
  else live++;
});
console.log(`  live-captured: ${live}   documented: ${documented}`);

// ─────────────────────────────────────────────────────────────
hr("4. Environment variables");

const envKeys = new Set(ENVIRONMENT.values.map((v) => v.key));
const used = new Set();
const scan = (s) => {
  (String(s).match(/\{\{([a-zA-Z0-9_]+)\}\}/g) || []).forEach((m) =>
    used.add(m.slice(2, -2)),
  );
};
requests.forEach((r) => {
  scan(r.request.url.raw);
  (r.request.url.query || []).forEach((q) => scan(q.value));
  if (r.request.body) {
    if (r.request.body.raw) scan(r.request.body.raw);
    (r.request.body.formdata || []).forEach((f) => scan(f.value || ""));
  }
  if (r.request.auth && r.request.auth.bearer) {
    r.request.auth.bearer.forEach((b) => scan(b.value));
  }
  (r.event || []).forEach((e) => scan(e.script.exec.join("\n")));
});

const undefinedVars = [...used].filter((v) => !envKeys.has(v)).sort();
ok(
  "har {{variable}} environment me defined",
  undefinedVars.length === 0,
  undefinedVars.join(", "),
);
console.log(`  use ho rahe: ${used.size}   env me: ${envKeys.size}`);

["baseUrl", "stageUrl", "prodUrl", "customerToken", "vendorToken", "adminToken"].forEach((k) =>
  ok(`env me "${k}" hai`, envKeys.has(k)),
);
ok(
  "localUrl localhost pe point karta hai",
  /localhost|127\.0\.0\.1/.test(
    (ENVIRONMENT.values.find((v) => v.key === "localUrl") || {}).value || "",
  ),
);
["customerToken", "vendorToken", "adminToken"].forEach((k) => {
  const v = ENVIRONMENT.values.find((x) => x.key === k);
  ok(`"${k}" secret type hai`, v && v.type === "secret");
  ok(`"${k}" khaali start hota hai`, v && v.value === "");
});

// ─────────────────────────────────────────────────────────────
hr("5. Token save scripts");

// `loginOrSignin-with-*` sirf OTP bhejta hai, token nahi deta — isliye
// usse token save karne ki umeed nahi rakhni. Baaki sab token dete hain.
const loginRequests = requests.filter((r) => {
  const u = r.request.url.raw;
  if (u.includes("loginOrSignin")) return false;
  return (
    u.includes("/auth/login") || u.includes("/auth/register") || u.includes("verify-otp")
  );
});
ok("token dene wali auth requests mili", loginRequests.length >= 6, `${loginRequests.length}`);

const otpSendRequests = requests.filter((r) => r.request.url.raw.includes("loginOrSignin"));
ok("OTP bhejne wali 2 requests hain", otpSendRequests.length === 2, `${otpSendRequests.length}`);
otpSendRequests.forEach((r) => {
  const code = (r.event || []).map((e) => e.script.exec.join("\n")).join("\n");
  ok(
    `${r.name} — token save NAHI karti (sahi hai, ye token deti hi nahi)`,
    !/pm\.environment\.set\("(customer|vendor|admin)Token"/.test(code),
  );
});
const mobileOtpSend = otpSendRequests.find((r) => r.request.url.raw.includes("with-mobile"));
ok(
  "mobile OTP send → otpSessionId save karta hai",
  mobileOtpSend &&
    (mobileOtpSend.event || [])
      .map((e) => e.script.exec.join("\n"))
      .join("\n")
      .includes('pm.environment.set("otpSessionId"'),
);
loginRequests.forEach((r) => {
  const code = (r.event || []).map((e) => e.script.exec.join("\n")).join("\n");
  ok(
    `${r.name} — token env me save karta hai`,
    /pm\.environment\.set\("(customer|vendor|admin)Token"/.test(code),
  );
});

["customerToken", "vendorToken", "adminToken"].forEach((tok) => {
  const setter = requests.find((r) =>
    (r.event || [])
      .map((e) => e.script.exec.join("\n"))
      .join("\n")
      .includes(`pm.environment.set("${tok}"`),
  );
  ok(`koi request "${tok}" set karti hai`, !!setter, setter ? "" : "koi nahi mila");
});

// ─────────────────────────────────────────────────────────────
hr("6. Descriptions aur auth");

requests.forEach((r) => {
  const d = r.request.description || "";
  ok(`${r.name} — description hai`, d.length > 80, `${d.length} chars`);
  ok(`${r.name} — auth set hai`, !!r.request.auth, "");
});

const publicPaths = ["/auth/login", "/auth/register", "/auth/loginOrSignin", "/auth/verify-otp"];
requests.forEach((r) => {
  const isPublic = publicPaths.some((p) => r.request.url.raw.includes(p));
  const noauth = r.request.auth && r.request.auth.type === "noauth";
  ok(
    `${r.name} — auth ${isPublic ? "noauth" : "bearer"} hona chahiye`,
    isPublic ? noauth : !noauth,
  );
});

// ─────────────────────────────────────────────────────────────
hr("RESULT");
console.log(`\n  ✅ ${pass} pass    ${fail ? `❌ ${fail} fail` : "❌ 0 fail"}\n`);
if (fail) {
  console.log("  Fail hui checks:");
  failures.slice(0, 40).forEach((f) => console.log(`    • ${f}`));
  if (failures.length > 40) console.log(`    … aur ${failures.length - 40}`);
  console.log("");
}
process.exit(fail ? 1 : 0);
