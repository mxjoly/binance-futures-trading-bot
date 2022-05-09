/**
 * Math.ceil with decimals
 * @param x
 * @param precision - The number of decimals after the comma
 */
export function decimalCeil(x: number, precision: number) {
  return Math.ceil(x * Math.pow(10, precision)) / Math.pow(10, precision);
}

/**
 * Math.floor with decimals
 * @param x
 * @param precision - The number of decimals after the comma
 */
export function decimalFloor(x: number, precision: number) {
  return Math.floor(x * Math.pow(10, precision)) / Math.pow(10, precision);
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
