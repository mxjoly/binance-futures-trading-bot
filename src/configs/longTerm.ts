import { CandleChartInterval } from 'binance-api-node';
import { RELOAD_ZONE } from '../strategies/buy_sell';
import { Fibonacci } from '../indicators';
import { fibonacciTpslStrategy } from '../strategies/tpsl';
import { getPositionSizeByPercent } from '../strategies/riskManagement';

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

const config: TradeConfig[] = assets.map((asset) => ({
  asset,
  base: 'USDT',
  risk: 0.01,
  loopInterval: CandleChartInterval.ONE_HOUR,
  indicatorInterval: CandleChartInterval.ONE_WEEK,
  trendFilter: (candles) => 1, // Take only long position, supposing we are in up trend on long term
  riskManagement: getPositionSizeByPercent,
  tpslStrategy: (price, candles, pricePrecision, side) =>
    fibonacciTpslStrategy(price, pricePrecision, side, {
      profitTargets: [
        { fibonacciLevel: 'EXT_1618', quantityPercentage: 0.5 },
        { fibonacciLevel: 'EXT_2618', quantityPercentage: 0.25 },
        { fibonacciLevel: 'EXT_3618', quantityPercentage: 0.25 },
      ],
    }),
  buySignal: (candles: CandleData[]) =>
    RELOAD_ZONE.isBuySignal(candles, {
      trend: Fibonacci.FibonacciTrend.UP,
    }),
  sellSignal: (candles: CandleData[]) => false,
}));

export default config;