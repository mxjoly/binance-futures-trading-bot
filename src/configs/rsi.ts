import { CandleChartInterval } from 'binance-api-node';
import { highLowExitStrategy } from '../strategies/exit';
import { Basics } from '../strategies/entry';
import { getPositionSizeByRisk } from '../strategies/riskManagement';

export const hyperParameters = {
  takeProfitRatio: { value: 3 },
  lookBack: { value: 14 },
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
      highLowExitStrategy(
        price,
        candles[CandleChartInterval.ONE_HOUR],
        pricePrecision,
        side,
        exchangeInfo,
        {
          takeProfitRatio: 2,
          lookBack: 14,
          side,
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
