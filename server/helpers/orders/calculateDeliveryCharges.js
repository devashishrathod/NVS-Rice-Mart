/**
 * Delivery charge — poori tarah vendor ke config se.
 *
 *   charge = baseCharge + distance×perKmRate + weight×perKgRate
 *   floor  = minDeliveryCharge          (0 = koi floor nahi)
 *   cap    = baseMaxCharge + weight×maxPerKgIncrement + distance×maxPerKmIncrement
 *            (cap ke teeno field null hon to KOI CAP NAHI)
 *
 * ⚠️ Yahan koi chhupa hua fallback NAHI hai. Pehle missing fields
 *    `DELIVERY_SETTINGS` constants se bhar jate the — matlab vendor sirf
 *    `baseCharge` set karta to perKmRate/perKgRate code se aa jate aur
 *    admin ko pata bhi nahi chalta. Ab jo set nahi hai wo 0 hai.
 */
const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const capOf = (value) => {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

exports.calculateDeliveryCharges = (
  weight = 0,
  distance = 0,
  deliverySetting = {},
) => {
  const conf = deliverySetting || {};
  const safeWeight = Math.max(num(weight), 0);
  const safeDistance = Math.max(num(distance), 0);

  let charge =
    num(conf.baseCharge) +
    safeDistance * num(conf.perKmRate) +
    safeWeight * num(conf.perKgRate);

  // floor
  const minDeliveryCharge = num(conf.minDeliveryCharge);
  if (minDeliveryCharge && charge < minDeliveryCharge) {
    charge = minDeliveryCharge;
  }

  // cap — teeno null hon to koi cap nahi
  const baseMax = capOf(conf.baseMaxCharge);
  const perKgMax = capOf(conf.maxPerKgIncrement);
  const perKmMax = capOf(conf.maxPerKmIncrement);
  if (baseMax !== null || perKgMax !== null || perKmMax !== null) {
    const dynamicMax =
      (baseMax ?? 0) +
      safeWeight * (perKgMax ?? 0) +
      safeDistance * (perKmMax ?? 0);
    if (charge > dynamicMax) charge = dynamicMax;
  }

  return Math.max(Math.round(charge), 0);
};
