interface TradeConfig {
  asset: string;
  base: string;
  loopInterval: any; // type of CandleChartInterval from binance api node library
  indicatorInterval: any; // type of CandleChartInterval from binance api node library
  leverage?: number;
  allocation: number; // between 0 and 1
  lossTolerance?: number; // between 0 and 1
  profitTarget?: number; // between 0 and 1
  useTrailingStop?: boolean;
  allowPyramiding?: boolean; // Allow cumulative longs/shorts
  maxPyramidingAllocation?: number; // Max allocation for a position in pyramiding (between 0 and 1)
  unidirectional?: boolean; // When take the profit, close the position instead of opening new position
  buyStrategy: BuySellStrategy;
  sellStrategy: BuySellStrategy;
  tpslStrategy?: TPSLStrategy; // take profit and stop loss strategy
  checkTrend?: CheckTrend; // If the trend is up, only take long, else take only short
}

type BinanceMode = 'spot' | 'futures';

interface ChartCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  trades: number;
}

interface OpenOrder {
  id: number;
  side: 'BUY' | 'SELL';
  type:
    | 'LIMIT'
    | 'LIMIT_MAKER'
    | 'MARKET'
    | 'STOP'
    | 'STOP_MARKET'
    | 'STOP_LOSS_LIMIT'
    | 'TAKE_PROFIT_MARKET'
    | 'TAKE_PROFIT_LIMIT'
    | 'TRAILING_STOP_MARKET';
  stopPrice: number;
}

type BuySellStrategy = (candles: ChartCandle[]) => boolean;

type TPSLStrategy = (options: {
  candles: ChartCandle[];
  tradeConfig?: TradeConfig;
  pricePrecision?: number;
  side: 'BUY' | 'SELL';
}) => { takeProfitPrice: number; stopLossPrice: number };

type CheckTrend = (candles: ChartCandle[]) => boolean;
