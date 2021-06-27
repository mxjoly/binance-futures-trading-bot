interface TradeConfig {
  asset: string;
  base: string;
  allocation: number; // between 0 and 1
  lossTolerance?: number; // between 0 and 1
  profitTarget?: number; // between 0 and 1
  riskReward?: string; // x:y
  interval: CandleChartInterval;
  leverage?: number;
  buyStrategy: BuySellStrategy;
  sellStrategy: BuySellStrategy;
  tpslStrategy?: TPSLStrategy;
  checkTrend?: CheckTrend;
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
    | 'TAKE_PROFIT_MARKET'
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
