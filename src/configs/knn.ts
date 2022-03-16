import { CandleChartInterval } from 'binance-api-node';
import { getPositionSizeByPercent } from '../strategies/riskManagement';

/**
 * Default config for neat algorithm
 */
const config: StrategyConfig[] = [
  {
    asset: 'BTC',
    base: 'USDT',
    loopInterval: CandleChartInterval.FOUR_HOURS,
    indicatorIntervals: [CandleChartInterval.FOUR_HOURS],
    risk: 1,
    leverage: 20,
    buyStrategy: (candles) => false,
    sellStrategy: (candles) => false,
    riskManagement: getPositionSizeByPercent,
  },
];

export default config;
