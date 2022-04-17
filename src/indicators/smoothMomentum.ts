import { EMA } from 'technicalindicators';

interface Options {
  length: number;
  smoothLength: number;
  tmoLength: number;
}

const defaultOptions: Options = {
  length: 10,
  smoothLength: 21,
  tmoLength: 3,
};

export function calculate(candles: CandleData[], options = defaultOptions) {
  let data = new Array(candles.length).fill(0);

  for (let i = options.tmoLength; i < candles.length; i++) {
    for (let j = 1; j < options.tmoLength; j++) {
      if (candles[i].close > candles[i - j].open) data[i] += 1;
      if (candles[i].close < candles[i - j].open) data[i] -= 1;
    }
  }

  let avgData = EMA.calculate({ period: length, values: data });
  let main = EMA.calculate({ period: options.smoothLength, values: avgData });
  let signal = EMA.calculate({ period: options.smoothLength, values: main });

  return { main: main.slice(-signal.length), signal };
}
