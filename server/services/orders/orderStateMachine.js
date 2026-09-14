const { ORDER_STATUS, ROLES } = require("../../constants");

const S = ORDER_STATUS;

/**
 * Kaun sa role kis status se kahan ja sakta hai.
 *
 * 🔒 `admin` ka har column KHALI hai — admin sirf dekh sakta hai (D6).
 *    Isliye agar vendor kisi order pe kuch na kare to wo PENDING me hi
 *    pada rahega; admin vendor ko call karega. (Auto-cancel job baad me.)
 */
const ALLOWED_TRANSITIONS = Object.freeze({
  [S.INITIATED]: { vendor: [], user: [], admin: [] },
  [S.PENDING]: {
    vendor: [S.ACCEPTED, S.REJECTED],
    user: [S.CANCELLED],
    admin: [],
  },
  [S.ACCEPTED]: {
    vendor: [S.PACKED, S.REJECTED],
    user: [S.CANCELLED],
    admin: [],
  },
  [S.PACKED]: { vendor: [S.OUT_FOR_DELIVERY], user: [], admin: [] },
  [S.OUT_FOR_DELIVERY]: { vendor: [S.DELIVERED], user: [], admin: [] },
  [S.DELIVERED]: { vendor: [], user: [], admin: [] },
  [S.CANCELLED]: { vendor: [], user: [], admin: [] },
  [S.REJECTED]: { vendor: [], user: [], admin: [] },
  // legacy — purane orders me mil sakta hai
  [S.CONFIRMED]: { vendor: [S.PACKED, S.REJECTED], user: [S.CANCELLED], admin: [] },
});

const roleKey = (role) => {
  if (role === ROLES.VENDOR) return "vendor";
  if (role === ROLES.USER) return "user";
  return "admin"; // admin + staff
};

/** Stock wapas karna hai? (order cancel/reject hua) */
const RESTOCK_STATUSES = new Set([S.CANCELLED, S.REJECTED]);

exports.ALLOWED_TRANSITIONS = ALLOWED_TRANSITIONS;
exports.RESTOCK_STATUSES = RESTOCK_STATUSES;
exports.roleKey = roleKey;

/** Is role ke liye current status se kahan-kahan ja sakte hain. */
exports.allowedNextStatuses = (currentStatus, role) =>
  ALLOWED_TRANSITIONS[currentStatus]?.[roleKey(role)] ?? [];

exports.canTransition = (currentStatus, nextStatus, role) =>
  (ALLOWED_TRANSITIONS[currentStatus]?.[roleKey(role)] ?? []).includes(
    nextStatus,
  );
