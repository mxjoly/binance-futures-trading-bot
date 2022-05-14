import chalk from 'chalk';
import dayjs from 'dayjs';
import { logger } from '../init';
import { decimalFloor } from '../utils/math';
import { DEBUG } from './bot';

export function log(message: any, chalkColor?: any) {
  if (DEBUG) {
    if (chalkColor) console.log(chalkColor(message));
    else console.log(chalk.white(message));
  }
  logger.info(message);
}

export function printDateBanner(date: Date) {
  log(
    `------------------------------- ${dayjs(date).format(
      'YYYY-MM-DD HH:mm:ss'
    )} -----------------------------------`,
    chalk.white
  );
}

export function debugCandle(candle: CandleData) {
  let { close, open, high, low } = candle;
  log(
    `candle: [ open: ${open} | high: ${high} | low: ${low} | close: ${close} ]`,
    chalk.yellow
  );
}

export function debugWallet(wallet: Wallet) {
  let {
    availableBalance,
    totalWalletBalance,
    totalUnrealizedProfit,
    positions,
  } = wallet;
  let walletString = `wallet: { availableBalance: ${decimalFloor(
    availableBalance,
    2
  )} | totalBalance: ${decimalFloor(
    totalWalletBalance,
    2
  )} | unrealizedProfit: ${decimalFloor(totalUnrealizedProfit, 2)} }`;
  log(walletString, chalk.grey);
  let positionsString =
    'positions: ' +
    positions.map(
      (pos) =>
        `[ pair: ${pos.pair} | leverage: ${pos.leverage} | positionSide: ${
          pos.positionSide
        } | size: ${pos.size} | margin: ${decimalFloor(
          pos.margin,
          2
        )} | entryPrice: ${pos.entryPrice} | pnl: ${decimalFloor(
          pos.unrealizedProfit,
          2
        )} ]`
    );
  log(positionsString, chalk.grey);
}

export function debugOpenOrders(openOrders: Order[]) {
  if (openOrders.length > 0) {
    let ordersString = `orders: [ ${openOrders
      .map(
        (o) =>
          `{ id: ${o.id} | pair: ${o.pair} | type: ${o.type} | side: ${o.side} | qty: ${o.quantity} | price: ${o.price} }`
      )
      .join(' , ')} ]`;

    log(ordersString, chalk.grey);
  }
}
