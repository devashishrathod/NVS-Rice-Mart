/**
 * `req.serviceContext` ko mongo `match` me badalta hai.
 * Teeno listing services (categories / subCategories / products) yahi use
 * karte hain, taaki scope logic ek hi jagah rahe.
 *
 * ⚠️ Ise `match` banane ke SABSE AAKHIR me call karo — warna client ka
 *    `?userId=` param scope ko override kar dega.
 */
exports.applyServiceScope = (match, ctx) => {
  if (!ctx) return match;
  // null = koi vendor filter nahi (admin)
  if (ctx.vendorIds) match.userId = { $in: ctx.vendorIds };
  if (ctx.activeOnly) {
    match.isActive = true;
    match.isDeleted = false;
  }
  return match;
};
