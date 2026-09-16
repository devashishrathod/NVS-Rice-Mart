const TermAndCondition = require("../../models/Terms&Condition");
const { throwError, toTitleCase, toSentenceCase, ciExact } = require("../../utils");

exports.createTermAndCondition = async (payload, image) => {
  let { title, description, isActive } = payload;
  title = toTitleCase(title);
  description = toSentenceCase(description);
  const existingTermAndCondition = await TermAndCondition.findOne({
    title: ciExact(title),
    isDeleted: false,
  });
  if (existingTermAndCondition) {
    throwError(400, "Term and condition already exist with this title");
  }
  return await TermAndCondition.create({
    title,
    description,
    isActive,
  });
};
