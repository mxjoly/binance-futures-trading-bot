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
}

interface Balance {
  symbol: string;
  quantity: number;
}

interface FuturesWallet {
  availableBalance: number;
  totalWalletBalance: number;
  totalUnrealizedProfit: number;
  positions: Position[];
}

interface Position {
  pair: string;
  size: number; // Asset size
  margin: number; // Base margin
  entryPrice: number;
  positionSide: 'LONG' | 'SHORT';
  leverage: number;
  unrealizedProfit: number;
}

interface OpenOrder {
  id: string;
  pair: string;
  price: number;
  quantity: number;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
}

interface FuturesOpenOrder {
  id: string;
  pair: string;
  price: number;
  quantity: number;
  positionSide: 'LONG' | 'SHORT';
  type: 'MARKET' | 'LIMIT' | 'TRAILING_STOP_MARKET';
  trailingStop?: {
    callbackRate: number; // % between 0-1
    activation: { changePercentage?: number; percentageToTP: number }; // % between 0-1
    status: 'PENDING' | 'ACTIVE';
  };
}

/**
 * @see: https://www.metatrader5.com/fr/terminal/help/algotrading/testing_report
 */
interface StrategyResults {
  initialDeposit: number;
  numberSymbol: number;
  totalNetProfit: number;
  totalBars: number;
  totalTrades: number;
  totalLongTrades: number;
  totalShortTrades: number;
  profitFactor: number;
  totalProfit: number;
  totalLoss: number;
  maxDrawdownAbsolute: number;
  maxDrawdownRelative: number;
  totalWinRate: number;
  longWinRate: number;
  shortWinRate: number;
  longWinningTrade: number;
  longLostTrade: number;
  shortWinningTrade: number;
  shortLostTrade: number;
  avgProfit: number;
  avgLoss: number;
  maxProfit: number;
  maxLoss: number;
  consecutiveProfitCount: number;
  consecutiveLossCount: number;
}
