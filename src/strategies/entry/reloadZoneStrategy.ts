import * as Fibonacci from '../../indicators/fibonacci';

interface Options {
  period?: number;
  trend?: Fibonacci.FibonacciTrend;
}

const defaultOptions: Options = {
  period: undefined,
  trend: Fibonacci.FibonacciTrend.UP,
};

export const isBuySignal = (
  candles: CandleData[],
  options = defaultOptions
) => {
  const levels = Fibonacci.calculate(candles, {
    period: options.period,
    trend: options.trend,
  });

  if (options.trend === Fibonacci.FibonacciTrend.UP) {
    return (
      candles[candles.length - 1].close <= levels.retracementLevels._0618 &&
      candles[candles.length - 1].close >= levels.retracementLevels._0786
    );
  }

  if (options.trend === Fibonacci.FibonacciTrend.DOWN) {
    return false;
  }
};

export const isSellSignal = (
  candles: CandleData[],
  options = defaultOptions
) => {
  const levels = Fibonacci.calculate(candles, {
    period: options.period,
    trend: options.trend,
  });

  if (options.trend === Fibonacci.FibonacciTrend.UP) {
    return false;
  }

  if (options.trend === Fibonacci.FibonacciTrend.DOWN) {
    return (
      candles[candles.length - 1].close >= levels.retracementLevels._0618 &&
      candles[candles.length - 1].close <= levels.retracementLevels._0786
    );
  }
};
