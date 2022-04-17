/**
 * Return an array of boolean. If true, it's a pivot high, else false.
 * @param values
 * @param leftBars
 * @param rightBars
 */
export function pivotsHigh(
  values: number[],
  leftBars: number,
  rightBars: number
) {
  let results = new Array(values.length).fill(false);

  for (let i = 0; i < values.length - 1; i++) {
    for (let j = i - leftBars; j <= i + rightBars; j++) {
      if (j < 0 || j > values.length - 1) break;
      if (values[j] > values[i]) break;
      if (j === i + rightBars) results[i] = true;
    }
  }

  return results;
}

/**
 * Return an array of boolean. If true, it's a pivot low, else false.
 * @param values
 * @param leftBars
 * @param rightBars
 */
export function pivotsLow(
  values: number[],
  leftBars: number,
  rightBars: number
) {
  let results = new Array(values.length).fill(false);

  for (let i = 0; i < values.length - 1; i++) {
    for (let j = i - leftBars; j <= i + rightBars; j++) {
      if (j < 0 || j > values.length - 1) break;
      if (values[j] < values[i]) break;
      if (j === i + rightBars) results[i] = true;
    }
  }

  return results;
}
