import { JsonDB } from 'node-json-db';
import { Config } from 'node-json-db/dist/lib/JsonDBConfig';

/**
 * See the declaration file types.ts to see the scheme of database
 */
export let db: JsonDB;

export const createDatabase = (strategyName: string) => {
  db = new JsonDB(
    new Config(`temp/${strategyName}-trace-${Date.now()}`, true, true, '/')
  );
};

// =================================================================

export const saveState = (
  date: string,
  wallet: Wallet,
  openOrders: OpenOrder[]
) => {
  setWallet(date, wallet);
  setOpenOrders(date, openOrders);
};

export const saveFuturesState = (
  date: string,
  wallet: FuturesWallet,
  openOrders: FuturesOpenOrder[]
) => {
  setFuturesWallet(date, wallet);
  setFuturesOpenOrders(date, openOrders);
};

// =================================================================

export const setWallet = (date: string, wallet: Wallet) => {
  db.push(`/${date}/wallet`, wallet, true);
};

export const setFuturesWallet = (date: string, wallet: FuturesWallet) => {
  db.push(`/${date}/futures_wallet`, wallet, true);
};

export const updateFuturesWalletInfo = (
  date: string,
  data: {
    availableBalance: number;
    totalWalletBalance: number;
    totalUnrealizedProfit: number;
    totalPositionInitialMargin: number;
  }
) => {
  db.push(`/${date}/futures_wallet`, { ...data }, false);
};

export const getWallet = (date: string): Wallet | null => {
  if (db.exists(`/${date}/wallet`)) {
    return db.getData(`/${date}/wallet`);
  }
};

export const getFuturesWallet = (date: string): FuturesWallet | null => {
  if (db.exists(`/${date}/futures_wallet`)) {
    return db.getData(`/${date}/futures_wallet`);
  }
};

// Orders functions

const getOpenOrderIndex = (date: string, orderId: number) =>
  db.getIndex(`/${date}/open_orders`, orderId, 'orderId');

export const setOpenOrders = (date: string, orders: OpenOrder[]) => {
  db.push(`/${date}/open_orders`, orders);
};

export const addOpenOrder = (date: string, order: OpenOrder) => {
  if (db.exists(`/${date}/open_orders`)) db.push(`/${date}/open_orders`, []);
  db.push(`/${date}/open_orders[]`, order, false);
};

export const getOpenOrder = (
  date: string,
  orderId: number
): OpenOrder | null => {
  if (db.exists(`/${date}/open_orders`)) {
    const index = getOpenOrderIndex(date, orderId);
    return db.getData(`/${date}/open_orders[${index}]`);
  }
};

export const getOpenOrders = (date: string): OpenOrder[] | null => {
  if (db.exists(`/${date}/open_orders`)) {
    return db.getData(`/${date}/open_orders`);
  }
};

export const deleteOpenOrder = (date: string, orderId: number) => {
  if (db.exists(`/${date}/open_orders`)) {
    const index = getOpenOrderIndex(date, orderId);
    db.delete(`/${date}/open_orders[${index}]`);
  }
};

export const deleteOpenOrders = (date: string) => {
  if (db.exists(`/${date}/open_orders`)) {
    db.push(`/${date}/open_orders`, [], true);
  }
};

export const setFuturesOpenOrders = (
  date: string,
  orders: FuturesOpenOrder[]
) => {
  db.push(`/${date}/futures_open_orders`, orders);
};

const getFuturesOpenOrderIndex = (date: string, orderId: number) =>
  db.getIndex(`/${date}/futures_open_orders`, orderId, 'orderId');

export const addFuturesOpenOrder = (date: string, order: FuturesOpenOrder) => {
  if (db.exists(`/${date}/futures_open_orders`))
    db.push(`/${date}/futures_open_orders`, []);
  db.push(`/${date}/futures_open_orders[]`, order, false);
};

export const getFuturesOpenOrder = (
  date: string,
  orderId: number
): FuturesOpenOrder | null => {
  if (db.exists(`/${date}/futures_open_orders`)) {
    const index = getFuturesOpenOrderIndex(date, orderId);
    return db.getData(`/${date}/futures_open_orders[${index}]`);
  }
};

export const getFuturesOpenOrders = (
  date: string
): FuturesOpenOrder[] | null => {
  if (db.exists(`/${date}/futures_open_orders`)) {
    return db.getData(`/${date}/futures_open_orders`);
  }
};

export const deleteFuturesOpenOrder = (date: string, orderId: number) => {
  if (db.exists(`/${date}/futures_open_orders`)) {
    const index = getFuturesOpenOrderIndex(date, orderId);
    db.delete(`/${date}/open_orders[${index}]`);
  }
};

export const deleteFuturesOpenOrders = (date: string) => {
  if (db.exists(`/${date}/futures_open_orders`)) {
    db.push(`/${date}/open_orders`, [], true);
  }
};
