import { CandleChartInterval } from 'binance-api-node';
import { isWilliamsFractal } from './fractals';

describe('Candle Fractals', () => {
  let defaultProps: CandleData = {
    symbol: 'BTCUSDT',
    interval: CandleChartInterval.ONE_HOUR,
    close: 0,
    low: 0,
    open: 0,
    high: 0,
    volume: 0,
    closeTime: new Date(),
    openTime: new Date(),
  };

  it('detect bullish fractal', () => {
    let candles: CandleData[] = [
      { ...defaultProps, low: 10 },
      { ...defaultProps, low: 9 },
      { ...defaultProps, low: 8 },
      { ...defaultProps, low: 9 },
      { ...defaultProps, low: 10 },
    ];
    expect(isWilliamsFractal(candles, 'bullish')).toBe(true);
  });

  it('detect bearish fractal', () => {
    let candles: CandleData[] = [
      { ...defaultProps, high: 10 },
      { ...defaultProps, high: 11 },
      { ...defaultProps, high: 12 },
      { ...defaultProps, high: 11 },
      { ...defaultProps, high: 10 },
    ];
    expect(isWilliamsFractal(candles, 'bearish')).toBe(true);
  });
});
