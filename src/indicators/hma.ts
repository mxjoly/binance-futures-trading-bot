import { WMA } from 'technicalindicators';

interface Options {
  values: number[];
  period: number;
}

const defaultOptions = {
  period: 21,
};

/**
 * Calculate Hull Moving Average
 */
export function calculate({ values, period = defaultOptions.period }: Options) {
  let length = values.length - period;

  let ma1 = WMA.calculate({
    period: Math.floor(period / 2),
    values: values,
  }).slice(-length);

  let ma2 = WMA.calculate({ period, values }).slice(-length);

  let ma3 = new Array(length);
  for (let i = 0; i < ma3.length; i++) {
    ma3[i] = 2 * ma1[i] - ma2[i];
  }

  let result = WMA.calculate({
    period: Math.round(Math.sqrt(period)),
    values: ma3,
  });

  return result;
}
