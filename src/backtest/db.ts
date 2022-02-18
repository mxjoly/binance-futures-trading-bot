import { JsonDB } from 'node-json-db';
import { Config } from 'node-json-db/dist/lib/JsonDBConfig';
import date from 'date-and-time';

/**
 * See the declaration file types.ts to see the scheme of database
 */
export let db;

export const initDB = () => {
  db = new JsonDB(
    new Config(
      `backtests/backtest-${date.format(new Date(), 'YYYY-MM-DD')}`,
      true,
      true,
      '/'
    )
  );
};

// Wallet Functions

export const setWallet = (date: Date, wallet: Wallet) => {
  db.push(`/history/${date}/wallet`, wallet, true);
};

export const setFuturesWallet = (date: Date, wallet: FuturesWallet) => {
  db.push(`/history/${date}/futures_wallet`, wallet, true);
};

export const updateFuturesWalletInfo = (
  date: Date,
  data: {
    availableBalance: number;
    totalWalletBalance: number;
    totalUnrealizedProfit: number;
    totalPositionInitialMargin: number;
  }
) => {
  db.push(`/history/${date}/futures_wallet`, { ...data }, false);
};

export const getWallet = (date: Date): Wallet | null => {
  if (db.exists(`history/${date}/wallet`)) {
    return db.getData(`history/${date}/wallet`);
  }
};

export const getFuturesWallet = (date: Date): FuturesWallet | null => {
  if (db.exists(`history/${date}/futures_wallet`)) {
    return db.getData(`history/${date}/futures_wallet`);
  }
};

// Orders functions

const getOpenOrderIndex = (date: Date, orderId: number) =>
  db.getIndex(`/history/${date}/open_orders`, orderId, 'orderId');

export const initOpenOrders = (date: Date) => {
  db.push(`/history/${date}/open_orders`, [], true);
};

export const hasOpenOrders = (date: Date) => {
  return db.count(`history/${date}/open_orders`) > 0;
};

export const addOpenOrder = (date: Date, order: OpenOrder) => {
  db.push(`/history/${date}/open_orders[]`, order, false);
};

export const getOpenOrder = (date: Date, orderId: number): OpenOrder | null => {
  if (db.exists(`/history/${date}/open_orders`)) {
    const index = getOpenOrderIndex(date, orderId);
    return db.getData(`history/${date}/open_orders[${index}]`);
  }
};

export const getOpenOrders = (date: Date): OpenOrder[] | null => {
  if (db.exists(`/history/${date}/open_orders`)) {
    return db.getData(`history/${date}/open_orders`);
  }
};

export const deleteOpenOrder = (date: Date, orderId: number) => {
  if (db.exists(`/history/${date}/open_orders`)) {
    const index = getOpenOrderIndex(date, orderId);
    db.delete(`/history/${date}/open_orders[${index}]`);
  }
};

export const deleteOpenOrders = (date: Date) => {
  if (db.exists(`/history/${date}/open_orders`)) {
    db.push(`/history/${date}/open_orders`, [], true);
  }
};

export const initFuturesOpenOrders = (date: Date) => {
  db.push(`/history/${date}/futures_open_orders`, [], true);
};

export const hasFuturesOpenOrders = (date: Date) => {
  return db.count(`history/${date}/futures_open_orders`) > 0;
};

const getFuturesOpenOrderIndex = (date: Date, orderId: number) =>
  db.getIndex(`/history/${date}/futures_open_orders`, orderId, 'orderId');

export const addFuturesOpenOrder = (date: Date, order: FuturesOpenOrder) => {
  db.push(`/history/${date}/futures_open_orders[]`, order, false);
};

export const getFuturesOpenOrder = (
  date: Date,
  orderId: number
): FuturesOpenOrder | null => {
  if (db.exists(`/history/${date}/futures_open_orders`)) {
    const index = getFuturesOpenOrderIndex(date, orderId);
    return db.getData(`history/${date}/futures_open_orders[${index}]`);
  }
};

export const getFuturesOpenOrders = (date: Date): FuturesOpenOrder[] | null => {
  if (db.exists(`/history/${date}/futures_open_orders`)) {
    return db.getData(`history/${date}/futures_open_orders`);
  }
};

export const deleteFuturesOpenOrder = (date: Date, orderId: number) => {
  if (db.exists(`/history/${date}/futures_open_orders`)) {
    const index = getFuturesOpenOrderIndex(date, orderId);
    db.delete(`/history/${date}/open_orders[${index}]`);
  }
};

export const deleteFuturesOpenOrders = (date: Date) => {
  if (db.exists(`/history/${date}/futures_open_orders`)) {
    db.push(`/history/${date}/open_orders`, [], true);
  }
};

// Strategy result functions

export const setStrategyResults = (results: StrategyResults) => {
  db.push('/strategy_results', results, true);
};

export const getStrategyResults = (): StrategyResults | null => {
  if (db.exists('/strategy_results')) {
    return db.getData('/strategy_results');
  }
};
