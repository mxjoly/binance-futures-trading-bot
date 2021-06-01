import { CandleChartInterval } from 'binance-api-node';
import { MA_CROSSOVER } from './strategies';

// ============================ CONST =================================== //

// The bot wii trade with the binance :
export const BINANCE_MODE: BinanceMode = 'futures';

// In futures, the bot will only use as position :
export const FUTURES_STRATEGY = {
  long: true,
  short: true,
};

// ====================================================================== //

export const tradeConfigs: TradeConfig[] = [
  {
    asset: 'BTC',
    base: 'USDT',
    allocation: 0.2,
    profitTarget: 1,
    lossTolerance: 0.1,
    interval: CandleChartInterval.FIFTEEN_MINUTES,
    leverage: 10,
    buyStrategy: (candles: ChartCandle[]) =>
      MA_CROSSOVER.isBuySignal(candles, {
        smallPeriod: 21,
        smallMAType: 'EMA',
        longPeriod: 50,
        longMAType: 'SMA',
      }),
    sellStrategy: (candles: ChartCandle[]) =>
      MA_CROSSOVER.isSellSignal(candles, {
        smallPeriod: 21,
        smallMAType: 'EMA',
        longPeriod: 50,
        longMAType: 'SMA',
      }),
  },
];
