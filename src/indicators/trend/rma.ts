import { getCandleSourceType } from '../../utils/loadCandleData';

interface Options {
  period?: number;
}

const defaultOptions: Options = {
  period: 14,
};

/**
 * Relative Moving Average
 * @param values
 * @param options
 */
export function calculate(values: number[], options?: Options) {
  options = { ...defaultOptions, ...options };
  let alpha = 1 / options.period;

  let result: number[] = new Array(values.length).fill(0);

  for (let i = 0; i < values.length; i++) {
    result[i] =
      i > 0
        ? alpha * values[i] + (1 - alpha) * result[i - 1]
        : alpha * values[i];
  }

  return result;
}
