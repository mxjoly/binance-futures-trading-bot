import { CandleChartInterval } from 'binance-api-node';
import atrTpslStrategy from '../strategies/tpsl/atr';
import { STOCHASTIC_RSI } from '../strategies/buy_sell';
import { threeEma } from '../strategies/trend';
import { getPositionSizeByRisk } from '../strategies/riskManagement';

// @see https://www.youtube.com/watch?v=7NM7bR2mL7U&t=69s&ab_channel=TradePro
const config: TradeConfig[] = [
  {
    asset: 'BTC',
    base: 'USDT',
    loopInterval: CandleChartInterval.FIFTEEN_MINUTES,
    risk: 0.01,
    leverage: 10,
    trendFilter: (candles) =>
      threeEma.getTrend(candles, {
        emaShortPeriod: 8,
        emaMediumPeriod: 14,
        emaLongPeriod: 50,
      }),
    tpslStrategy: (price, candles, pricePrecision, side) =>
      atrTpslStrategy(price, candles, pricePrecision, side, {
        takeProfitAtrRatio: 2,
        stopLossAtrRatio: 3,
      }),
    buySignal: (candles) => STOCHASTIC_RSI.isBuySignal(candles),
    sellSignal: (candles) => STOCHASTIC_RSI.isSellSignal(candles),
    riskManagement: getPositionSizeByRisk,
  },
];

export default config;
