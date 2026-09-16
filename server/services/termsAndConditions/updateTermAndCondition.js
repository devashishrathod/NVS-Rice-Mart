const TermAndCondition = require("../../models/Terms&Condition");
const {
  throwError,
  validateObjectId,
  toTitleCase,
  toSentenceCase,
  ciExact,
} = require("../../utils");

exports.updateTermAndCondition = async (id, payload) => {
  validateObjectId(id, "TermAndCondition Id");
  const result = await TermAndCondition.findById(id);
  if (!result || result.isDeleted) {
    throwError(404, "Term and condition not found");
  }
  let { title, description, isActive } = payload;
  if (typeof isActive !== "undefined") {
    // Pehle ye `!result.isActive` (toggle) karta tha — client jo bhejta tha
    // usse ulta ho jata tha. Ab bheji hui value hi set hoti hai.
    result.isActive = isActive === true || isActive === "true";
  }
  if (title) {
    title = toTitleCase(title);
    const existing = await TermAndCondition.findOne({
      _id: { $ne: id },
      title: ciExact(title),
      isDeleted: false,
    });
    if (existing) {
      throwError(409, "Another term and condition exists with this title");
    }
    result.title = title;
  }
  if (description) result.description = toSentenceCase(description);
  result.updatedAt = new Date();
  await result.save();
  return result;
};
