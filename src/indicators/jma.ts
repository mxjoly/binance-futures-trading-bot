interface Options {
  values: number[];
  period: number;
}

const defaultOptions = {
  period: 14,
};

/**
 * Calculate the Juryk Moving Average
 */
export function calculate({ values, period = defaultOptions.period }: Options) {
  let jsa = [];
  for (let i = period + 1; i < values.length; i++) {
    jsa.push((values[i - 1] + values[i - period - 1]) / 2);
  }
  return jsa;
}
