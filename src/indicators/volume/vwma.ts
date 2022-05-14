import { SMA } from 'technicalindicators';
import { getCandleSourceType } from '../../utils/loadCandleData';

interface Options {
  sourceType?: SourceType;
  period?: number;
}

const defaultOptions: Options = {
  sourceType: 'close',
  period: 14,
};

export function calculate(candles: CandleData[], options?: Options) {
  options = { ...defaultOptions, ...options };
  let volume = candles.map((c) => c.volume);
  let values = getCandleSourceType(candles, options.sourceType).map(
    (v, i) => v * candles[i].volume
  );

  let sma1 = SMA.calculate({ period: options.period, values });
  let sma2 = SMA.calculate({ period: options.period, values: volume });

  let result: number[] = new Array(sma1.length);
  for (let i = 0; i < sma1.length; i++) {
    result[i] = sma1[i] / sma2[i];
  }

  return result;
}
