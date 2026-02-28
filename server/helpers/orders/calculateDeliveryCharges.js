const { DELIVERY_SETTINGS } = require("../../constants");

exports.calculateDeliveryCharges = (
  weight = 1,
  distance = 1,
  deliverySetting = {},
) => {
  const safeWeight = Math.max(Number(weight) || 0, 0);
  const safeDistance = Math.max(Number(distance) || 0, 0);

  const baseCharge =
    Number(deliverySetting?.baseCharge) ?? DELIVERY_SETTINGS.BASE_CHARGE;
  const perKmRate =
    Number(deliverySetting?.perKmRate) ?? DELIVERY_SETTINGS.PER_KM_RATE;
  const perKgRate =
    Number(deliverySetting?.perKgRate) ?? DELIVERY_SETTINGS.PER_KG_RATE;

  let charge = baseCharge + safeDistance * perKmRate + safeWeight * perKgRate;

  const baseMaxCharge =
    Number(deliverySetting?.baseMaxCharge) ?? DELIVERY_SETTINGS.BASE_MAX_CHARGE;
  const maxPerKgIncrement =
    Number(deliverySetting?.maxPerKgIncrement) ??
    DELIVERY_SETTINGS.MAX_PER_KG_INCREMENT;
  const maxPerKmIncrement =
    Number(deliverySetting?.maxPerKmIncrement) ??
    DELIVERY_SETTINGS.MAX_PER_KM_INCREMENT;
  const dynamicMax =
    baseMaxCharge +
    safeWeight * maxPerKgIncrement +
    safeDistance * maxPerKmIncrement;

  const minDeliveryCharge =
    Number(deliverySetting?.minDeliveryCharge) ??
    DELIVERY_SETTINGS.MIN_DELIVERY_CHARGE;

  if (charge < minDeliveryCharge) charge = minDeliveryCharge;
  if (charge > dynamicMax) charge = dynamicMax;

  return Math.round(charge);
};
