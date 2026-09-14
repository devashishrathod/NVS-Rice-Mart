const Setting = require("../../models/Setting");

exports.getSetting = async () => {
  // `shopLocationId` ab deprecated hai (pickup vendor ke default branch se
  // aata hai), isliye populate hata diya — koi zaroorat nahi.
  return await Setting.findOne().select("delivery createdAt updatedAt");
};
