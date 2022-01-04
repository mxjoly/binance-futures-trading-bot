interface FibonacciRetracementLevels {
  _0236: number;
  _0382: number;
  _0500: number;
  _0618: number;
  _0786: number;
  _1000: number;
}

interface FibonacciExtensionLevels {
  _1000: number;
  _1236: number;
  _1618: number;
  _2618: number;
  _3618: number;
  _4618: number;
}

export interface FibonacciLevels {
  retracementLevels: FibonacciRetracementLevels;
  extensionLevels: FibonacciExtensionLevels;
}

export enum FibonacciTrend {
  UP,
  DOWN,
}

interface Options {
  period?: number;
  trend?: FibonacciTrend;
}

const defaultOptions: Options = {
  period: undefined,
  trend: undefined,
};

function findHighestLowest(
  candles: ChartCandle[],
  trend: FibonacciTrend,
  period?: number
) {
  let startIndex = period ? candles.length - period : 0;
  let lowestIndex = candles.length - 1;
  let highestIndex = candles.length - 1;
  let i = candles.length - 1;
  let j = candles.length - 1;

  if (trend == FibonacciTrend.UP) {
    while (i >= startIndex) {
      if (candles[i].low < candles[lowestIndex].low) lowestIndex = i;
      i--;
    }
    while (j >= lowestIndex) {
      if (candles[j].high > candles[highestIndex].high) highestIndex = j;
      j--;
    }
  } else {
    while (i >= startIndex) {
      if (candles[i].high > candles[highestIndex].high) highestIndex = i;
      i--;
    }
    while (j >= highestIndex) {
      if (candles[j].low > candles[lowestIndex].low) lowestIndex = j;
      j--;
    }
  }

  return {
    highest: candles[highestIndex].high,
    lowest: candles[lowestIndex].low,
  };
}

export function calculate({
  candles,
  period = defaultOptions.period,
  trend = defaultOptions.trend,
}: {
  candles: ChartCandle[];
  period?: number;
  trend?: FibonacciTrend;
}): FibonacciLevels {
  const { highest, lowest } = findHighestLowest(candles, trend, period);

  if (trend == FibonacciTrend.UP)
    return {
      retracementLevels: {
        _0236: highest - (highest - lowest) * 0.236,
        _0382: highest - (highest - lowest) * 0.382,
        _0500: highest - (highest - lowest) * 0.5,
        _0618: highest - (highest - lowest) * 0.618,
        _0786: highest - (highest - lowest) * 0.786,
        _1000: highest - (highest - lowest) * 1,
      },
      extensionLevels: {
        _1000: highest + (highest - lowest) * 0,
        _1236: highest + (highest - lowest) * 0.236,
        _1618: highest + (highest - lowest) * 0.618,
        _2618: highest + (highest - lowest) * 1.618,
        _3618: highest + (highest - lowest) * 2.618,
        _4618: highest + (highest - lowest) * 3.618,
      },
    };

  if (trend == FibonacciTrend.DOWN)
    return {
      retracementLevels: {
        _0236: lowest + (highest - lowest) * 0.236,
        _0382: lowest + (highest - lowest) * 0.382,
        _0500: lowest + (highest - lowest) * 0.5,
        _0618: lowest + (highest - lowest) * 0.618,
        _0786: lowest + (highest - lowest) * 0.786,
        _1000: lowest + (highest - lowest) * 1,
      },
      extensionLevels: {
        _1000: lowest - (highest - lowest) * 0,
        _1236: lowest - (highest - lowest) * 0.236,
        _1618: lowest - (highest - lowest) * 0.618,
        _2618: lowest - (highest - lowest) * 1.618,
        _3618: lowest - (highest - lowest) * 2.618,
        _4618: lowest - (highest - lowest) * 3.618,
      },
    };
}
