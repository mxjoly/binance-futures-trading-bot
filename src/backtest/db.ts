import { JsonDB } from 'node-json-db';
import { Config } from 'node-json-db/dist/lib/JsonDBConfig';
import dayjs from 'dayjs';
import fs from 'fs';
import path from 'path';

/**
 * See the declaration file types.ts to see the scheme of database
 */
export let db: JsonDB;

export const createDatabase = () => {
  db = new JsonDB(
    new Config(
      `backtests/backtest-${dayjs(new Date()).format('YYYY-MM-DD_HH-mm-ss')}`,
      true,
      true,
      '/'
    )
  );
};

// General Functions

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

// Wallet Functions

export const setWallet = (date: string, wallet: Wallet) => {
  db.push(`/history/${date}/wallet`, wallet, true);
};

export const setFuturesWallet = (date: string, wallet: FuturesWallet) => {
  db.push(`/history/${date}/futures_wallet`, wallet, true);
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
  db.push(`/history/${date}/futures_wallet`, { ...data }, false);
};

export const getWallet = (date: string): Wallet | null => {
  if (db.exists(`/history/${date}/wallet`)) {
    return db.getData(`history/${date}/wallet`);
  }
};

export const getFuturesWallet = (date: string): FuturesWallet | null => {
  if (db.exists(`/history/${date}/futures_wallet`)) {
    return db.getData(`history/${date}/futures_wallet`);
  }
};

// Orders functions

const getOpenOrderIndex = (date: string, orderId: number) =>
  db.getIndex(`/history/${date}/open_orders`, orderId, 'orderId');

export const setOpenOrders = (date: string, orders: OpenOrder[]) => {
  db.push(`/history/${date}/open_orders`, orders);
};

export const addOpenOrder = (date: string, order: OpenOrder) => {
  if (db.exists(`/history/${date}/open_orders`))
    db.push(`/history/${date}/open_orders`, []);
  db.push(`/history/${date}/open_orders[]`, order, false);
};

export const getOpenOrder = (
  date: string,
  orderId: number
): OpenOrder | null => {
  if (db.exists(`/history/${date}/open_orders`)) {
    const index = getOpenOrderIndex(date, orderId);
    return db.getData(`/history/${date}/open_orders[${index}]`);
  }
};

export const getOpenOrders = (date: string): OpenOrder[] | null => {
  if (db.exists(`/history/${date}/open_orders`)) {
    return db.getData(`/history/${date}/open_orders`);
  }
};

export const deleteOpenOrder = (date: string, orderId: number) => {
  if (db.exists(`/history/${date}/open_orders`)) {
    const index = getOpenOrderIndex(date, orderId);
    db.delete(`/history/${date}/open_orders[${index}]`);
  }
};

export const deleteOpenOrders = (date: string) => {
  if (db.exists(`/history/${date}/open_orders`)) {
    db.push(`/history/${date}/open_orders`, [], true);
  }
};

export const setFuturesOpenOrders = (
  date: string,
  orders: FuturesOpenOrder[]
) => {
  db.push(`/history/${date}/futures_open_orders`, orders);
};

const getFuturesOpenOrderIndex = (date: string, orderId: number) =>
  db.getIndex(`/history/${date}/futures_open_orders`, orderId, 'orderId');

export const addFuturesOpenOrder = (date: string, order: FuturesOpenOrder) => {
  if (db.exists(`/history/${date}/futures_open_orders`))
    db.push(`/history/${date}/futures_open_orders`, []);
  db.push(`/history/${date}/futures_open_orders[]`, order, false);
};

export const getFuturesOpenOrder = (
  date: string,
  orderId: number
): FuturesOpenOrder | null => {
  if (db.exists(`/history/${date}/futures_open_orders`)) {
    const index = getFuturesOpenOrderIndex(date, orderId);
    return db.getData(`/history/${date}/futures_open_orders[${index}]`);
  }
};

export const getFuturesOpenOrders = (
  date: string
): FuturesOpenOrder[] | null => {
  if (db.exists(`/history/${date}/futures_open_orders`)) {
    return db.getData(`/history/${date}/futures_open_orders`);
  }
};

export const deleteFuturesOpenOrder = (date: string, orderId: number) => {
  if (db.exists(`/history/${date}/futures_open_orders`)) {
    const index = getFuturesOpenOrderIndex(date, orderId);
    db.delete(`/history/${date}/open_orders[${index}]`);
  }
};

export const deleteFuturesOpenOrders = (date: string) => {
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
