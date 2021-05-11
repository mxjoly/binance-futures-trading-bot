import { Candle } from 'binance-api-node';
const indicators = require('technicalindicators');

const RSI = indicators.RSI;

// RSI
const RSI_PERIOD = 14;
const RSI_OVERBOUGHT = 70;
const RSI_OVERSOLD = 30;

export const isBuySignalRSI = (candles: Candle[]) => {
  if (candles.length >= RSI_PERIOD) {
    const rsiValues = RSI.calculate({
      values: candles.map((candle) => candle.close),
      period: RSI_PERIOD,
    });

    const last = rsiValues[rsiValues.length - 2];
    const current = rsiValues[rsiValues.length - 1];

    // The rsi crossed the oversold line
    return last < RSI_OVERSOLD && current > RSI_OVERSOLD;
  }
};

export const isSellSignalRSI = (candles: Candle[]) => {
  if (candles.length >= RSI_PERIOD) {
    const rsiValues = RSI.calculate({
      values: candles.map((candle) => candle.close),
      period: RSI_PERIOD,
    });

    const last = rsiValues[rsiValues.length - 2];
    const current = rsiValues[rsiValues.length - 1];

    // The rsi crossed the overbought line
    return last > RSI_OVERBOUGHT && current < RSI_OVERBOUGHT;
  }
};
