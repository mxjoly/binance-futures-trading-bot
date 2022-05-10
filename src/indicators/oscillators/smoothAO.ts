import { SMA } from 'technicalindicators';
import { getCandleSourceType } from '../../utils/loadCandleData';

interface Options {
  sourceType?: SourceType;
  fastLength?: number;
  slowLength?: number;
}

const defaultOptions: Options = {
  sourceType: 'hl2',
  fastLength: 6,
  slowLength: 16,
};

/**
 * Smooth Awesome Oscillator
 * @param candles
 * @param options
 */
export function calculate(candles: CandleData[], options?: Options) {
  options = { ...defaultOptions, ...options };
  let values = getCandleSourceType(candles, options.sourceType);
  let results: number[] = [];

  let sma1 = SMA.calculate({ period: options.fastLength, values });
  let sma2 = SMA.calculate({ period: options.slowLength, values });

  // Adjust to have the same array length
  let length = Math.min(sma1.length, sma2.length);
  sma1 = sma1.slice(-length);
  sma2 = sma2.slice(-length);

  let delta: number[] = new Array(length);
  for (let i = 0; i < length; i++) {
    delta[i] = sma1[i] - sma2[i];
  }

  for (let i = 0; i < length; i++) {
    let value =
      delta[i] >= 0
        ? delta[i] > delta[i - 1]
          ? 1
          : 2
        : delta[i] > delta[i - 1]
        ? -1
        : -2;
    results.push(value);
  }

  return results;
}
