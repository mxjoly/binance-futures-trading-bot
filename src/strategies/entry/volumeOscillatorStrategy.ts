import { VolumeOscillator, Supertrend } from '../../indicators';

interface Options {
  longLength?: number;
  shortLength?: number;
  threshold?: number;
}

const defaultOptions: Options = {
  longLength: 10,
  shortLength: 5,
  threshold: 40,
};

/**
 * Return true if the k signal crosses up the d signal and we are in uptrend
 */
export const isBuySignal = (
  candles: CandleData[],
  options = defaultOptions
) => {
  if (candles.length < Math.max(options.longLength, options.shortLength))
    return false;

  const values = VolumeOscillator.calculate({
    candles,
    longLength: options.longLength,
    shortLength: options.shortLength,
  });

  return (
    values[values.length - 2] < options.threshold &&
    values[values.length - 1] > options.threshold
  );
};

/**
 * Return true if k signal crosses down the d signal and we are in downtrend
 */
export const isSellSignal = (
  candles: CandleData[],
  options = defaultOptions
) => {
  return isBuySignal(candles, options);
};
