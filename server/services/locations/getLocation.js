const Location = require("../../models/Location");
const { ROLES } = require("../../constants");
const { throwError, validateObjectId } = require("../../utils");

/**
 * @param {string} id
 * @param {{ userId: any, role: string }} [actor] pass karo to ownership check lagega
 */
exports.getLocation = async (id, actor) => {
  validateObjectId(id, "Location Id");
  const location = await Location.findById(id);
  if (!location || location.isDeleted) throwError(404, "Location not found");

  if (actor?.role && actor.role !== ROLES.ADMIN && actor.role !== ROLES.STAFF) {
    const isOwner = String(location.userId ?? "") === String(actor.userId);
    // 404 (403 nahi) — warna ID guess karke address ka existence pata chalta hai
    if (!isOwner) throwError(404, "Location not found");
  }
  return location;
};
