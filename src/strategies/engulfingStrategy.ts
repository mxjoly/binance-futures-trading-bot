import { EMA, RSI } from 'technicalindicators';
import { isBearEngulfing, isBullEngulfing } from '../patterns/engulfing';

interface Options {
  emaPeriod?: number;
  rsiPeriod?: number;
}

const defaultOptions: Options = {
  emaPeriod: 200,
  rsiPeriod: 14,
};

/**
 * Return true if there is a bullish engulfing pattern detected and the trend is up
 */
export const isBuySignal = (
  candles: ChartCandle[],
  options = defaultOptions
) => {
  const ema = EMA.calculate({
    values: candles.map((candle) => candle.close),
    period: options.emaPeriod,
  });

  const rsi = RSI.calculate({
    values: candles.map((candle) => candle.close),
    period: options.rsiPeriod,
  });

  const isUpTrendEMA = candles[candles.length - 1].close > ema[ema.length - 1];
  const isUpTrendRSI = rsi[rsi.length - 1] > 50;
  return isUpTrendEMA && isUpTrendRSI && isBullEngulfing(candles);
};

/**
 * Return true if there is a bearish engulfing pattern detected and the trend is down
 */
export const isSellSignal = (
  candles: ChartCandle[],
  options = defaultOptions
) => {
  const ema = EMA.calculate({
    values: candles.map((candle) => candle.close),
    period: options.emaPeriod,
  });

  const rsi = RSI.calculate({
    values: candles.map((candle) => candle.close),
    period: options.rsiPeriod,
  });

  const isDownTrendEMA =
    candles[candles.length - 1].close < ema[ema.length - 1];
  const isDownTrendRSI = rsi[rsi.length - 1] < 50;
  return isDownTrendEMA && isDownTrendRSI && isBearEngulfing(candles);
};
