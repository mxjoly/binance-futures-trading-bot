import { getCandleSourceType } from '../../utils/loadCandleData';

interface Options {
  sourceType?: SourceType;
  period?: number;
}

const defaultOptions: Options = {
  sourceType: 'close',
  period: 14,
};

/**
 * Calculate the Juryk Moving Average
 */
export function calculate(candles: CandleData[], options?: Options) {
  options = { ...defaultOptions, ...options };
  let values = getCandleSourceType(candles, options.sourceType);
  let jsa = [];

  for (let i = options.period + 1; i < values.length; i++) {
    jsa.push((values[i - 1] + values[i - options.period - 1]) / 2);
  }

  return jsa;
}
