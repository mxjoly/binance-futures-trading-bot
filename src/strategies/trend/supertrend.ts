import { Supertrend } from '../../indicators';

export function getTrend(candles: CandleData[]): Trend {
  const results = Supertrend.calculate({
    close: candles.map((c) => c.close),
    high: candles.map((c) => c.high),
    low: candles.map((c) => c.low),
  });
  if (results.length > 0) {
    return results[results.length - 1].trend === 1 ? 1 : -1;
  } else {
    return 0;
  }
}
