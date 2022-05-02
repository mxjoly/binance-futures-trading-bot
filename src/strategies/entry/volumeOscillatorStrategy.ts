import { VolumeOscillator } from '../../indicators';

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
 * Return true if the volume oscillator crosses up the threshold
 */
export const isBuySignal = (
  candles: CandleData[],
  options = defaultOptions
) => {
  if (candles.length < options.longLength) return false;

  const values = VolumeOscillator.calculate({
    volume: candles.map((c) => c.volume),
    longLength: options.longLength,
    shortLength: options.shortLength,
  });

  return (
    values[values.length - 2] < options.threshold &&
    values[values.length - 1] > options.threshold
  );
};

/**
 * Return true if the volume oscillator crosses up the threshold
 */
export const isSellSignal = (
  candles: CandleData[],
  options = defaultOptions
) => {
  return isBuySignal(candles, options);
};
