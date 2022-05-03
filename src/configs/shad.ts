import { CandleChartInterval } from 'binance-api-node';
import { Basics } from '../strategies/entry';
import { Fibonacci } from '../indicators';
import { basicTpslStrategy } from '../strategies/exit';
import { getPositionSizeByPercent } from '../strategies/riskManagement';

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
  'LUNA',
];

export const hyperParameters = {};

export const config: AbstractStrategyConfig = (parameters) =>
  assets.map((asset) => ({
    asset,
    base: 'USDT',
    risk: 0.01,
    loopInterval: CandleChartInterval.ONE_HOUR,
    indicatorIntervals: [CandleChartInterval.ONE_WEEK],
    trendFilter: (candles) => 1, // Take only long position, supposing we are in up trend on long term
    riskManagement: getPositionSizeByPercent,
    exitStrategy: (price, candles, pricePrecision, side) =>
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
            quantityPercentage: 0.0625,
          },
        ],
      }),
    buyStrategy: (candles) =>
      Basics.RELOAD_ZONE.isBuySignal(candles[CandleChartInterval.ONE_WEEK], {
        trend: Fibonacci.FibonacciTrend.UP,
      }),
    sellStrategy: (candles: CandleData[]) => false,
  }));
