const PrivacyAndPolicy = require("../../models/Privacy&Policy");
const {
  throwError,
  validateObjectId,
  toTitleCase,
  toSentenceCase,
  ciExact,
} = require("../../utils");

exports.updatePrivacyAndPolicy = async (id, payload) => {
  validateObjectId(id, "PrivacyAndPolicy Id");
  const result = await PrivacyAndPolicy.findById(id);
  if (!result || result.isDeleted) {
    throwError(404, "Privacy and policy not found");
  }
  let { title, description, isActive } = payload;
  if (typeof isActive !== "undefined") {
    // Pehle ye `!result.isActive` (toggle) karta tha — client jo bhejta tha
    // usse ulta ho jata tha. Ab bheji hui value hi set hoti hai.
    result.isActive = isActive === true || isActive === "true";
  }
  if (title) {
    title = toTitleCase(title);
    const existing = await PrivacyAndPolicy.findOne({
      _id: { $ne: id },
      title: ciExact(title),
      isDeleted: false,
    });
    if (existing) {
      throwError(409, "Another privacy and policy exists with this title");
    }
    result.title = title;
  }
  if (description) result.description = toSentenceCase(description);
  result.updatedAt = new Date();
  await result.save();
  return result;
};
