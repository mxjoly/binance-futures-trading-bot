import {
  RSI,
  EMA,
  bearishengulfingpattern,
  bullishengulfingpattern,
} from 'technicalindicators';

interface Options {
  emaPeriod?: number;
  rsiPeriod?: number;
}

const defaultOptions: Options = {
  emaPeriod: 200,
  rsiPeriod: 14,
};

const isUpTrendEma = (candles: ChartCandle[]) => {
  const ema = EMA.calculate({
    values: candles.map((candle) => candle.close),
    period: defaultOptions.emaPeriod,
  });
  return candles[candles.length - 1].close > ema[ema.length - 1];
};

const isUpTrendRsi = (candles: ChartCandle[]) => {
  const rsi = RSI.calculate({
    values: candles.map((candle) => candle.close),
    period: defaultOptions.rsiPeriod,
  });
  return rsi[candles.length - 1] > 50;
};

/**
 * Return true if there is a bullish engulfing pattern detected and the trend is up
 */
export const isBuySignal = (
  candles: ChartCandle[],
  options = defaultOptions
) => {
  if (
    candles.length > options.emaPeriod &&
    isUpTrendEma(candles) &&
    isUpTrendRsi(candles)
  ) {
    return bullishengulfingpattern({
      low: candles.map((candle) => candle.low),
      high: candles.map((candle) => candle.high),
      close: candles.map((candle) => candle.close),
      open: candles.map((candle) => candle.open),
    });
  }
};

/**
 * Return true if there is a bearish engulfing pattern detected and the trend is down
 */
export const isSellSignal = (
  candles: ChartCandle[],
  options = defaultOptions
) => {
  if (
    candles.length > options.emaPeriod &&
    !isUpTrendEma(candles) &&
    !isUpTrendRsi(candles)
  ) {
    return bearishengulfingpattern({
      low: candles.map((candle) => candle.low),
      high: candles.map((candle) => candle.high),
      close: candles.map((candle) => candle.close),
      open: candles.map((candle) => candle.open),
    });
  }
};
