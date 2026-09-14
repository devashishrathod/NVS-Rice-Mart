const { ROLES } = require("../constants");
const { throwError } = require("../utils");

/**
 * Vendor sirf apna data chhu sakta hai; admin/staff sab.
 * @param {{ userId: any }} doc      koi bhi doc jisme `userId` (owner) ho
 * @param {{ userId: any, role: string }} actor
 * @param {string} [label]           error message ke liye
 */
exports.assertOwnership = (doc, actor, label = "resource") => {
  if (!actor?.role) throwError(401, "Access Denied! Missing user context");
  if (actor.role === ROLES.ADMIN || actor.role === ROLES.STAFF) return true;
  if (String(doc?.userId ?? "") !== String(actor.userId)) {
    throwError(403, `Forbidden: this ${label} belongs to another vendor`);
  }
  return true;
};
