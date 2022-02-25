import { RSI } from 'technicalindicators';

interface Options {
  rsiPeriod?: number;
  rsiOverbought?: number;
  rsiOversold?: number;
  signalAtBreakout?: boolean;
}

const defaultOptions: Options = {
  rsiPeriod: 14,
  rsiOversold: 30,
  rsiOverbought: 70,
  signalAtBreakout: true,
};

/**
 * Return true if the RSI crosses up the oversold threshold
 */
export const isBuySignal = (
  candles: CandleData[],
  options = defaultOptions
) => {
  if (candles.length < options.rsiPeriod) return false;

  const values = RSI.calculate({
    values: candles.map((candle) => candle.close),
    period: options.rsiPeriod,
  });

  const last = values[values.length - 2];
  const current = values[values.length - 1];

  if (options.signalAtBreakout) {
    return last < options.rsiOversold && current > options.rsiOversold;
  } else {
    return last > options.rsiOversold && current < options.rsiOversold;
  }
};

/**
 * Return true if the RSI crosses down the overbought threshold
 */
export const isSellSignal = (
  candles: CandleData[],
  options = defaultOptions
) => {
  if (candles.length < options.rsiPeriod) return false;

  const values = RSI.calculate({
    values: candles.map((candle) => candle.close),
    period: options.rsiPeriod,
  });

  const last = values[values.length - 2];
  const current = values[values.length - 1];

  if (options.signalAtBreakout) {
    return last > options.rsiOverbought && current < options.rsiOverbought;
  } else {
    return last < options.rsiOverbought && current > options.rsiOverbought;
  }
};
