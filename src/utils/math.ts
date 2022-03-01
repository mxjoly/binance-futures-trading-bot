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

/**
 * Get a random number between two numbers
 * @param min
 * @param max
 */
export function randomIntFromInterval(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

/**
 * Random a value with normal distribution
 * @param val
 */
export function randomGaussian(val = 1) {
  let r = 0;
  for (let i = val; i > 0; i--) {
    r += Math.random();
  }
  return r / val;
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
