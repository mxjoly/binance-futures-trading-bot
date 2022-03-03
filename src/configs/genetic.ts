import { CandleChartInterval } from 'binance-api-node';
import { getPositionSizeByPercent } from '../strategies/riskManagement';
import { threeEma } from '../strategies/trend';

/**
 * Default config for neat algorithm
 */
const config: TradeConfig[] = [
  {
    asset: 'BTC',
    base: 'USDT',
    loopInterval: CandleChartInterval.FIVE_MINUTES,
    indicatorIntervals: [CandleChartInterval.FIVE_MINUTES],
    risk: 0.01,
    leverage: 20,
    buyStrategy: (candles) => false,
    sellStrategy: (candles) => false,
    riskManagement: getPositionSizeByPercent,
    trendFilter: (candles) =>
      threeEma.getTrend(
        candles[CandleChartInterval.FIVE_MINUTES]
          ? candles[CandleChartInterval.FIVE_MINUTES]
          : candles
      ),
  },
];

export default config;
