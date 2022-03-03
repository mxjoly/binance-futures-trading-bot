import { EMA } from 'technicalindicators';

interface Options {
  emaShortPeriod?: number;
  emaMediumPeriod?: number;
  emaLongPeriod?: number;
}

const defaultOptions: Options = {
  emaShortPeriod: 21,
  emaMediumPeriod: 50,
  emaLongPeriod: 200,
};

/**
 * Return true if the close of the last candle is over the EMA 200
 */
export function getTrend(
  candles: CandleData[],
  options = defaultOptions
): Trend {
  if (
    candles.length <=
    Math.max(
      options.emaShortPeriod,
      options.emaMediumPeriod,
      options.emaLongPeriod
    )
  ) {
    return 0;
  }

  const emaShort = EMA.calculate({
    values: candles.map((candle) => candle.close),
    period: options.emaShortPeriod,
  });
  const emaMedium = EMA.calculate({
    values: candles.map((candle) => candle.close),
    period: options.emaMediumPeriod,
  });
  const emaLong = EMA.calculate({
    values: candles.map((candle) => candle.close),
    period: options.emaLongPeriod,
  });

  let upTrend =
    candles[candles.length - 1].close > emaShort[emaShort.length - 1] &&
    emaShort[emaShort.length - 1] > emaMedium[emaMedium.length - 1] &&
    emaMedium[emaMedium.length - 1] > emaLong[emaLong.length - 1];

  let downTrend =
    candles[candles.length - 1].close < emaShort[emaShort.length - 1] &&
    emaShort[emaShort.length - 1] < emaMedium[emaMedium.length - 1] &&
    emaMedium[emaMedium.length - 1] < emaLong[emaLong.length - 1];

  return upTrend ? 1 : downTrend ? -1 : 0;
}
