import { CandleChartInterval } from 'binance-api-node';
import atrTpslStrategy from '../strategies/exit/atr';
import { Basics } from '../strategies/entry';
import { getPositionSizeByRisk } from '../strategies/riskManagement';

export const hyperParameters = {
  takeProfitAtrRatio: { value: 2 },
  stopLossAtrRatio: { value: 2 },
  atrPeriod: { value: 10 },
  atrMultiplier: { value: 2 },
  rsiPeriod: { value: 14 },
  rsiOversold: { value: 30 },
  rsiOverbought: { value: 70 },
};

export const config: AbstractStrategyConfig = (parameters) => [
  {
    asset: 'BTC',
    base: 'USDT',
    loopInterval: CandleChartInterval.ONE_HOUR,
    indicatorIntervals: [CandleChartInterval.ONE_HOUR],
    risk: 0.01,
    leverage: 10,
    exitStrategy: (price, candles, pricePrecision, side, exchangeInfo) =>
      atrTpslStrategy(
        price,
        candles[CandleChartInterval.ONE_HOUR],
        pricePrecision,
        side,
        exchangeInfo,
        {
          takeProfitAtrRatio: parameters.takeProfitAtrRatio.value,
          stopLossAtrRatio: parameters.stopLossAtrRatio.value,
          atrPeriod: parameters.atrPeriod.value,
          atrMultiplier: parameters.atrMultiplier.value,
        }
      ),
    buyStrategy: (candles) =>
      Basics.RSI.isBuySignal(candles[CandleChartInterval.ONE_HOUR], {
        rsiPeriod: parameters.rsiPeriod.value,
        rsiOversold: parameters.rsiOversold.value,
      }),
    sellStrategy: (candles) =>
      Basics.RSI.isSellSignal(candles[CandleChartInterval.ONE_HOUR], {
        rsiPeriod: parameters.rsiPeriod.value,
        rsiOverbought: parameters.rsiOverbought.value,
      }),
    riskManagement: getPositionSizeByRisk,
  },
];
