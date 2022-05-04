import { RSI } from 'technicalindicators';
import hash from 'object-hash';
import { Cache } from '../../tools/cache';
import { getCandleSourceType } from '../../utils/loadCandleData';
import { cacheIndicatorValues } from '../../utils/cache';

interface Options {
  sourceType?: SourceType;
  period?: number;
}

const defaultOptions: Options = {
  sourceType: 'close',
  period: 14,
};

// let cache = new Cache();

export function calculate(candles: CandleData[], options?: Options) {
  let { symbol, interval, openTime } = candles[candles.length - 1];
  options = { ...defaultOptions, ...options };
  // let optionsHash = hash(options);

  // Check the cache
  // if (
  //   process.env.NODE_ENV === 'test' &&
  //   cache.get(symbol, interval, optionsHash, openTime.getTime())
  // ) {
  //   return candles.map((c) =>
  //     cache.get(symbol, interval, optionsHash, c.openTime.getTime())
  //   );
  // }

  let values = getCandleSourceType(candles, options.sourceType);
  let result: number[] = RSI.calculate({ values, period: options.period });

  // ----------------------------------------------------------------------

  // Store the values calculated in the cache to be faster the next time
  // if (process.env.NODE_ENV === 'test') {
  //   cacheIndicatorValues(
  //     cache,
  //     candles.slice(-result.length),
  //     result,
  //     optionsHash
  //   );
  // }

  return result;
}
