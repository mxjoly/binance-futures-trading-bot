import { ATR, Lowest, Highest } from 'technicalindicators';

interface Options {
  atrPeriod: number;
  atrMultiplier: number;
}

const defaultOptions: Options = {
  atrPeriod: 10,
  atrMultiplier: 3.0,
};

export function calculate(
  candles: CandleData[],
  options = defaultOptions
): { trend: number; up: number; down: number }[] {
  if (candles.length > options.atrPeriod * 2) {
    const high = candles
      .map((candle) => candle.high)
      .slice(-options.atrPeriod - 1);
    const low = candles
      .map((candle) => candle.low)
      .slice(-options.atrPeriod - 1);
    const close = candles
      .map((candle) => candle.close)
      .slice(-options.atrPeriod - 1);

    const atr = ATR.calculate({ high, low, close, period: options.atrPeriod });

    const highest = Highest.calculate({
      values: close,
      period: options.atrPeriod,
    }).slice(-atr.length);

    const lowest = Lowest.calculate({
      values: close,
      period: options.atrPeriod,
    }).slice(-atr.length);

    const bases = atr.map((atr, i) => ({
      up: (highest[i] + lowest[i]) / 2 - options.atrMultiplier * atr,
      down: (highest[i] + lowest[i]) / 2 + options.atrMultiplier * atr,
    }));

    const nz = (a, b) => (isNaN(a) ? b : a);

    const getUp = (i: number) => {
      if (i < bases.length) {
        let up = bases[bases.length - 1 - i].up;
        let up1 = nz(getUp(i + 1), up);
        up = close[close.length - 2 - i] > up1 ? Math.max(up, up1) : up;
        return up;
      }
      return NaN;
    };

    const getDown = (i: number) => {
      if (i < bases.length) {
        let down = bases[bases.length - 1 - i].down;
        let down1 = nz(getDown(i + 1), down);
        down =
          close[close.length - 2 - i] < down1 ? Math.min(down, down1) : down;
        return down;
      }
      return NaN;
    };

    const getTrend = (i: number) => {
      if (i < bases.length) {
        let trend = 1;
        trend = nz(getTrend(i + 1), trend);
        trend =
          trend === -1 && close[close.length - 1 - i] > getDown(i)
            ? 1
            : trend === 1 && close[close.length - 1 - i] < getUp(i)
            ? -1
            : trend;
        return trend;
      }
      return NaN;
    };

    const result = [];
    for (let i = 0; i < bases.length; i++) {
      result.push({
        trend: getTrend(i),
        up: getUp(i),
        down: getDown(i),
      });
    }
    return result.reverse();
  } else {
    return [];
  }
}
