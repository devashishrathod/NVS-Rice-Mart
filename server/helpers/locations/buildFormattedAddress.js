/**
 * `formattedAddress` banata hai jab client ne khud na bheja ho.
 *
 * Pehle ye seedha template-string tha:
 *   `${address}, ${city}, ${district}, ${state}, ${zipcode}, ${country}`
 * Jis field ki value nahi hoti thi wo literally `"undefined"` ban ke
 * address me chipak jata tha — "shop 4, undefined, undefined, mp, 452001".
 * Ab `district` optional ho gaya hai, isliye ye aur zyada dikhta.
 *
 * Ab: khali parts skip, aur lagatar repeat hone wala part (city aur
 * district dono "Davangere" — StageDB me aam hai) ek hi baar aata hai.
 *
 * Field order wahi rakha hai jo pehle tha — frontend ka display na badle.
 */
exports.buildFormattedAddress = ({
  address,
  city,
  district,
  state,
  zipcode,
  country,
} = {}) => {
  const parts = [];
  for (const raw of [address, city, district, state, zipcode, country]) {
    if (raw === undefined || raw === null) continue;
    const value = String(raw).trim();
    if (!value) continue;
    // lagatar duplicate (city === district) ko ek hi baar
    const prev = parts[parts.length - 1];
    if (prev && prev.toLowerCase() === value.toLowerCase()) continue;
    parts.push(value);
  }
  return parts.join(", ");
};
