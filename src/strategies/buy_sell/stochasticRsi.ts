import { StochasticRSI, CrossUp, CrossDown } from 'technicalindicators';

interface Options {
  rsiPeriod?: number;
  stochasticPeriod?: number;
  dPeriod?: number;
  kPeriod?: number;
}

const defaultOptions: Options = {
  rsiPeriod: 14,
  stochasticPeriod: 14,
  dPeriod: 3,
  kPeriod: 3,
};

/**
 * Return true if the macd crosses up the signal and we are in uptrend
 */
export const isBuySignal = (
  candles: ChartCandle[],
  options = defaultOptions
) => {
  const stochRsi = StochasticRSI.calculate({
    rsiPeriod: options.rsiPeriod,
    stochasticPeriod: options.stochasticPeriod,
    dPeriod: options.dPeriod,
    kPeriod: options.kPeriod,
    values: candles.map((candle) => candle.close),
  });
  console.log(stochRsi[0].d);
  return false;
};

/**
 * Return true if the macd crosses down the signal and we are in downtrend
 */
export const isSellSignal = (
  candles: ChartCandle[],
  options = defaultOptions
) => {
  const stochRsi = StochasticRSI.calculate({
    rsiPeriod: options.rsiPeriod,
    stochasticPeriod: options.stochasticPeriod,
    dPeriod: options.dPeriod,
    kPeriod: options.kPeriod,
    values: candles.map((candle) => candle.close),
  });
  console.log(stochRsi[0].d);
  return false;
};
