import { CandleChartInterval } from 'binance-api-node';

// ============================ CONST =================================== //

// The bot wii trade with the binance :
export const BINANCE_MODE: BinanceMode = 'futures';

// Max candles saved is history for analysis
export const MAX_CANDLES_HISTORY = 30;

// In futures, the bot will only use as position :
export const FUTURES_STRATEGY = {
  long: true,
  short: true,
};

// ====================================================================== //

export const tradeConfigs: TradeConfig[] = [
  {
    asset: 'LIT',
    base: 'USDT',
    allocation: 0.2,
    lossTolerance: 0.03,
    interval: CandleChartInterval.ONE_DAY,
    leverage: 3,
  },
  {
    asset: 'TRX',
    base: 'USDT',
    allocation: 0.1,
    lossTolerance: 0.03,
    interval: CandleChartInterval.ONE_DAY,
    leverage: 3,
  },
  {
    asset: 'XRP',
    base: 'USDT',
    allocation: 0.1,
    lossTolerance: 0.05,
    interval: CandleChartInterval.ONE_DAY,
    leverage: 3,
  },
  {
    asset: 'STORJ',
    base: 'USDT',
    allocation: 0.1,
    lossTolerance: 0.05,
    interval: CandleChartInterval.ONE_DAY,
    leverage: 3,
  },
  {
    asset: 'ADA',
    base: 'USDT',
    allocation: 0.1,
    lossTolerance: 0.05,
    interval: CandleChartInterval.ONE_DAY,
    leverage: 3,
  },
  {
    asset: 'REEF',
    base: 'USDT',
    allocation: 0.1,
    lossTolerance: 0.05,
    interval: CandleChartInterval.ONE_DAY,
    leverage: 3,
  },
  {
    asset: 'AVAX',
    base: 'USDT',
    allocation: 0.1,
    lossTolerance: 0.05,
    interval: CandleChartInterval.ONE_DAY,
    leverage: 3,
  },
  {
    asset: 'ALGO',
    base: 'USDT',
    allocation: 0.1,
    lossTolerance: 0.05,
    interval: CandleChartInterval.ONE_DAY,
    leverage: 3,
  },
  {
    asset: 'VET',
    base: 'USDT',
    allocation: 0.1,
    lossTolerance: 0.05,
    profitTarget: 1,
    interval: CandleChartInterval.ONE_DAY,
    leverage: 3,
  },
];
