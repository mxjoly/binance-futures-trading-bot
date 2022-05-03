import { ATR } from 'technicalindicators';

interface Options {
  length?: number;
}

const defaultOptions: Options = {
  length: 14,
};

export function calculate(candles: CandleData[], options?: Options) {
  options = { ...defaultOptions, ...options };
  let high = candles.map((c) => c.high);
  let low = candles.map((c) => c.low);
  let close = candles.map((c) => c.close);

  return ATR.calculate({ high, low, close, period: options.length });
}
