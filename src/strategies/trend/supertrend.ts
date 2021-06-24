import { Highest, Lowest, ATR } from 'technicalindicators';

interface Options {
  atrPeriod?: number;
  atrMultiplier?: number;
}

const defaultOptions: Options = {
  atrPeriod: 10,
  atrMultiplier: 3.0,
};

/**
 * Return true if the close of the last candle is over the EMA 200
 */
export function isOverTrendLine(
  candles: ChartCandle[],
  options = defaultOptions
) {
  const high = candles.map((candle) => candle.high);
  const low = candles.map((candle) => candle.low);
  const close = candles.map((candle) => candle.close);

  const atr = ATR.calculate({ high, low, close, period: options.atrPeriod });

  const highest = Highest.calculate({
    values: close,
    period: options.atrPeriod,
  });

  const lowest = Lowest.calculate({
    values: close,
    period: options.atrPeriod,
  });

  const hl = (i: number) =>
    (highest[highest.length - 1 - i] + lowest[lowest.length - 1 - i]) / 2;
  const up = (i: number) =>
    hl(i) - options.atrMultiplier * atr[atr.length - 1 - i];
  const down = (i: number) =>
    hl(i) + options.atrMultiplier * atr[atr.length - 1 - i];

  const nz = (a, b) => (isNaN(a) ? b : a);

  const getTrend = (i: number) => {
    let trend = 1;
    if (i > 0) {
      trend = nz(getTrend(i - 1), trend);
      trend =
        trend === -1 && close[close.length - 1 - i] > down(i)
          ? 1
          : trend == 1 && close[close.length - 1 - i] < up(i)
          ? -1
          : trend;
      trend =
        trend === -1 && close[close.length - 1 - i] > down(i)
          ? 1
          : trend == 1 && close[close.length - 1 - i] < up(i)
          ? -1
          : trend;
    }
    return trend;
  };

  return getTrend(0) === 1;
}
