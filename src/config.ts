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
    allocation: 0.001,
    lossTolerance: 0.03,
    profitTarget: 0.1,
    interval: CandleChartInterval.ONE_MINUTE,
    leverage: 1,
  },
];
