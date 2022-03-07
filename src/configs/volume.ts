import { CandleChartInterval } from 'binance-api-node';
import atrTpslStrategy from '../strategies/exit/atr';
import { VOLUME_OSCILLATOR } from '../strategies/entry';
import { supertrend } from '../strategies/trend';
import { getPositionSizeByRisk } from '../strategies/riskManagement';

// @see https://www.youtube.com/watch?v=7NM7bR2mL7U&t=69s&ab_channel=TradePro
const config: TradeConfig[] = [
  {
    asset: 'BTC',
    base: 'USDT',
    loopInterval: CandleChartInterval.FIVE_MINUTES,
    indicatorIntervals: [CandleChartInterval.FIVE_MINUTES],
    risk: 0.01,
    leverage: 10,
    trendFilter: (candles) =>
      supertrend.getTrend(candles[CandleChartInterval.FIVE_MINUTES]),
    exitStrategy: (price, candles, pricePrecision, side) =>
      atrTpslStrategy(
        price,
        candles[CandleChartInterval.FIVE_MINUTES],
        pricePrecision,
        side,
        {
          takeProfitAtrRatio: 3,
          stopLossAtrRatio: 1,
          atrPeriod: 10,
          atrMultiplier: 2,
        }
      ),
    buyStrategy: (candles) =>
      VOLUME_OSCILLATOR.isBuySignal(
        candles[CandleChartInterval.FIVE_MINUTES]
      ) && supertrend.getTrend(candles[CandleChartInterval.FIVE_MINUTES]) === 1,
    sellStrategy: (candles) =>
      VOLUME_OSCILLATOR.isSellSignal(
        candles[CandleChartInterval.FIVE_MINUTES]
      ) &&
      supertrend.getTrend(candles[CandleChartInterval.FIVE_MINUTES]) === -1,
    riskManagement: getPositionSizeByRisk,
  },
];

export default config;
