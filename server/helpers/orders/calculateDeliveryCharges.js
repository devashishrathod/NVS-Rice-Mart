const { DELIVERY_SETTINGS } = require("../../constants");

exports.calculateDeliveryCharges = (
  weight = 1,
  distance = 1,
  deliverySetting = {},
) => {
  const distanceMultiplier = Math.min(
    1,
    Math.sqrt(distance) / deliverySetting?.distanceFactor ||
      DELIVERY_SETTINGS.DISTANCE_FACTOR,
  );
  const weightMultiplier = Math.min(
    1,
    Math.sqrt(weight) / deliverySetting?.weightFactor ||
      DELIVERY_SETTINGS.WEIGHT_FACTOR,
  );

  let charge =
    deliverySetting?.baseCharge ||
    DELIVERY_SETTINGS.BASE_CHARGE + distance * deliverySetting?.perKmRate ||
    DELIVERY_SETTINGS.PER_KM_RATE * distanceMultiplier +
      weight * deliverySetting?.perKgRate ||
    DELIVERY_SETTINGS.PER_KG_RATE * weightMultiplier;

  const dynamicMax =
    deliverySetting?.baseMaxCharge ||
    DELIVERY_SETTINGS.BASE_MAX_CHARGE +
      weight * deliverySetting?.maxPerKgIncrement ||
    DELIVERY_SETTINGS.MAX_PER_KG_INCREMENT +
      distance * deliverySetting?.maxPerKmIncrement ||
    DELIVERY_SETTINGS.MAX_PER_KM_INCREMENT;

  if (
    charge < deliverySetting?.minDeliveryCharge ||
    DELIVERY_SETTINGS.MIN_DELIVERY_CHARGE
  )
    charge =
      deliverySetting?.minDeliveryCharge ||
      DELIVERY_SETTINGS.MIN_DELIVERY_CHARGE;
  if (charge > dynamicMax) charge = dynamicMax;

  return Math.round(charge);
};
