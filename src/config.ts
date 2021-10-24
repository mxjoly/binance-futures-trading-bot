import { CandleChartInterval } from 'binance-api-node';
import { RSI } from './strategies/buy_sell';
import { isOverTrendLine } from './strategies/trend/supertrend';
import tpslStrategy from './strategies/tpsl/basic';

// ============================ CONST =================================== //

// The bot will trade with the binance :
export const BINANCE_MODE: BinanceMode = 'futures';

// ====================================================================== //

export const tradeConfigs: TradeConfig[] = [
  {
    asset: 'BTC',
    base: 'USDT',
    interval: CandleChartInterval.ONE_MINUTE,
    allocation: 0.02,
    leverage: 100,
    lossTolerance: 0.005,
    useTrailingStop: true,
    allowPyramiding: false,
    unidirectional: true,
    checkTrend: isOverTrendLine,
    tpslStrategy,
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
