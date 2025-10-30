/**
 * Generate SKU dynamically from product details
 * Format: name-brand-subCategory-weight
 * All lowercase, words separated by hyphens
 */
exports.generateSKU = (type, brand, subCategoryName, weight) => {
  const clean = (str) =>
    str?.toString()?.trim()?.toUpperCase()?.replace(/\s+/g, "-") || "";
  return `${clean(type)}-${clean(brand)}-${clean(subCategoryName)}-${
    weight || 0
  }`;
};
