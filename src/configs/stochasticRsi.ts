import { CandleChartInterval } from 'binance-api-node';
import threeEmaTpslStrategy from '../strategies/tpsl/atr';
import { STOCHASTIC_RSI } from '../strategies/buy_sell';
import { threeEma } from '../strategies/trend';

const config: TradeConfig[] = [
  {
    asset: 'BTC',
    base: 'USDT',
    loopInterval: CandleChartInterval.FIFTEEN_MINUTES,
    allocation: 1,
    leverage: 1,
    checkTrend: (candles) =>
      threeEma.getTrend(candles, {
        emaShortPeriod: 8,
        emaMediumPeriod: 14,
        emaLongPeriod: 50,
      }),
    tpslStrategy: (price, candles, pricePrecision, side) =>
      threeEmaTpslStrategy(price, candles, pricePrecision, side, {
        takeProfitAtrRatio: 2,
        stopLossAtrRatio: 3,
      }),
    buyStrategy: (candles) => STOCHASTIC_RSI.isBuySignal(candles),
    sellStrategy: (candles) => STOCHASTIC_RSI.isSellSignal(candles),
  },
];

export default config;
