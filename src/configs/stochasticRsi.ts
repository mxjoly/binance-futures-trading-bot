import { CandleChartInterval } from 'binance-api-node';
import atrTpslStrategy from '../strategies/exit/atr';
import { STOCHASTIC_RSI } from '../strategies/entry';
import { threeEma } from '../strategies/trend';
import { getPositionSizeByRisk } from '../strategies/riskManagement';

// @see https://www.youtube.com/watch?v=7NM7bR2mL7U&t=69s&ab_channel=TradePro
const config: StrategyConfig[] = [
  {
    asset: 'BTC',
    base: 'USDT',
    loopInterval: CandleChartInterval.FIFTEEN_MINUTES,
    indicatorIntervals: [CandleChartInterval.FIFTEEN_MINUTES],
    risk: 0.1,
    leverage: 10,
    trendFilter: (candles) =>
      threeEma.getTrend(candles[CandleChartInterval.FIFTEEN_MINUTES], {
        emaShortPeriod: 8,
        emaMediumPeriod: 14,
        emaLongPeriod: 50,
      }),
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
          stopLossAtrRatio: 3,
        }
      ),
    buyStrategy: (candles) =>
      STOCHASTIC_RSI.isBuySignal(candles[CandleChartInterval.FIFTEEN_MINUTES]),
    sellStrategy: (candles) =>
      STOCHASTIC_RSI.isSellSignal(candles[CandleChartInterval.FIFTEEN_MINUTES]),
    riskManagement: getPositionSizeByRisk,
  },
];

export default config;
