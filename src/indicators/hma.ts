import { WMA } from 'technicalindicators';

interface Options {
  sourceType: 'close' | 'open' | 'high' | 'low';
  period: number;
}

const defaultOptions: Options = {
  sourceType: 'close',
  period: 21,
};

/**
 * Calculate Hull Moving Average
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

  let length = candles.length - options.period;

  let ma1 = WMA.calculate({
    period: Math.floor(options.period / 2),
    values: sources,
  }).slice(-length);

  let ma2 = WMA.calculate({ period: options.period, values: sources }).slice(
    -length
  );

  let ma3 = new Array(length);
  for (let i = 0; i < ma3.length; i++) {
    ma3[i] = 2 * ma1[i] - ma2[i];
  }

  let result = WMA.calculate({
    period: Math.round(Math.sqrt(options.period)),
    values: ma3,
  });

  return result;
}
