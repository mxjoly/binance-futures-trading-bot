type BinanceMode = 'spot' | 'futures';

interface TradeConfig {
  asset: string;
  base: string;
  loopInterval: any; // type of CandleChartInterval from binance api node library
  indicatorInterval?: any; // type of CandleChartInterval from binance api node library
  leverage?: number;
  risk: number; // % of total balance to risk in a trade
  useTrailingStop?: boolean;
  trailingStopCallbackRate?: number; // Percentage between 0 and 1
  allowPyramiding?: boolean; // Allow cumulative longs/shorts
  maxPyramidingAllocation?: number; // Max allocation for a position in pyramiding (between 0 and 1)
  unidirectional?: boolean; // When take the profit, close the position instead of opening new position in futures
  buySignal: Signal;
  sellSignal: Signal;
  tpslStrategy?: TPSLStrategy; // take profit and stop loss strategy
  trendFilter?: TrendFilter; // Trend filter - If the trend is up, only take long, else take only short
  riskManagement: RiskManagement;
  tradeManagement?: TradeManagement; // Manage the take profits and stop loss during a trade
}

interface ChartCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  date: Date;
}

type Signal = (candles: ChartCandle[]) => boolean;

type TPSLStrategy = (
  price?: number,
  candles?: ChartCandle[],
  pricePrecision?: number,
  side: 'BUY' | 'SELL'
) => {
  takeProfits: { price: number; quantityPercentage: number }[]; // quantityPercentage = 0.1 => 10%
  stopLoss?: number;
};

type TrendFilter = (candles: ChartCandle[], options?: any) => Trend; // 1: up trend, -1: down trend, 0 no trend
type Trend = 1 | -1 | 0; // 1: up trend, -1: down trend, 0: no trend

interface RiskManagementOptions {
  asset: string;
  base: string;
  balance: number;
  risk: number;
  enterPrice: number;
  stopLossPrice?: number;
  leverage: number;
  exchangeInfo: ExchangeInfo;
}
type RiskManagement = (options: RiskManagementOptions) => number; // Return the size of the position

// type QueryOrderResult from the library binance-api-node
type TradeManagement = (orderInfos: QueryOrderResult[]) => void;

type FibonacciRetracementLevel =
  | 'RET_0236'
  | 'RET_0382'
  | 'RET_0500'
  | 'RET_0618'
  | 'RET_0786'
  | 'RET_1000';

type FibonacciExtensionLevel =
  | 'EXT_1000'
  | 'EXT_1236'
  | 'EXT_1618'
  | 'EXT_2618'
  | 'EXT_3618'
  | 'EXT_4618';
