import { Supertrend } from '../../indicators';

export function isOverTrendLine(candles: ChartCandle[]) {
  const result = Supertrend.calculate({ candles });
  return result[result.length - 1].trend === 1;
}
