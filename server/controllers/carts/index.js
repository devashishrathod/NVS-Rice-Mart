const { addOrUpdate } = require("./addOrUpdate");
const { removeFromCart } = require("./removeFromCart");
const { get } = require("./get");
const { clearCart } = require("./clearCart");
const { verifyByPincode } = require("./verifyByPincode");

module.exports = {
  addOrUpdate,
  removeFromCart,
  get,
  clearCart,
  verifyByPincode,
};
