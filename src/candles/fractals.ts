/**
 * Detect William's fractals
 * @param candles
 * @param mode
 */
export const isWilliamsFractal = (
  candles: CandleData[],
  mode: 'bullish' | 'bearish'
) => {
  let candle0 = candles[candles.length - 1];
  let candle1 = candles[candles.length - 2];
  let candle2 = candles[candles.length - 3];
  let candle3 = candles[candles.length - 4];
  let candle4 = candles[candles.length - 5];

  if (mode === 'bullish') {
    return (
      candle2.low < candle4.low &&
      candle2.low < candle3.low &&
      candle2.low < candle1.low &&
      candle2.low < candle0.low
    );
  } else {
    return (
      candle2.high > candle4.high &&
      candle2.high > candle3.high &&
      candle2.high > candle1.high &&
      candle2.high > candle0.high
    );
  }
};
