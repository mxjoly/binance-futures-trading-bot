import { CandleChartInterval } from 'binance-api-node';
import { RELOAD_ZONE } from '../strategies/buy_sell';
import { Fibonacci } from '../indicators';
import { basicTpslStrategy } from '../strategies/tpsl';

// =========================== PRESETS ================================== //

// SHAD investment strategy
// @see https://thecoinacademy.co/altcoins/shad-strategy-a-trading-and-investment-strategy-for-the-crypto-market/

// ====================================================================== //

const assets = [
  'ETH',
  'BNB',
  'SOL',
  'AVAX',
  'ONE',
  'FTM',
  'ATOM',
  'NEAR',
  'GALA',
  'SAND',
  'GRT',
  'CHZ',
  'ENJ',
  'XRP',
  'ADA',
  'LINK',
  'MANA',
  'DOT',
  'MATIC',
  'CRV',
  'ALGO',
  'DOGE',
  'CAKE',
  'ROSE',
  'XTZ',
  'EGLD',
  'VET',
];

const config: TradeConfig[] = assets.map((asset) => ({
  asset,
  base: 'USDT',
  risk: 0.02, // Buy/Sell with 1% of the balance
  loopInterval: CandleChartInterval.ONE_HOUR,
  indicatorInterval: CandleChartInterval.ONE_WEEK,
  trendFilter: (candles) => 1, // Take only long position, supposing we are in up trend on long term
  tpslStrategy: (price, candles, pricePrecision, side) =>
    basicTpslStrategy(price, pricePrecision, side, {
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
    }),
  buyStrategy: (candles: ChartCandle[]) =>
    RELOAD_ZONE.isBuySignal(candles, {
      trend: Fibonacci.FibonacciTrend.UP,
    }),
  sellStrategy: (candles: ChartCandle[]) => false,
}));

export default config;
