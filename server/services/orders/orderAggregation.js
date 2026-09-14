const mongoose = require("mongoose");

const toObjectId = (id) => {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return new mongoose.Types.ObjectId(id);
};

exports.buildOrderPipeline = ({ match = {}, sortStage = null } = {}) => {
  const pipeline = [{ $match: match }];

  pipeline.push(
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
  );

  pipeline.push(
    {
      $lookup: {
        from: "locations",
        localField: "locationId",
        foreignField: "_id",
        as: "deliveryLocation",
      },
    },
    {
      $unwind: {
        path: "$deliveryLocation",
        preserveNullAndEmptyArrays: true,
      },
    },
  );

  // Vendor ki shop details — customer aur admin dono ko chahiye
  pipeline.push(
    {
      $lookup: {
        from: "vendorprofiles",
        localField: "vendorId",
        foreignField: "vendorId",
        as: "vendorProfile",
      },
    },
    { $unwind: { path: "$vendorProfile", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "locations",
        localField: "vendorLocationId",
        foreignField: "_id",
        as: "pickupLocation",
      },
    },
    { $unwind: { path: "$pickupLocation", preserveNullAndEmptyArrays: true } },
  );

  pipeline.push({
    $lookup: {
      from: "products",
      let: { productIds: "$items.productId" },
      pipeline: [
        {
          $match: {
            $expr: { $in: ["$_id", { $ifNull: ["$$productIds", []] }] },
          },
        },
        {
          $project: {
            name: 1,
            brand: 1,
            generalPrice: 1,
            SKU: 1,
            weightInKg: 1,
            image: 1,
            isActive: 1,
            isDeleted: 1,
          },
        },
      ],
      as: "products",
    },
  });

  pipeline.push({
    $addFields: {
      items: {
        $map: {
          input: "$items",
          as: "it",
          in: {
            productId: "$$it.productId",
            quantity: "$$it.quantity",
            price: "$$it.price",
            // Order ke waqt ka snapshot — product delete ho jaye to bhi
            // purana order readable rehta hai
            productSnapshot: "$$it.productSnapshot",
            product: {
              $first: {
                $filter: {
                  input: "$products",
                  as: "p",
                  cond: { $eq: ["$$p._id", "$$it.productId"] },
                },
              },
            },
          },
        },
      },
    },
  });

  pipeline.push({
    $lookup: {
      from: "transactions",
      localField: "_id",
      foreignField: "orderId",
      as: "transactions",
    },
  });

  pipeline.push({
    $project: {
      // userId / vendorId raw ids — ownership check aur client-side
      // filtering dono ke liye chahiye
      userId: 1,
      vendorId: 1,
      vendorLocationId: 1,
      orderNumber: 1,
      cartId: 1,
      locationId: 1,
      distanceKm: 1,
      deliveryCharge: 1,
      subTotal: 1,
      payableAmount: 1,
      paymentMethod: 1,
      status: 1,
      paymentStatus: 1,
      razorpayOrderId: 1,
      deliveryPincode: 1,
      items: 1,
      user: {
        _id: 1,
        name: 1,
        email: 1,
        mobile: 1,
        role: 1,
        isActive: 1,
        isDeleted: 1,
        createdAt: 1,
      },
      deliveryLocation: 1,
      vendor: {
        _id: "$vendorId",
        shopName: "$vendorProfile.shopName",
        logo: "$vendorProfile.logo",
        supportMobile: "$vendorProfile.supportMobile",
      },
      pickupLocation: {
        _id: "$pickupLocation._id",
        formattedAddress: "$pickupLocation.formattedAddress",
        zipcode: "$pickupLocation.zipcode",
        coordinates: "$pickupLocation.coordinates",
      },
      statusHistory: 1,
      cancelReason: 1,
      deliveredAt: 1,
      assignedTo: 1,
      transactions: 1,
      createdAt: 1,
      updatedAt: 1,
    },
  });

  if (sortStage) pipeline.push({ $sort: sortStage });

  return pipeline;
};

exports.toObjectId = toObjectId;
