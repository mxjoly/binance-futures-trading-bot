import { CandleChartInterval } from 'binance-api-node';
import { RELOAD_ZONE } from './strategies/buy_sell';
import { Fibonacci } from './indicators';
import tpslStrategy from './strategies/tpsl';

// ============================ CONST =================================== //

// The bot will trade with the binance :
export const BINANCE_MODE: BinanceMode = 'spot';

// =========================== PRESETS ================================== //

// SHAD investment strategy
// @see https://thecoinacademy.co/altcoins/shad-strategy-a-trading-and-investment-strategy-for-the-crypto-market/
const shad = {
  loopInterval: CandleChartInterval.ONE_HOUR,
  indicatorInterval: CandleChartInterval.ONE_WEEK,
  profitTargets: [
    {
      deltaPercentage: 1, // x2
      quantityPercentage: 0.5,
    },
    {
      deltaPercentage: 3, // x4
      quantityPercentage: 0.25,
    },
    {
      deltaPercentage: 7, // x8
      quantityPercentage: 0.125,
    },
    {
      deltaPercentage: 15, // x16
      quantityPercentage: 0.0625,
    },
    {
      deltaPercentage: 31, // x32
      quantityPercentage: 0.03125,
    },
    {
      deltaPercentage: 61, // x64
      quantityPercentage: 0.015625,
    },
    {
      deltaPercentage: 127, // x128
      quantityPercentage: 0.0078125,
    },
  ],
  lossTolerances: [],
  useTrailingStop: false,
  allowPyramiding: false,
  unidirectional: true,
  checkTrend: (candles) => true, // Take only long position, supposing we are in up trend on long term
  tpslStrategy: tpslStrategy,
  buyStrategy: (candles: ChartCandle[]) =>
    RELOAD_ZONE.isBuySignal(candles, {
      trend: Fibonacci.FibonacciTrend.UP,
    }),
  sellStrategy: (candles: ChartCandle[]) => false,
};

// ====================================================================== //

export const tradeConfigs: TradeConfig[] = [
  {
    asset: 'ETH',
    base: 'USDT',
    allocation: 0.01,
    ...shad,
  },
  {
    asset: 'BNB',
    base: 'USDT',
    allocation: 0.01,
    ...shad,
  },
  {
    asset: 'SOL',
    base: 'USDT',
    allocation: 0.01,
    ...shad,
  },
  {
    asset: 'AVAX',
    base: 'USDT',
    allocation: 0.01,
    ...shad,
  },
  {
    asset: 'ONE',
    base: 'USDT',
    allocation: 0.01,
    ...shad,
  },
  {
    asset: 'FTM',
    base: 'USDT',
    allocation: 0.01,
    ...shad,
  },
  {
    asset: 'ATOM',
    base: 'USDT',
    allocation: 0.01,
    ...shad,
  },
  {
    asset: 'NEAR',
    base: 'USDT',
    allocation: 0.01,
    ...shad,
  },
  {
    asset: 'GALA',
    base: 'USDT',
    allocation: 0.01,
    ...shad,
  },
  {
    asset: 'SAND',
    base: 'USDT',
    allocation: 0.01,
    ...shad,
  },
  {
    asset: 'GRT',
    base: 'USDT',
    allocation: 0.01,
    ...shad,
  },
  {
    asset: 'CHZ',
    base: 'USDT',
    allocation: 0.01,
    ...shad,
  },
  {
    asset: 'ENJ',
    base: 'USDT',
    allocation: 0.01,
    ...shad,
  },
  {
    asset: 'XRP',
    base: 'USDT',
    allocation: 0.01,
    ...shad,
  },
  {
    asset: 'ADA',
    base: 'USDT',
    allocation: 0.01,
    ...shad,
  },
  {
    asset: 'LINK',
    base: 'USDT',
    allocation: 0.01,
    ...shad,
  },
  {
    asset: 'MANA',
    base: 'USDT',
    allocation: 0.01,
    ...shad,
  },
  {
    asset: 'DOT',
    base: 'USDT',
    allocation: 0.01,
    ...shad,
  },
  {
    asset: 'MATIC',
    base: 'USDT',
    allocation: 0.01,
    ...shad,
  },
  {
    asset: 'CRV',
    base: 'USDT',
    allocation: 0.01,
    ...shad,
  },
  {
    asset: 'ALGO',
    base: 'USDT',
    allocation: 0.01,
    ...shad,
  },
];
