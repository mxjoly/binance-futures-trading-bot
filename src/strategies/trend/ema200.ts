import { EMA } from 'technicalindicators';

/**
 * Return true if the close of the last candle is over the EMA 200
 */
export function getTrend(candles: ChartCandle[]) {
  const ema = EMA.calculate({
    values: candles.map((candle) => candle.close),
    period: 200,
  });
  return candles[candles.length - 1].close > ema[ema.length - 1] ? 1 : -1;
}
