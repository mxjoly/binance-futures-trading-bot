import { Cache } from '../tools/cache';

export function cacheIndicatorValues(
  cache: Cache,
  candles: CandleData[],
  values: any[],
  optionsHash: string
) {
  let { symbol, interval } = candles[0];

  if (candles.length !== values.length) {
    console.error(
      `Error of length when trying to cache the values for ${symbol} on ${interval}`
    );
    return;
  }

  if (!cache.exist(symbol, interval, optionsHash)) {
    for (let i = 0; i < values.length; i++) {
      let openTime = candles[i].openTime;
      let value = values[i];
      cache.save(symbol, interval, optionsHash, openTime.getTime(), value);
    }
  }
}
