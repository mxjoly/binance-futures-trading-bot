import { CandleChartInterval } from 'binance-api-node';
import { atrTpslStrategy } from '../strategies/exit';
import { Complex } from '../strategies/entry';
import { getPositionSizeByRisk } from '../strategies/riskManagement';

export const hyperParameters: HyperParameters = {
  takeProfitAtr: {
    value: 2,
    optimizationStep: 0.001,
    optimization: [0.003, 0.1],
  },
  stopLossAtr: {
    value: 1,
    optimizationStep: 0.001,
    optimization: [0.003, 0.1],
  },
};

export const config: AbstractStrategyConfig = (parameters) => [
  {
    asset: 'BTC',
    base: 'USDT',
    loopInterval: CandleChartInterval.FIFTEEN_MINUTES,
    indicatorIntervals: [
      CandleChartInterval.FIFTEEN_MINUTES,
      CandleChartInterval.ONE_HOUR,
    ],
    risk: 0.01,
    leverage: 10,
    exitStrategy: (price, candles, pricePrecision, side, exchangeInfo) =>
      atrTpslStrategy(
        price,
        candles[CandleChartInterval.FIFTEEN_MINUTES],
        pricePrecision,
        side,
        exchangeInfo,
        {
          atrMultiplier: 2,
          atrPeriod: 14,
          stopLossAtrRatio: parameters.stopLossAtr.value,
          takeProfitAtrRatio: parameters.takeProfitAtr.value,
        }
      ),
    buyStrategy: (candles) => Complex.BITCOIN_V1.isBuySignal(candles),
    sellStrategy: (candles) => Complex.BITCOIN_V1.isSellSignal(candles),
    riskManagement: getPositionSizeByRisk,
  },
];
