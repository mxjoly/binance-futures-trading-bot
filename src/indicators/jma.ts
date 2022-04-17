interface Options {
  length: number;
  sourceType: 'close' | 'open' | 'high' | 'low';
}

const defaultOptions: Options = {
  length: 14,
  sourceType: 'close',
};

/**
 * Calculate the Juryk Moving Average
 * @param candles
 * @param options
 */
export function calculate(candles: CandleData[], options = defaultOptions) {
  let sources = candles.map((c) => {
    switch (options.sourceType) {
      case 'close':
        return c.close;
      case 'open':
        return c.open;
      case 'high':
        return c.high;
      case 'low':
        return c.low;
      default:
        return c.close;
    }
  });

  let jsa = [];
  for (let i = options.length + 1; i < candles.length; i++) {
    jsa.push((sources[i - 1] + sources[i - options.length - 1]) / 2);
  }

  return jsa;
}
