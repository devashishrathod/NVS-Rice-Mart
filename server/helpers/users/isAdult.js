exports.isAdult = (dob) => {
  const birthDate = new Date(dob);
  if (isNaN(birthDate.getTime())) return false;
  const today = new Date();
  const age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  )
    return age - 1 >= 18;
  return age >= 18;
};
