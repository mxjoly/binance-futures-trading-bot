interface Options {
  length?: number;
}

const defaultOptions: Options = {
  length: 14,
};

export function calculate(candles: CandleData[], options?: Options) {
  options = { ...defaultOptions, ...options };

  const high = candles.map((c) => c.high);
  const low = candles.map((c) => c.low);

  const highestBars = (high: number[]) => {
    let maxHigh = -Infinity;
    let maxHighIndex = 0;
    for (let i = high.length - 1; i >= 0; i--) {
      if (high[i] > maxHigh) {
        maxHigh = high[i];
        maxHighIndex = 0 - (high.length - 1 - i);
      }
    }
    return maxHighIndex;
  };

  const lowestBars = (low: number[]) => {
    let maxLow = Infinity;
    let maxLowIndex = 0;
    for (let i = low.length - 1; i >= 0; i--) {
      if (low[i] < maxLow) {
        maxLow = low[i];
        maxLowIndex = 0 - (low.length - 1 - i);
      }
    }
    return maxLowIndex;
  };

  let result: { upper: number; lower: number }[] = [];

  for (let i = options.length; i < high.length; i++) {
    result.push({
      upper:
        (100 *
          (highestBars(high.slice(i - options.length, i + 1)) +
            options.length)) /
        options.length,
      lower:
        (100 *
          (lowestBars(low.slice(i - options.length, i + 1)) + options.length)) /
        options.length,
    });
  }

  return result;
}
