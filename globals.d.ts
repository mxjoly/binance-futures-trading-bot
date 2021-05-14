interface TradeConfig {
  asset: string;
  base: string;
  allocation: number; // between 0 and 1
  lossTolerance: number; // between 0 and 1
  profitTarget?: number; // between 0 and 1
  interval: CandleChartInterval;
  leverage?: number;
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
