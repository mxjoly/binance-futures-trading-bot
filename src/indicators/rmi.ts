import { EMA } from 'technicalindicators';

interface Options {
  length: number;
  momentum: number;
  sourceType: 'close' | 'open' | 'high' | 'low';
}

const defaultOptions: Options = {
  length: 33,
  momentum: 15,
  sourceType: 'close',
};

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
}
