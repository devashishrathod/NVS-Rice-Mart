const { ROLES, ERROR_CODES } = require("../../constants");
const { throwError } = require("../../utils");

/**
 * Order ko dekhne ka haq hai ya nahi.
 *  - customer : sirf apne orders
 *  - vendor   : sirf apne (vendorId) orders
 *  - admin/staff : sab
 */
exports.assertOrderAccess = (order, actor) => {
  if (!order || !actor) {
    throwError(404, "Order not found");
  }
  const { userId, role } = actor;
  if (role === ROLES.ADMIN || role === ROLES.STAFF) return true;

  const me = String(userId);
  if (role === ROLES.VENDOR) {
    if (String(order.vendorId ?? "") === me) return true;
  } else if (String(order.userId ?? "") === me) {
    return true;
  }
  // 404 (403 nahi) — warna ID guess karke order ka existence pata chal jata hai
  throwError(404, "Order not found", ERROR_CODES.FORBIDDEN);
};

/**
 * Role ke hisaab se getAll ka match banata hai.
 * Customer/vendor ke liye query ka `userId` param ignore hota hai.
 */
exports.buildOrderScope = (actor) => {
  if (!actor?.role) return null;
  if (actor.role === ROLES.ADMIN || actor.role === ROLES.STAFF) return {};
  if (actor.role === ROLES.VENDOR) return { vendorId: actor.userId };
  return { userId: actor.userId };
};
