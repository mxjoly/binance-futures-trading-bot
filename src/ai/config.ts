import { CandleChartInterval } from 'binance-api-node';
import { getPositionSizeByPercent } from '../strategies/riskManagement';

/**
 * Default config for neat algorithm
 */
export const StrategyConfig: TradeConfig = {
  asset: 'BTC',
  base: 'USDT',
  loopInterval: CandleChartInterval.FIFTEEN_MINUTES,
  indicatorIntervals: [CandleChartInterval.FIFTEEN_MINUTES],
  risk: 0.1,
  leverage: 20,
  maxTradeDuration: 4,
  buyStrategy: (candles) => false,
  sellStrategy: (candles) => false,
  riskManagement: getPositionSizeByPercent,
};
