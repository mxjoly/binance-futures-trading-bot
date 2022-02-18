interface CSVCandleData {
  date: Date;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
}

// Database Scheme

interface DB {
  history: {
    [date: string]: MockAccount;
  };
  strategyResults: StrategyResults;
}

interface MockAccount {
  wallet: Wallet;
  futuresWallet: FuturesWallet;
  openOrders: OpenOrder[];
  futuresOpenOrders: FuturesOpenOrder[];
}

interface Wallet {
  balance: Balance[];
  trades: Trade[];
}

interface Balance {
  symbol: string;
  quantity: number;
}

interface Trade {
  symbol: string;
  quantity: number;
  avgPrice: number;
}

interface FuturesWallet {
  availableBalance: number;
  totalWalletBalance: number;
  totalUnrealizedProfit: number;
  positions: Position[];
}

interface Position {
  symbol: string;
  size: number; // Asset size
  margin: number; // Base margin
  entryPrice: number;
  positionSide: 'LONG' | 'SHORT';
  leverage: number;
  unrealizedProfit: number;
}

interface OpenOrder {
  symbol: string;
  price: number;
  quantity: number;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT' | 'TRAILING_STOP_MARKET';
}

interface FuturesOpenOrder {
  symbol: string;
  price: number;
  quantity: number;
  positionSide: 'LONG' | 'SHORT';
  type: 'MARKET' | 'LIMIT' | 'TRAILING_STOP_MARKET';
}

/**
 * @see: https://www.metatrader5.com/fr/terminal/help/algotrading/testing_report
 */
interface StrategyResults {
  initialDeposit: number;
  totalNetProfit: number;
  totalBars: number;
  totalTrades: number;
  profitFactor: number;
  grossProfit: number;
  grossDrawdown: number;
  maxDrawdownAbsolute: number;
  maxDrawdownRelative: number;
  totalWinRate: number;
  longWinRate: number;
  shortWinRate: number;
  avgProfit: number;
  avgLoss: number;
  maxProfit: number;
  maxLoss: number;
  consecutiveProfitCount: number;
  consecutiveLossCount: number;
}
