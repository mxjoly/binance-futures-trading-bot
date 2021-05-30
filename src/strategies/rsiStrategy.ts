import { RSI } from 'technicalindicators';

interface Options {
  rsiPeriod?: number;
  rsiOverbought?: number;
  rsiOversold?: number;
}

/**
 * Return true if the RSI crosses up the oversold zone line
 */
export const isBuySignal = (
  candles: ChartCandle[],
  { rsiPeriod = 14, rsiOversold = 30 }: Options
) => {
  if (candles.length >= rsiPeriod) {
    const values = RSI.calculate({
      values: candles.map((candle) => candle.close),
      period: rsiPeriod,
    });

    const last = values[values.length - 2];
    const current = values[values.length - 1];

    // The RSI crossed the oversold line
    return last < rsiOversold && current > rsiOversold;
  }
};

/**
 * Return true if the RSI crosses down the overbought zone line
 */
export const isSellSignal = (
  candles: ChartCandle[],
  { rsiPeriod = 14, rsiOverbought = 70 }: Options
) => {
  if (candles.length >= rsiPeriod) {
    const values = RSI.calculate({
      values: candles.map((candle) => candle.close),
      period: rsiPeriod,
    });

    const last = values[values.length - 2];
    const current = values[values.length - 1];

    // The RSI crossed the overbought line
    return last > rsiOverbought && current < rsiOverbought;
  }
};
