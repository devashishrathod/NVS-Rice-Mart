// const ProductLocation = require("../../models/ProductLocation");
// const {
//   asyncWrapper,
//   sendSuccess,
//   throwError,
//   cleanJoiError,
// } = require("../../utils");

// exports.checkProductDelivery = asyncWrapper(async (req, res) => {
//   const productId = req.params?.productId;
//   const { zipcode } = req.body;
//   if (!zipcode) throwError(400, "zipcode is required");
//   const pinMatch = await ProductLocation.findOne({
//     productId,
//     isDeleted: false,
//     isActive: true,
//   })
//     .populate({
//       path: "locationId",
//       match: { zipcode: zipcode },
//     })
//     .lean();
//   const isDeliverable = pinMatch?.locationId ? true : false;
//   return sendSuccess(res, 200, "Delivery check completed", { isDeliverable });
// });
