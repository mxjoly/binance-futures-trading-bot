import { RSI } from 'technicalindicators';

interface Options {
  rsiPeriod?: number;
  rsiOverbought?: number;
  rsiOversold?: number;
}

const defaultOptions: Options = {
  rsiPeriod: 14,
  rsiOversold: 30,
  rsiOverbought: 70,
};

/**
 * Return true if the RSI crosses up the oversold zone line
 */
export const isBuySignal = (
  candles: ChartCandle[],
  options = defaultOptions
) => {
  if (candles.length >= options.rsiPeriod) {
    const values = RSI.calculate({
      values: candles.map((candle) => candle.close),
      period: options.rsiPeriod,
    });

    const last = values[values.length - 2];
    const current = values[values.length - 1];

    // The RSI crossed the oversold line
    return last < options.rsiOversold && current > options.rsiOversold;
  }
};

/**
 * Return true if the RSI crosses down the overbought zone line
 */
export const isSellSignal = (
  candles: ChartCandle[],
  options = defaultOptions
) => {
  if (candles.length >= options.rsiPeriod) {
    const values = RSI.calculate({
      values: candles.map((candle) => candle.close),
      period: options.rsiPeriod,
    });

    const last = values[values.length - 2];
    const current = values[values.length - 1];

    // The RSI crossed the overbought line
    return last > options.rsiOverbought && current < options.rsiOverbought;
  }
};
