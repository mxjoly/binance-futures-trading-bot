import { CandleChartInterval } from 'binance-api-node';
import { RSI } from './strategies/buy_sell';

// ============================ CONST =================================== //

// The bot wii trade with the binance :
export const BINANCE_MODE: BinanceMode = 'futures';

// ====================================================================== //

export const tradeConfigs: TradeConfig[] = [
  {
    asset: 'BTC',
    base: 'USDT',
    allocation: 0.01,
    leverage: 10,
    allowPyramiding: true,
    maxPyramidingAllocation: 0.1,
    interval: CandleChartInterval.ONE_MINUTE,
    buyStrategy: (candles: ChartCandle[]) =>
      RSI.isBuySignal(candles, {
        rsiOverbought: 70,
        rsiOversold: 30,
        rsiPeriod: 14,
        signalAtBreakout: true,
      }),
    sellStrategy: (candles: ChartCandle[]) =>
      RSI.isSellSignal(candles, {
        rsiOverbought: 70,
        rsiOversold: 30,
        rsiPeriod: 14,
        signalAtBreakout: true,
      }),
  },
];
