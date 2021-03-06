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
  openOrders: Order[]
) => {
  setWallet(date, wallet);
  setOpenOrders(date, openOrders);
};

// =================================================================

export const setWallet = (date: string, wallet: Wallet) => {
  db.push(`/${date}/wallet`, wallet, true);
};

export const updateWalletInfo = (
  date: string,
  data: {
    availableBalance: number;
    totalWalletBalance: number;
    totalUnrealizedProfit: number;
    totalPositionInitialMargin: number;
  }
) => {
  db.push(`/${date}/wallet`, { ...data }, false);
};

export const getWallet = (date: string): Wallet | null => {
  if (db.exists(`/${date}/wallet`)) {
    return db.getData(`/${date}/wallet`);
  }
};

export const setOpenOrders = (date: string, orders: Order[]) => {
  db.push(`/${date}/open_orders`, orders);
};

const getOpenOrderIndex = (date: string, orderId: number) =>
  db.getIndex(`/${date}/open_orders`, orderId, 'orderId');

export const addOpenOrder = (date: string, order: Order) => {
  if (db.exists(`/${date}/open_orders`)) db.push(`/${date}/open_orders`, []);
  db.push(`/${date}/open_orders[]`, order, false);
};

export const getOpenOrder = (date: string, orderId: number): Order | null => {
  if (db.exists(`/${date}/open_orders`)) {
    const index = getOpenOrderIndex(date, orderId);
    return db.getData(`/${date}/open_orders[${index}]`);
  }
};

export const getOpenOrders = (date: string): Order[] | null => {
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
