import { EMA } from 'technicalindicators';
import { getCandleSourceType } from '../../utils/loadCandleData';

interface Options {
  sourceType?: SourceType;
  length?: number;
  momentum?: number;
}

const defaultOptions: Options = {
  sourceType: 'close',
  length: 33,
  momentum: 15,
};

let cache = new Cache();

/**
 * Relative Momentum Index
 * @param candles
 * @param options
 */
export function calculate(candles: CandleData[], options?: Options) {
  let { symbol, interval, openTime } = candles[candles.length - 1];
  options = { ...defaultOptions, ...options };

  let values = getCandleSourceType(candles, options.sourceType);

  let diff1 = [];
  let diff2 = [];

  for (let i = options.momentum; i < values.length; i++) {
    diff1.push(Math.max(values[i] - values[i - options.momentum], 0));
    diff2.push(Math.max(values[i - options.momentum] - values[i], 0));
  }

  let up = EMA.calculate({ period: options.length, values: diff1 });
  let down = EMA.calculate({ period: options.length, values: diff2 });

  let result: number[] = [];
  for (
    let i = 0;
    i < values.length - options.momentum - options.length + 1;
    i++
  ) {
    result.push(down[i] === 0 ? 0 : 100 - 100 / (1 + up[i] / down[i]));
  }

  return result;
}
