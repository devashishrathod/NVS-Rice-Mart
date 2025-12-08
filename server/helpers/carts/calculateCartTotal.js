exports.calculateCartTotal = (cartItems, productsMap) => {
  let subTotal = 0;
  cartItems.forEach((item) => {
    const product = productsMap[item.productId];
    if (product) {
      subTotal += product.generalPrice * item.quantity;
    }
  });
  return subTotal;
};
