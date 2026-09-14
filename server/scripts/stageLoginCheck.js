/* eslint-disable no-console */
/**
 * STAGE HEALTH CHECK — seeded logins kaam kar rahe hain aur teeno customer
 * states sahi response de rahe hain?
 *
 *   MONGO_URL="<stage>" DISABLE_PUSH=true node scripts/stageLoginCheck.js
 *
 * Frontend team ise kabhi bhi chala ke confirm kar sakti hai ki stage theek
 * hai (ya problem unke code me hai).
 */
require("dotenv").config();
const express = require("express");
const fileUpload = require("express-fileupload");
const mongoose = require("mongoose");

const { errorHandler } = require("../middlewares");
const { throwError } = require("../utils");

let BASE;
const call = async (m, p, { token, body } = {}) => {
  const r = await fetch(`${BASE}${p}`, {
    method: m,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let j = null;
  try {
    j = await r.json();
  } catch {
    /* non-json */
  }
  return { status: r.status, ...j };
};

const ACCOUNTS = [
  { label: "admin", type: "email", id: "ricemartnvs@gmail.com", pw: "Admin@123", role: "admin" },
  { label: "vendor", type: "email", id: "nagraj@gmail.com", pw: "nagraj@123", role: "vendor" },
  { label: "customer (in-area)", type: "mobile", id: "9886061450", pw: "Stage@123", role: "user", expect: 200 },
  { label: "customer (out-area)", type: "mobile", id: "9620508145", pw: "Stage@123", role: "user", expect: 404 },
  { label: "customer (no address)", type: "mobile", id: "8660222341", pw: "Stage@123", role: "user", expect: 400 },
];

const run = async () => {
  await mongoose.connect(process.env.MONGO_URL);
  const dbName = mongoose.connection.name;
  if (/prod/i.test(dbName)) throw new Error(`ABORT: PRODUCTION DB (${dbName})`);
  console.log(`\n🔑 STAGE HEALTH CHECK   DB: ${dbName}\n`);

  const app = express();
  app.use(fileUpload({ useTempFiles: true, tempFileDir: "/tmp/" }));
  app.use(express.json());
  app.use("/nvs-rice-mart/", require("../routes"));
  app.use(() => throwError(404, "Invalid API"));
  app.use(errorHandler);
  const server = await new Promise((r) => {
    const s = app.listen(0, () => r(s));
  });
  BASE = `http://127.0.0.1:${server.address().port}/nvs-rice-mart`;

  let fail = 0;
  for (const a of ACCOUNTS) {
    const body = { type: a.type, password: a.pw, role: a.role };
    body[a.type === "email" ? "email" : "mobile"] = a.id;
    const r = await call("POST", "/auth/login", { body });
    const tok = r.data?.token;
    if (!tok) {
      fail++;
      console.log(`  ❌ ${a.label.padEnd(24)} login FAIL — ${r.status} ${r.message}`);
      continue;
    }
    console.log(`  ✅ ${a.label.padEnd(24)} login OK   (${a.id})`);

    if (a.role === "user") {
      const c = await call("GET", "/categories/getAll?limit=5", { token: tok });
      const okState = c.status === a.expect;
      if (!okState) fail++;
      const tag =
        c.status === 200
          ? `200 · ${c.data?.total} categories`
          : `${c.status} ${c.code || c.message}`;
      console.log(`     ${okState ? "✅" : "❌"} catalog → ${tag}   (expected ${a.expect})`);
    }
    if (a.role === "vendor") {
      const o = await call("GET", "/orders/vendor/summary", { token: tok });
      const okState = o.status === 200 && o.data?.totalOrders >= 76;
      if (!okState) fail++;
      console.log(
        `     ${okState ? "✅" : "❌"} vendor/summary → ${o.status} · ${o.data?.totalOrders} orders · ₹${o.data?.lifetimeRevenue}`,
      );
      const p = await call("GET", "/products/getAll?limit=200", { token: tok });
      console.log(`     ${p.status === 200 ? "✅" : "❌"} vendor catalog → ${p.status} · ${p.data?.total} products`);
      if (p.status !== 200) fail++;
    }
    if (a.role === "admin") {
      const s = await call("GET", "/orders/admin/summary", { token: tok });
      const okState = s.status === 200;
      if (!okState) fail++;
      console.log(
        `     ${okState ? "✅" : "❌"} admin/summary → ${s.status} · ${s.data?.totals?.totalOrders} orders · ${s.data?.vendors?.length} vendor(s)`,
      );
      const v = await call("GET", "/vendors/getAll", { token: tok });
      console.log(`     ${v.status === 200 ? "✅" : "❌"} vendors list → ${v.status} · ${v.data?.total} vendor(s)`);
      if (v.status !== 200) fail++;
    }
  }

  server.close();
  await mongoose.disconnect();
  console.log(
    fail ? `\n❌ ${fail} check fail\n` : "\n✅ stage bilkul theek hai — frontend shuru kar sakta hai\n",
  );
  process.exit(fail ? 1 : 0);
};

run().catch(async (e) => {
  console.error("\n💥", e.message);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
