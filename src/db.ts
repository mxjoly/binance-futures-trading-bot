import { OrderSide, OrderType } from 'binance-api-node';
import { JsonDB } from 'node-json-db';
import { Config } from 'node-json-db/dist/lib/JsonDBConfig';

export const db = new JsonDB(new Config('db', true, true, '/'));

const OPEN_ORDERS_PATH = '/open_orders';

export const addOpenOrder = (
  symbol: string,
  id: number,
  side: OrderSide,
  type: OrderType,
  stopPrice: number
) => {
  const order: OpenOrder = { id, side, type, stopPrice };
  db.push(`${OPEN_ORDERS_PATH}/${symbol}[]`, order, true);
};

export const getOpenOrders = (symbol: string) => {
  return db.getData(`${OPEN_ORDERS_PATH}/${symbol}`) as OpenOrder[];
};

export const deleteOpenOrder = (symbol: string, orderId: number) => {
  const index = db.getIndex(`${OPEN_ORDERS_PATH}/${symbol}`, orderId, 'id');
  db.delete(`${OPEN_ORDERS_PATH}/${symbol}[${index}]`);
};

export const deleteOpenOrders = (symbol: string) => {
  db.delete(`${OPEN_ORDERS_PATH}/${symbol}`);
};
