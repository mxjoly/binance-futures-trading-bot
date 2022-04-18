/**
 * Detect regular fractals
 * @param candles
 * @param mode
 */
export const isRegularFractal = (
  candles: CandleData[],
  mode: 'bullish' | 'bearish'
) => {
  let candle0 = candles[candles.length - 1];
  let candle1 = candles[candles.length - 2];
  let candle2 = candles[candles.length - 3];
  let candle3 = candles[candles.length - 4];
  let candle4 = candles[candles.length - 5];

  return mode === 'bullish'
    ? candle4.high < candle3.high &&
        candle3.high < candle2.high &&
        candle2.high > candle1.high &&
        candle1.high > candle0.high
    : mode == 'bearish'
    ? candle4.low > candle3.low &&
      candle3.low > candle2.low &&
      candle2.low < candle1.low &&
      candle1.low < candle0.low
    : false;
};

/**
 * Detect William's fractals
 * @param candles
 * @param mode
 */
export const isWilliamFractal = (
  candles: CandleData[],
  mode: 'bullish' | 'bearish'
) => {
  let candle0 = candles[candles.length - 1];
  let candle1 = candles[candles.length - 2];
  let candle2 = candles[candles.length - 3];
  let candle3 = candles[candles.length - 4];
  let candle4 = candles[candles.length - 5];

  return mode === 'bullish'
    ? candle4.high < candle2.high &&
        candle3.high <= candle2.high &&
        candle2.high >= candle1.high &&
        candle2.high > candle0.high
    : mode === 'bearish'
    ? candle4.low > candle2.low &&
      candle3.low >= candle2.low &&
      candle2.low <= candle1.low &&
      candle2.low < candle0.low
    : false;
};
