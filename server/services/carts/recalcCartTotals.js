/**
 * Cart ke totals ek hi jagah se calculate hote hain — pehle teen services
 * me alag-alag logic tha aur wo aapas me match nahi karta tha.
 */
exports.recalcCartTotals = (cart) => {
  const items = cart.items || [];
  cart.subTotal = items.reduce(
    (sum, i) => sum + (Number(i.priceSnapshot) || 0) * (Number(i.quantity) || 0),
    0,
  );
  cart.totalQuantity = items.reduce(
    (sum, i) => sum + (Number(i.quantity) || 0),
    0,
  );
  cart.totalWeight = items.reduce(
    (sum, i) => sum + (Number(i.productWeight) || 0) * (Number(i.quantity) || 0),
    0,
  );
  return cart;
};
