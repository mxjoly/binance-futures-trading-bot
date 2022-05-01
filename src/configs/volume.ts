import { CandleChartInterval } from 'binance-api-node';
import atrTpslStrategy from '../strategies/exit/atr';
import { VOLUME_OSCILLATOR } from '../strategies/entry';
import { threeEma } from '../strategies/trend';
import { getPositionSizeByRisk } from '../strategies/riskManagement';

export const hyperParameters: HyperParameters = {
  takeProfitAtrRatio: { value: 3, optimization: [1, 3] },
  stopLossAtrRatio: { value: 1, optimization: [1, 3] },
  atrPeriod: { value: 10, optimization: [5, 30] },
  atrMultiplier: { value: 2, optimization: [1, 3] },
  emaShortPeriod: { value: 8, optimization: [5, 10] },
  emaMediumPeriod: { value: 14, optimization: [11, 20] },
  emaLongPeriod: { value: 21, optimization: [21, 40] },
};

export const config: AbstractStrategyConfig = (parameters) => [
  {
    asset: 'BTC',
    base: 'USDT',
    loopInterval: CandleChartInterval.FIVE_MINUTES,
    indicatorIntervals: [CandleChartInterval.FIVE_MINUTES],
    risk: 0.01,
    leverage: 10,
    exitStrategy: (price, candles, pricePrecision, side) =>
      atrTpslStrategy(
        price,
        candles[CandleChartInterval.FIVE_MINUTES],
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
      VOLUME_OSCILLATOR.isBuySignal(candles[CandleChartInterval.FIVE_MINUTES]),
    sellStrategy: (candles) =>
      VOLUME_OSCILLATOR.isSellSignal(candles[CandleChartInterval.FIVE_MINUTES]),
    trendFilter: (candles) =>
      threeEma.getTrend(candles[CandleChartInterval.FIVE_MINUTES], {
        emaShortPeriod: parameters.emaShortPeriod.value,
        emaMediumPeriod: parameters.emaMediumPeriod.value,
        emaLongPeriod: parameters.emaLongPeriod.value,
      }),
    riskManagement: getPositionSizeByRisk,
  },
];
