interface Options {
  high: number[];
  low: number[];
  length: number;
}

const defaultOptions = {
  length: 14,
};

export function calculate({
  high,
  low,
  length = defaultOptions.length,
}: Options) {
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

  for (let i = length; i < high.length; i++) {
    result.push({
      upper:
        (100 * (highestBars(high.slice(i - length, i + 1)) + length)) / length,
      lower:
        (100 * (lowestBars(low.slice(i - length, i + 1)) + length)) / length,
    });
  }

  return result;
}
