interface Options {
  values: number[];
  leftBars: number;
  rightBars: number;
}

/**
 * Return an array of boolean. If true, it's a pivot high, else false.
 */
export function pivotHighs({ values, leftBars, rightBars }: Options) {
  let results: boolean[] = new Array(values.length).fill(false);

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
 */
export function pivotLows({ values, leftBars, rightBars }: Options) {
  let results: boolean[] = new Array(values.length).fill(false);

  for (let i = 0; i < values.length - 1; i++) {
    for (let j = i - leftBars; j <= i + rightBars; j++) {
      if (j < 0 || j > values.length - 1) break;
      if (values[j] < values[i]) break;
      if (j === i + rightBars) results[i] = true;
    }
  }

  return results;
}
