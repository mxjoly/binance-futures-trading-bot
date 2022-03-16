import { CandleChartInterval } from 'binance-api-node';
import { basicTpslStrategy } from '../strategies/exit';
import { RSI } from '../strategies/entry';
import { getPositionSizeByPercent } from '../strategies/riskManagement';

// @see https://www.youtube.com/watch?v=7NM7bR2mL7U&t=69s&ab_channel=TradePro
const config: StrategyConfig[] = [
  {
    asset: 'BTC',
    base: 'USDT',
    loopInterval: CandleChartInterval.ONE_MINUTE,
    indicatorIntervals: [CandleChartInterval.ONE_MINUTE],
    risk: 0.01,
    leverage: 5,
    allowPyramiding: true,
    maxPyramidingAllocation: 0.25,
    trendFilter: (candles) => 1,
    exitStrategy: (price, candles, pricePrecision, side) =>
      basicTpslStrategy(price, pricePrecision, side, {
        profitTargets: [{ deltaPercentage: 0.02, quantityPercentage: 1 }],
        lossTolerance: 0.19,
      }),
    buyStrategy: (candles) =>
      RSI.isBuySignal(candles[CandleChartInterval.ONE_MINUTE]),
    sellStrategy: (candles) =>
      RSI.isSellSignal(candles[CandleChartInterval.ONE_MINUTE]),
    riskManagement: getPositionSizeByPercent,
  },
];

export default config;
