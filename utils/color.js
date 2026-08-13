/** Low-opacity fill in a given hex color, matching tokens' *SoftBg pattern
 * (accentSoftBg, premiumBg) for colors that aren't fixed tokens — rank and
 * badge tints, which come from data rather than the palette. */
export const softBg = (hex, alpha = 0.14) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
