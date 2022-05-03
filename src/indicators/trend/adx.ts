import { ADX } from 'technicalindicators';

interface Options {
  period?: number;
}

const defaultOptions: Options = {
  period: 14,
};

export function calculate(candles: CandleData[], options?: Options) {
  options = { ...defaultOptions, ...options };
  let high = candles.map((c) => c.high);
  let low = candles.map((c) => c.low);
  let close = candles.map((c) => c.close);

  return ADX.calculate({ period: options.period, close, high, low });
}
