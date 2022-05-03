import { CandleChartInterval } from 'binance-api-node';
import atrTpslStrategy from '../strategies/exit/atr';
import { Basics } from '../strategies/entry';
import { getPositionSizeByRisk } from '../strategies/riskManagement';
import { MAX_LOADED_CANDLE_LENGTH_API } from '../init';

export const hyperParameters = {
  takeProfitAtrRatio: { value: 2, optimization: [1, 5] },
  stopLossAtrRatio: { value: 2, optimization: [1, 5] },
  atrPeriod: { value: 10, optimization: [5, 30] },
  atrMultiplier: { value: 2, optimization: [1, 3] },
  rsiPeriod: { value: 14, optimization: [10, 30] },
  rsiOversold: { value: 30, optimization: [10, 50] },
  rsiOverbought: { value: 70, optimization: [50, 90] },
};

export const config: AbstractStrategyConfig = (parameters) => [
  {
    asset: 'BTC',
    base: 'USDT',
    loopInterval: CandleChartInterval.FIFTEEN_MINUTES,
    indicatorIntervals: [CandleChartInterval.FIFTEEN_MINUTES],
    risk: 0.01,
    leverage: 10,
    exitStrategy: (price, candles, pricePrecision, side) =>
      atrTpslStrategy(
        price,
        candles[CandleChartInterval.FIFTEEN_MINUTES].slice(
          -MAX_LOADED_CANDLE_LENGTH_API
        ),
        pricePrecision,
        side,
        {
          takeProfitAtrRatio: parameters.takeProfitAtrRatio.value,
          stopLossAtrRatio: parameters.stopLossAtrRatio.value,
          atrPeriod: parameters.atrPeriod.value,
          atrMultiplier: parameters.atrMultiplier.value,
        }
      ),
    buyStrategy: (candles) =>
      Basics.RSI.isBuySignal(
        candles[CandleChartInterval.FIFTEEN_MINUTES].slice(
          -MAX_LOADED_CANDLE_LENGTH_API
        ),
        {
          rsiPeriod: parameters.rsiPeriod.value,
          rsiOversold: parameters.rsiOversold.value,
        }
      ),
    sellStrategy: (candles) =>
      Basics.RSI.isSellSignal(
        candles[CandleChartInterval.FIFTEEN_MINUTES].slice(
          -MAX_LOADED_CANDLE_LENGTH_API
        ),
        {
          rsiPeriod: parameters.rsiPeriod.value,
          rsiOverbought: parameters.rsiOverbought.value,
        }
      ),
    riskManagement: getPositionSizeByRisk,
  },
];
