import { CandleChartInterval } from 'binance-api-node';
import { ENGULFING } from './strategies';
import calculateTPSL from './strategies/tpsl/engulfing';

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
    allocation: 0.05,
    profitTarget: 0.1,
    lossTolerance: 0.05,
    interval: CandleChartInterval.ONE_MINUTE,
    leverage: 10,
    buyStrategy: (candles: ChartCandle[]) => ENGULFING.isBuySignal(candles),
    sellStrategy: (candles: ChartCandle[]) => ENGULFING.isSellSignal(candles),
    tpslStrategy: calculateTPSL,
  },
];
