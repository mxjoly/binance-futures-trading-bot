import { CandleChartInterval } from 'binance-api-node';
import { getPositionSizeByRisk } from '../strategies/riskManagement';

// @see https://www.youtube.com/watch?v=7NM7bR2mL7U&t=69s&ab_channel=TradePro
const config: TradeConfig[] = [
  {
    asset: 'BTC',
    base: 'USDT',
    loopInterval: CandleChartInterval.FIVE_MINUTES,
    indicatorIntervals: [CandleChartInterval.FIVE_MINUTES],
    risk: 0.1,
    leverage: 10,
    buyStrategy: (candles) => false,
    sellStrategy: (candles) => false,
    riskManagement: getPositionSizeByRisk,
  },
];

export default config;
