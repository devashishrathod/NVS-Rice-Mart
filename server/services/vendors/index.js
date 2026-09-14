const { createVendor } = require("./createVendor");
const { getAllVendors, getVendor } = require("./getVendors");
const {
  updateVendor,
  updateVendorDelivery,
  updateVendorStatus,
  bustVendorCache,
} = require("./updateVendor");
const {
  getBranches,
  createBranch,
  setDefaultBranch,
} = require("./vendorBranches");

module.exports = {
  createVendor,
  getAllVendors,
  getVendor,
  updateVendor,
  updateVendorDelivery,
  updateVendorStatus,
  bustVendorCache,
  getBranches,
  createBranch,
  setDefaultBranch,
};
