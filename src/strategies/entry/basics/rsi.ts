import { RSI } from '../../../indicators';

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
 * Return true if the RSI crosses up the oversold threshold
 */
export const isBuySignal = (
  candles: CandleData[],
  options = defaultOptions
) => {
  if (candles.length < options.rsiPeriod) return false;

  const values = RSI.calculate(candles, {
    period: options.rsiPeriod,
  });

  const last = values[values.length - 2];
  const current = values[values.length - 1];

  return last > options.rsiOversold && current < options.rsiOversold;
};

/**
 * Return true if the RSI crosses down the overbought threshold
 */
export const isSellSignal = (
  candles: CandleData[],
  options = defaultOptions
) => {
  if (candles.length < options.rsiPeriod) return false;

  const values = RSI.calculate(candles, {
    period: options.rsiPeriod,
  });

  const last = values[values.length - 2];
  const current = values[values.length - 1];

  return last < options.rsiOverbought && current > options.rsiOverbought;
};
