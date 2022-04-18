import { EMA } from 'technicalindicators';

interface Options {
  emaPeriod?: number;
}

const defaultOptions: Options = {
  emaPeriod: 200,
};

/**
 * Return true if the close of the last candle is over the EMA 200
 */
export function getTrend(
  candles: CandleData[],
  options = defaultOptions
): Trend {
  if (candles.length > options.emaPeriod) {
    const ema = EMA.calculate({
      values: candles.map((candle) => candle.close),
      period: options.emaPeriod,
    });
    return candles[candles.length - 1].close > ema[ema.length - 1] ? 1 : -1;
  } else {
    return 0;
  }
}
