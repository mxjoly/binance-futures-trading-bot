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
    asset: 'BTC',
    base: 'USDT',
    allocation: 0.02,
    lossTolerance: 0.05,
    interval: CandleChartInterval.FIFTEEN_MINUTES,
    leverage: 2,
  },
];
