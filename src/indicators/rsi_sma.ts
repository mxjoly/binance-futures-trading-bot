import { Candle } from 'binance-api-node';
import { RSI, SMA, CrossUp, CrossDown } from 'technicalindicators';

const RSI_PERIOD = 14;
const RSI_OVERBOUGHT = 70;
const RSI_OVERSOLD = 30;
const SMA_PERIOD = 20;

/**
 * Return true if the RSI crosses up the SMA or if the RSI crosses up the oversold zone line
 */
export const isBuySignal = (candles: Candle[]) => {
  if (candles.length >= RSI_PERIOD) {
    const rsiValues = RSI.calculate({
      values: candles.map((candle) => Number(candle.close)),
      period: RSI_PERIOD,
    });

    const smaValues = SMA.calculate({
      values: candles.map((candle) => Number(candle.close)),
      period: SMA_PERIOD,
    });

    const lastRsiValue = rsiValues[rsiValues.length - 2];
    const currentRsiValue = rsiValues[rsiValues.length - 1];

    const results = CrossUp.calculate({ lineA: rsiValues, lineB: smaValues });

    return (
      results[results.length - 1] === true ||
      (lastRsiValue < RSI_OVERSOLD && currentRsiValue > RSI_OVERSOLD)
    );
  }
};

/**
 * Return true if the RSI crosses down the SMA or if the rsi crosses up the oversold zone line
 */
export const isSellSignal = (candles: Candle[]) => {
  if (candles.length >= RSI_PERIOD) {
    const rsiValues = RSI.calculate({
      values: candles.map((candle) => Number(candle.close)),
      period: RSI_PERIOD,
    });

    const smaValues = SMA.calculate({
      values: candles.map((candle) => Number(candle.close)),
      period: SMA_PERIOD,
    });

    const lastRsiValue = rsiValues[rsiValues.length - 2];
    const currentRsiValue = rsiValues[rsiValues.length - 1];

    const results = CrossDown.calculate({ lineA: rsiValues, lineB: smaValues });

    return (
      results[results.length - 1] === true ||
      (lastRsiValue > RSI_OVERBOUGHT && currentRsiValue < RSI_OVERBOUGHT)
    );
  }
};
