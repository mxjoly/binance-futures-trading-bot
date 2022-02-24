import { CandleChartInterval } from 'binance-api-node';
import atrTpslStrategy from '../strategies/tpsl/atr';
import { RSI } from '../strategies/buy_sell';
import { getPositionSizeByRisk } from '../strategies/riskManagement';

// @see https://www.youtube.com/watch?v=7NM7bR2mL7U&t=69s&ab_channel=TradePro
const config: TradeConfig[] = [
  {
    asset: 'BTC',
    base: 'USDT',
    loopInterval: CandleChartInterval.FIFTEEN_MINUTES,
    indicatorIntervals: [CandleChartInterval.FIFTEEN_MINUTES],
    risk: 0.01,
    leverage: 10,
    tpslStrategy: (price, candles, pricePrecision, side) =>
      atrTpslStrategy(price, candles, pricePrecision, side, {
        takeProfitAtrRatio: 2,
        stopLossAtrRatio: 2,
      }),
    buySignal: (candles) =>
      RSI.isBuySignal(candles[CandleChartInterval.FIFTEEN_MINUTES]),
    sellSignal: (candles) =>
      RSI.isSellSignal(candles[CandleChartInterval.FIFTEEN_MINUTES]),
    riskManagement: getPositionSizeByRisk,
  },
];

export default config;
