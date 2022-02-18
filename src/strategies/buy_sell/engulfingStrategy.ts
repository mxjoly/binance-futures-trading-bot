import { EMA, RSI } from 'technicalindicators';
import {
  isBearEngulfing,
  isBullEngulfing,
} from '../../patterns/candles/engulfing';

interface Options {
  emaPeriod?: number;
  rsiPeriod?: number;
}

const defaultOptions: Options = {
  emaPeriod: 200,
  rsiPeriod: 14,
};

/**
 * Return true if there is a bullish engulfing pattern detected
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
  const isNotOverBought = rsi[rsi.length - 1] < 70;

  return (
    isUpTrendEMA && isUpTrendRSI && isNotOverBought && isBullEngulfing(candles)
  );
};

/**
 * Return true if there is a bearish engulfing pattern detected
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
  const isNotOverSold = rsi[rsi.length - 1] > 30;

  return (
    isDownTrendEMA &&
    isDownTrendRSI &&
    isNotOverSold &&
    isBearEngulfing(candles)
  );
};
