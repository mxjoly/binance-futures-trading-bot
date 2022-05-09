import dayjs from 'dayjs';
import { logger } from '../../init';
import { log, error, logBuySellExecutionOrder } from '../log';
import { OrderSide } from 'binance-api-node';

jest.mock('chalk', () => ({
  blue: (string: string) => string,
}));

describe('Log', () => {
  let mockTimeStamp = 1652038369;

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(logger, 'info').mockImplementation();
    jest.spyOn(logger, 'warn').mockImplementation();
    jest.spyOn(Date, 'now').mockImplementation(() => mockTimeStamp);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('log', () => {
    log('Test');
    let expected = `${dayjs(mockTimeStamp).format(
      'YYYY-MM-DD HH:mm:ss'
    )} : Test`;
    expect(console.log).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(expected);
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(expected);
  });

  it('error', () => {
    error('Test');
    let expected = `${dayjs(mockTimeStamp).format(
      'YYYY-MM-DD HH:mm:ss'
    )} : Test`;
    expect(console.log).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(expected);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(expected);
  });

  it('logBuySellExecutionOrder', () => {
    logBuySellExecutionOrder(
      OrderSide.BUY,
      'BTC',
      'USDT',
      10000,
      1,
      [{ price: 11000, quantityPercentage: 1 }],
      9000
    );

    let expected = `${dayjs(mockTimeStamp).format(
      'YYYY-MM-DD HH:mm:ss'
    )} : Open a long position on BTCUSDT at the price 10000 with a size of 1BTC | TP: [11000 => 100%] | SL: [9000 => 100%]`;
    expect(console.log).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(expected);
  });

  it('logBuySellExecutionOrder without takeProfits and stopLoss argument', () => {
    logBuySellExecutionOrder(OrderSide.SELL, 'BTC', 'USDT', 10000, 1, [], null);

    let expected = `${dayjs(mockTimeStamp).format(
      'YYYY-MM-DD HH:mm:ss'
    )} : Open a short position on BTCUSDT at the price 10000 with a size of 1BTC | TP: ---- | SL: ----`;
    expect(console.log).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(expected);
  });
});
