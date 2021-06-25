import { JsonDB } from 'node-json-db';
import { Config } from 'node-json-db/dist/lib/JsonDBConfig';

export const db = new JsonDB(new Config('db', true, true, '/'));

export const addOpenOrder = (symbol: string, id: number) => {
  db.push(`/futures/open_orders/${symbol}[]`, id, true);
};

export const getOpenOrders = (symbol: string) => {
  return db.getData(`/futures/open_orders/${symbol}`) as number[];
};

export const deleteOpenOrder = (symbol: string) => {
  db.delete(`/futures/open_orders/${symbol}`);
};
