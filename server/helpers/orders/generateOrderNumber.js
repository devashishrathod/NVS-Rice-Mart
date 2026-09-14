const Counter = require("../../models/Counter");

/**
 * `NVS-2609-000077` — har mahine ka apna counter.
 * `findOneAndUpdate` + `$inc` atomic hai, isliye concurrent orders me bhi
 * duplicate nahi banega.
 */
exports.generateOrderNumber = async (session) => {
  const now = new Date();
  const ym = `${String(now.getFullYear()).slice(2)}${String(
    now.getMonth() + 1,
  ).padStart(2, "0")}`;

  const counter = await Counter.findOneAndUpdate(
    { _id: `order:${ym}` },
    { $inc: { seq: 1 } },
    {
      returnDocument: "after",
      upsert: true,
      ...(session ? { session } : {}),
    },
  );

  return `NVS-${ym}-${String(counter.seq).padStart(6, "0")}`;
};
