type BinanceMode = 'spot' | 'futures';

interface TradeConfig {
  asset: string;
  base: string;
  loopInterval: any; // type of CandleChartInterval from binance api node library
  indicatorInterval?: any; // type of CandleChartInterval from binance api node library
  leverage?: number;
  risk: number; // % of total balance to risk in a trade
  trailingStopConfig?: TrailingStopConfig; // Configuration of a trailing stop
  allowPyramiding?: boolean; // Allow cumulative longs/shorts to average the entry price
  maxPyramidingAllocation?: number; // Max allocation for a position in pyramiding (between 0 and 1)
  unidirectional?: boolean; // When take the profit, close the position instead of opening new position in futures
  buySignal: Signal;
  sellSignal: Signal;
  tpslStrategy?: TPSLStrategy; // Placement of take profits and stop loss
  trendFilter?: TrendFilter; // Trend filter - If the trend is up, only take long, else take only short
  riskManagement: RiskManagement;
  tradeManagement?: TradeManagement; // Manage the take profits and stop loss during a trade
}

interface CandleData {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  openTime: Date;
  closeTime: Date;
}

type Signal = (candles: CandleData[]) => boolean;

type TrailingStopConfig = {
  // Activation price of trailing stop calculated by :
  // changePercentage: the price moves X% (0 to 1) in the positive
  // percentageToTP: the price reach X% (0 to 1) of the nearest take profit
  activation: { changePercentage?: number; percentageToTP: number };
  callbackRate: number; // Percentage between 0 and 1 - stop loss if the price increase/decrease of % from last candle
};

type TPSLStrategy = (
  price?: number,
  candles?: CandleData[],
  pricePrecision?: number,
  side: 'BUY' | 'SELL'
) => {
  takeProfits: { price: number; quantityPercentage: number }[]; // quantityPercentage = 0.1 => 10%
  stopLoss?: number;
};

type TrendFilter = (candles: CandleData[], options?: any) => Trend; // 1: up trend, -1: down trend, 0 no trend
type Trend = 1 | -1 | 0; // 1: up trend, -1: down trend, 0: no trend

interface RiskManagementOptions {
  asset: string;
  base: string;
  balance: number;
  risk: number;
  enterPrice: number;
  stopLossPrice?: number;
  exchangeInfo: ExchangeInfo;
}
type RiskManagement = (options: RiskManagementOptions) => number; // Return the size of the position

// type QueryOrderResult from the library binance-api-node
type TradeManagement = (orderInfos: QueryOrderResult[]) => void;
