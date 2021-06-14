import { CandleChartInterval } from 'binance-api-node';
import { RSI } from './strategies';
import calculateTPSL from './strategies/tpsl/basic';

// ============================ CONST =================================== //

// The bot wii trade with the binance :
export const BINANCE_MODE: BinanceMode = 'futures';

// Use only buy when the trend line is up, or short if the trend line is down
export const FUTURES_USE_TREND_LINE = false;

// ====================================================================== //

export const tradeConfigs: TradeConfig[] = [
  {
    asset: 'BTC',
    base: 'USDT',
    allocation: 0.01,
    interval: CandleChartInterval.ONE_HOUR,
    leverage: 10,
    buyStrategy: (candles: ChartCandle[]) => RSI.isBuySignal(candles),
    sellStrategy: (candles: ChartCandle[]) => RSI.isSellSignal(candles),
    tpslStrategy: calculateTPSL,
  },
];
