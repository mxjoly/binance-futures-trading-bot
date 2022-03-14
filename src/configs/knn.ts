import { CandleChartInterval } from 'binance-api-node';
import { getPositionSizeByPercent } from '../strategies/riskManagement';

/**
 * Default config for neat algorithm
 */
const config: StrategyConfig[] = [
  {
    asset: 'BTC',
    base: 'USDT',
    loopInterval: CandleChartInterval.FIVE_MINUTES,
    indicatorIntervals: [CandleChartInterval.FIVE_MINUTES],
    risk: 1,
    leverage: 20,
    maxTradeDuration: 6,
    buyStrategy: (candles) => false,
    sellStrategy: (candles) => false,
    riskManagement: getPositionSizeByPercent,
  },
];

export default config;
