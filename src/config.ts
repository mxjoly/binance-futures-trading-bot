import { CandleChartInterval } from 'binance-api-node';
import { RSI } from './strategies/buy_sell';
import { isOverTrendLine } from './strategies/trend/supertrend';

// ============================ CONST =================================== //

// The bot will trade with the binance :
export const BINANCE_MODE: BinanceMode = 'futures';

// ====================================================================== //

export const tradeConfigs: TradeConfig[] = [
  {
    asset: 'BTC',
    base: 'USDT',
    allocation: 0.05,
    leverage: 20,
    profitTarget: 0.025,
    lossTolerance: 0.05,
    allowPyramiding: false,
    interval: CandleChartInterval.ONE_MINUTE,
    checkTrend: isOverTrendLine,
    buyStrategy: (candles: ChartCandle[]) =>
      RSI.isBuySignal(candles, {
        rsiOverbought: 70,
        rsiOversold: 30,
        rsiPeriod: 7,
        signalAtBreakout: true,
      }),
    sellStrategy: (candles: ChartCandle[]) =>
      RSI.isSellSignal(candles, {
        rsiOverbought: 70,
        rsiOversold: 30,
        rsiPeriod: 7,
        signalAtBreakout: true,
      }),
  },
];
