const { throwError } = require("./CustomError");

/**
 * @param {object}  [options]
 * @param {boolean} [options.throwOnEmpty=true]
 *        Default `true` hai taaki purane admin APIs ka behaviour na badle.
 *        Customer-facing listing me `false` pass karo — wahan khali list
 *        error nahi hai (404 sirf "pincode serve nahi hota" ke liye reserve
 *        hai, warna app "no results" aur "not serviceable" me farq nahi
 *        kar payega).
 */
exports.pagination = async (
  model,
  pipeline,
  page = 1,
  limit = 10,
  options = {},
) => {
  const { throwOnEmpty = true } = options;
  page = parseInt(page, 10);
  limit = parseInt(limit, 10);
  const skip = (page - 1) * limit;
  const facetPipeline = [
    ...pipeline,
    {
      $facet: {
        data: [{ $skip: skip }, { $limit: limit }],
        totalCount: [{ $count: "count" }],
      },
    },
    {
      $project: {
        data: 1,
        totalCount: { $arrayElemAt: ["$totalCount.count", 0] },
      },
    },
  ];
  const result = await model.aggregate(facetPipeline);
  const { data, totalCount = 0 } = result[0] || {};

  if (!data || data.length === 0) {
    if (throwOnEmpty) {
      const modelName = model.modelName
        ? model.modelName.toLowerCase()
        : "record";
      throwError(404, `No any ${modelName} found`);
    }
    return { total: 0, totalPages: 0, page, limit, data: [] };
  }

  return {
    total: totalCount,
    totalPages: Math.ceil(totalCount / limit),
    page,
    limit,
    data,
  };
};
