/**
 * Math.ceil with decimals
 * @param x
 * @param precision - The number of digits
 */
export function decimalCeil(x: number, precision: number) {
  const n = 10 ** precision;
  return Math.ceil(x * n) / n;
}

/**
 * Math.floor with decimals
 * @param x
 * @param precision - The number of digits
 */
export function decimalFloor(x: number, precision: number) {
  const n = 10 ** precision;
  return Math.floor(x * n) / n;
}

/**
 * Math.round with decimals
 * @param x
 * @param precision - The number of digits
 */
export function decimalRound(x: number, precision: number) {
  const n = 10 ** precision;
  return Math.round(x * n) / n;
}

/**
 * Get a random number between two numbers
 * @param min
 * @param max
 */
export function random(min?: number, max?: number) {
  if (typeof min === 'number' && typeof max === 'number')
    return Math.floor(Math.random() * (max - min + 1) + min);
  if (typeof min === 'number' && typeof max !== 'number')
    return Math.random() + min;
  else return Math.random();
}

/**
 * Calculate the average of an array of number
 * @param val
 */
export function average(val: number[]) {
  let sum = 0;
  for (let i = 0; i < val.length; i++) {
    sum += val[i];
  }
  return sum / val.length;
}

/**
 * Normalizes a value from one range (current) to another (new).
 * @param val
 * @param minVal
 * @param maxVal
 * @param newMin
 * @param newMax
 */
export function normalize(
  val: number,
  minVal: number,
  maxVal: number,
  newMin: number,
  newMax: number
) {
  return newMin + ((val - minVal) * (newMax - newMin)) / (maxVal - minVal);
}
