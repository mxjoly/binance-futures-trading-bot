import { CandleChartInterval } from 'binance-api-node';
import { MACD } from './strategies';

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
    profitTarget: 0.1,
    lossTolerance: 0.05,
    interval: CandleChartInterval.ONE_MINUTE,
    leverage: 10,
    buyStrategy: (candles: ChartCandle[]) => MACD.isBuySignal(candles),
    sellStrategy: (candles: ChartCandle[]) => MACD.isSellSignal(candles),
  },
];
