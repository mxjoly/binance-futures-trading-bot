/**
 * Math.ceil with decimals
 * @param a
 * @param precision - The number of decimals after the comma
 */
export function decimalCeil(x: number, precision: number) {
  return Math.ceil(x * Math.pow(10, precision)) / Math.pow(10, precision);
}

/**
 * Math.floor with decimals
 * @param a
 * @param precision - The number of decimals after the comma
 */
export function decimalFloor(x: number, precision: number) {
  return Math.floor(x * Math.pow(10, precision)) / Math.pow(10, precision);
}
