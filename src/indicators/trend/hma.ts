import { WMA } from 'technicalindicators';
import { getCandleSourceType } from '../../utils/loadCandleData';

interface Options {
  sourceType?: SourceType;
  period?: number;
}

const defaultOptions: Options = {
  sourceType: 'close',
  period: 21,
};

/**
 * Calculate Hull Moving Average
 */
export function calculate(candles: CandleData[], options?: Options) {
  options = { ...defaultOptions, ...options };
  let values = getCandleSourceType(candles, options.sourceType);
  let length = candles.length - options.period;

  let ma1 = WMA.calculate({
    period: Math.floor(options.period / 2),
    values: values,
  }).slice(-length);

  let ma2 = WMA.calculate({ period: options.period, values }).slice(-length);

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
