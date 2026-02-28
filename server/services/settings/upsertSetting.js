const Setting = require("../../models/Setting");

exports.upsertSetting = async (payload) => {
  const existing = await Setting.findOne();
  if (!existing) {
    return await Setting.create(payload);
  }
  if (payload && typeof payload === "object") {
    const { delivery, ...rest } = payload;
    if (rest && Object.keys(rest).length) {
      Object.entries(rest).forEach(([key, value]) => {
        if (value !== undefined) existing.set(key, value);
      });
    }
    if (delivery && typeof delivery === "object") {
      Object.entries(delivery).forEach(([key, value]) => {
        if (value !== undefined) existing.set(`delivery.${key}`, value);
      });
    }
  }
  return await existing.save();
};
