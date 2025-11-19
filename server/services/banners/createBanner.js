const Banner = require("../../models/Banner");
const { throwError } = require("../../utils");
const { uploadImage, uploadVideo } = require("../uploads");

exports.createBanner = async (video, image, payload) => {
  let { name, description, isActive } = payload;
  name = name?.toLowerCase();
  description = description?.toLowerCase();
  const existingBanner = await Banner.findOne({ name, isDeleted: false });
  if (existingBanner) {
    throwError(400, "Banner already exist with this name");
  }
  if (!video) throwError(422, "video is required");
  const videoUrl = await uploadVideo(video.tempFilePath);
  let imageUrl;
  if (image) imageUrl = await uploadImage(image.tempFilePath);
  return await Banner.create({
    name,
    description,
    image: imageUrl,
    video: videoUrl,
    isActive,
  });
};
