const PrivacyAndPolicy = require("../../models/Privacy&Policy");
const { throwError, toTitleCase, toSentenceCase, ciExact } = require("../../utils");

exports.createPrivacyAndPolicy = async (payload, image) => {
  let { title, description, isActive } = payload;
  title = toTitleCase(title);
  description = toSentenceCase(description);
  const existingPrivacyAndPolicy = await PrivacyAndPolicy.findOne({
    title: ciExact(title),
    isDeleted: false,
  });
  if (existingPrivacyAndPolicy) {
    throwError(400, "Privacy and policy already exist with this title");
  }
  return await PrivacyAndPolicy.create({
    title,
    description,
    isActive,
  });
};
