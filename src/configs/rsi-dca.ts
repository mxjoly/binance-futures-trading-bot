import { CandleChartInterval } from 'binance-api-node';
import { basicTpslStrategy } from '../strategies/exit';
import { RSI } from '../strategies/entry';
import { getPositionSizeByPercent } from '../strategies/riskManagement';

// @see https://www.youtube.com/watch?v=7NM7bR2mL7U&t=69s&ab_channel=TradePro
const config: StrategyConfig[] = [
  {
    asset: 'BTC',
    base: 'USDT',
    loopInterval: CandleChartInterval.FIFTEEN_MINUTES,
    indicatorIntervals: [
      CandleChartInterval.FIFTEEN_MINUTES,
      CandleChartInterval.ONE_DAY,
    ],
    risk: 0.05,
    leverage: 5,
    allowPyramiding: true,
    maxPyramidingAllocation: 0.5,
    trendFilter: (candles) => 1,
    exitStrategy: (price, candles, pricePrecision, side) =>
      basicTpslStrategy(price, pricePrecision, side, {
        profitTargets: [{ deltaPercentage: 0.1, quantityPercentage: 1 }],
        lossTolerance: 0.19,
      }),
    buyStrategy: (candles) =>
      RSI.isBuySignal(candles[CandleChartInterval.FIFTEEN_MINUTES]),
    sellStrategy: (candles) =>
      RSI.isSellSignal(candles[CandleChartInterval.FIFTEEN_MINUTES]),
    riskManagement: getPositionSizeByPercent,
  },
];

export default config;
