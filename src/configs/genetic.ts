import { CandleChartInterval } from 'binance-api-node';
import { atrTpslStrategy } from '../strategies/exit';
import { getPositionSizeByRisk } from '../strategies/riskManagement';

/**
 * Default config for neat algorithm
 */
const config: TradeConfig[] = [
  {
    asset: 'BTC',
    base: 'USDT',
    loopInterval: CandleChartInterval.FIFTEEN_MINUTES,
    indicatorIntervals: [CandleChartInterval.FIFTEEN_MINUTES],
    risk: 0.01,
    leverage: 20,
    buyStrategy: (candles) => false,
    sellStrategy: (candles) => false,
    riskManagement: getPositionSizeByRisk,
    exitStrategy: (price, candles, pricePrecision, side) =>
      atrTpslStrategy(
        price,
        candles[CandleChartInterval.FIFTEEN_MINUTES]
          ? candles[CandleChartInterval.FIFTEEN_MINUTES]
          : candles,
        pricePrecision,
        side,
        {
          takeProfitAtrRatio: 4,
          stopLossAtrRatio: 2,
          atrPeriod: 10,
        }
      ),
  },
];

export default config;
