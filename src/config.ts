import { CandleChartInterval } from 'binance-api-node';

// ============================ CONST =================================== //
export const BINANCE_MODE: BinanceMode = 'futures';
export const MAX_CANDLES_HISTORY = 30; // max candles saved is history for analysis
export const MIN_FREE_BALANCE_FOR_SPOT_TRADING = 0;
export const MIN_FREE_BALANCE_FOR_FUTURE_TRADING = 0;

// ====================================================================== //

export const tradeConfigs: TradeConfig[] = [
  {
    asset: 'BTC',
    base: 'USDT',
    allocation: 0.001,
    lossTolerance: 0.03,
    profitTarget: 0.1,
    interval: CandleChartInterval.ONE_MINUTE,
    leverage: 2,
  },
];
