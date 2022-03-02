import dayjs from 'dayjs';
import chalk from 'chalk';
import { OrderSide } from 'binance-api-node';
import { logger, BINANCE_MODE } from '../init';

/**
 * Main function add a log
 * @param message
 * @param date
 */
export function log(message: string, date = new Date()) {
  const logDate = dayjs(date).format('YYYY-MM-DD HH:mm:ss');
  logger.info(`${logDate} : @${BINANCE_MODE} > ${message}`);
  console.log(`${chalk.blue(logDate)} : @${BINANCE_MODE} > ${message}`);
}

/**
 * Main function add an error in the logs
 * @param message
 * @param date
 */
export function error(message: string, date = new Date()) {
  const logDate = dayjs(date).format('YYYY-MM-DD HH:mm:ss');
  logger.warn(`${logDate} : @${BINANCE_MODE} > ${message}`);
  console.log(`${chalk.blue(logDate)} : @${BINANCE_MODE} > ${message}`);
}

/**
 * Function to log the message when an order is opened
 * @param orderSide
 * @param asset
 * @param base
 * @param price
 * @param quantity
 * @param takeProfits
 * @param stopLoss
 */
export function logBuySellExecutionOrder(
  orderSide: OrderSide,
  asset: string,
  base: string,
  price: number,
  quantity: number,
  takeProfits: { price: number; quantityPercentage: number }[],
  stopLoss: number
) {
  let introPhrase =
    BINANCE_MODE === 'spot'
      ? `${
          orderSide === OrderSide.BUY ? 'Buy' : 'Sell'
        } ${quantity}${asset} at the price ${price}${base}`
      : `Open a ${
          orderSide === OrderSide.BUY ? 'long' : 'short'
        } position on ${asset}${base} at the price ${price} with a size of ${quantity}${asset}`;

  let tp = `TP: ${
    takeProfits.length > 0
      ? takeProfits
          .map(
            (takeProfit) =>
              `[${takeProfit.price} => ${takeProfit.quantityPercentage * 100}%]`
          )
          .join(' ')
      : '----'
  }`;

  let sl = `SL: ${stopLoss ? stopLoss : '----'}`;

  log([introPhrase, tp, sl].join(' | '));
}
