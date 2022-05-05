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

  let result: number[] = new Array(options.period);
  for (let i = 0; i < options.period; i++) {
    result[i] = sma1[1] / sma2[i];
  }

  return result;
}
