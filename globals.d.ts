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
}

type BinanceMode = 'spot' | 'futures';

interface ChartCandle {
  symbol: string;
  interval: CandleChartInterval;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  trades: number;
}

type BuySellStrategy = (candles: ChartCandle[]) => Promise<boolean> | boolean;

type TPSLStrategy = (options: {
  candles: ChartCandle[];
  tradeConfig?: TradeConfig;
  pricePrecision?: number;
  side: 'BUY' | 'SELL';
}) => { takeProfitPrice: number; stopLossPrice: number };
