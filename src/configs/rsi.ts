import { CandleChartInterval } from 'binance-api-node';
import atrTpslStrategy from '../strategies/exit/atr';
import { RSI } from '../strategies/entry';
import { getPositionSizeByRisk } from '../strategies/riskManagement';

// @see https://www.youtube.com/watch?v=7NM7bR2mL7U&t=69s&ab_channel=TradePro
const config: StrategyConfig[] = [
  {
    asset: 'BTC',
    base: 'USDT',
    loopInterval: CandleChartInterval.FIFTEEN_MINUTES,
    indicatorIntervals: [CandleChartInterval.FIFTEEN_MINUTES],
    risk: 0.01,
    leverage: 10,
    exitStrategy: (price, candles, pricePrecision, side) =>
      atrTpslStrategy(
        price,
        candles[CandleChartInterval.FIFTEEN_MINUTES],
        pricePrecision,
        side,
        {
          atrPeriod: 10,
          atrMultiplier: 2,
          takeProfitAtrRatio: 2,
          stopLossAtrRatio: 2,
        }
      ),
    buyStrategy: (candles) =>
      RSI.isBuySignal(candles[CandleChartInterval.FIFTEEN_MINUTES]),
    sellStrategy: (candles) =>
      RSI.isSellSignal(candles[CandleChartInterval.FIFTEEN_MINUTES]),
    riskManagement: getPositionSizeByRisk,
  },
];

export default config;
