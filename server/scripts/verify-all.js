/* eslint-disable no-console */
/**
 * Saare phase verifications ek saath.
 *
 *   node scripts/verify-all.js
 *
 * Koi DB connection nahi — sirf logic, schema, routes aur validators.
 */
const { execFileSync } = require("child_process");
const path = require("path");

const SUITES = [
  ["Phase 0 — security & bug hardening", "verify-phase0.js"],
  ["Phase 1 — vendor foundation", "verify-phase1.js"],
  ["Phase 2 — location-aware catalog", "verify-phase2.js"],
  ["Phase 3 — vendor-locked cart", "verify-phase3.js"],
  ["Phase 4+5 — checkout & vendor orders", "verify-phase45.js"],
];

let totalPass = 0;
let totalFail = 0;
const rows = [];

for (const [label, file] of SUITES) {
  let out = "";
  let failed = false;
  try {
    out = execFileSync(process.execPath, [path.join(__dirname, file)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    out = `${e.stdout || ""}${e.stderr || ""}`;
    failed = true;
  }
  const m = /PASS:\s*(\d+)\s+FAIL:\s*(\d+)/.exec(out);
  const p = m ? Number(m[1]) : 0;
  const f = m ? Number(m[2]) : 1;
  totalPass += p;
  totalFail += f;
  rows.push({ label, p, f });
  if (f) {
    console.log(`\n${"!".repeat(72)}\n${label} — FAILURES\n${"!".repeat(72)}`);
    out
      .split("\n")
      .filter((l) => l.includes("❌"))
      .forEach((l) => console.log(l));
    if (!m && failed) console.log(out.split("\n").slice(0, 15).join("\n"));
  }
}

console.log(`\n${"═".repeat(72)}`);
rows.forEach((r) =>
  console.log(
    `  ${r.f ? "❌" : "✅"} ${r.label.padEnd(44)} ${String(r.p).padStart(4)} pass  ${String(r.f).padStart(3)} fail`,
  ),
);
console.log("═".repeat(72));
console.log(`  TOTAL: ${totalPass} pass, ${totalFail} fail`);
console.log("═".repeat(72));
process.exit(totalFail ? 1 : 0);
