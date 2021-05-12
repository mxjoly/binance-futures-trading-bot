import { Candle } from 'binance-api-node';
import indicators from './index';

const RSI = indicators.RSI;

const RSI_PERIOD = 14;
const RSI_OVERBOUGHT = 70;
const RSI_OVERSOLD = 30;

/**
 * Return true if the candles cross up the oversold zone line
 * @param candles
 * @returns
 */
export const isBuySignal = (candles: Candle[]) => {
  if (candles.length >= RSI_PERIOD) {
    const values = RSI.calculate({
      values: candles.map((candle) => Number(candle.close)),
      period: RSI_PERIOD,
    });

    const last = values[values.length - 2];
    const current = values[values.length - 1];

    // The rsi crossed the oversold line
    return last < RSI_OVERSOLD && current > RSI_OVERSOLD;
  }
};

/**
 * Return true if the candles cross down the overbought zone line
 * @param candles
 * @returns
 */
export const isSellSignal = (candles: Candle[]) => {
  if (candles.length >= RSI_PERIOD) {
    const values = RSI.calculate({
      values: candles.map((candle) => Number(candle.close)),
      period: RSI_PERIOD,
    });

    const last = values[values.length - 2];
    const current = values[values.length - 1];

    // The rsi crossed the overbought line
    return last > RSI_OVERBOUGHT && current < RSI_OVERBOUGHT;
  }
};
