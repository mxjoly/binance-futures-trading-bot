import { StochasticRSI, CrossUp, CrossDown } from 'technicalindicators';

interface Options {
  rsiPeriod?: number;
  stochasticPeriod?: number;
  dPeriod?: number;
  kPeriod?: number;
  oversoldThreshold?: number;
  overboughtThreshold?: number;
}

const defaultOptions: Options = {
  rsiPeriod: 14,
  stochasticPeriod: 14,
  dPeriod: 3,
  kPeriod: 3,
  oversoldThreshold: 20,
  overboughtThreshold: 80,
};

/**
 * Return true if the k signal crosses up the d signal and we are in uptrend
 */
export const isBuySignal = (
  candles: CandleData[],
  options = defaultOptions
) => {
  if (candles.length < Math.max(options.rsiPeriod, options.stochasticPeriod))
    return false;

  const stochRsi = StochasticRSI.calculate({
    rsiPeriod: options.rsiPeriod,
    stochasticPeriod: options.stochasticPeriod,
    dPeriod: options.dPeriod,
    kPeriod: options.kPeriod,
    values: candles.map((candle) => candle.close),
  });

  let k = stochRsi.map((stoch) => stoch.k);
  let d = stochRsi.map((stoch) => stoch.d);

  return (
    k[k.length - 2] < options.oversoldThreshold &&
    d[d.length - 2] < options.oversoldThreshold &&
    CrossUp.calculate({ lineA: k, lineB: d })[stochRsi.length - 1]
  );
};

/**
 * Return true if k signal crosses down the d signal and we are in downtrend
 */
export const isSellSignal = (
  candles: CandleData[],
  options = defaultOptions
) => {
  if (candles.length < Math.max(options.rsiPeriod, options.stochasticPeriod))
    return false;

  const stochRsi = StochasticRSI.calculate({
    rsiPeriod: options.rsiPeriod,
    stochasticPeriod: options.stochasticPeriod,
    dPeriod: options.dPeriod,
    kPeriod: options.kPeriod,
    values: candles.map((candle) => candle.close),
  });

  let k = stochRsi.map((stoch) => stoch.k);
  let d = stochRsi.map((stoch) => stoch.d);

  return (
    k[k.length - 2] > options.overboughtThreshold &&
    d[d.length - 2] > options.overboughtThreshold &&
    CrossDown.calculate({ lineA: k, lineB: d })[stochRsi.length - 1]
  );
};
