import basicTpslStrategy from './basic';
import fibonacciTpslStrategy from './fibonacci';
import { OrderSide } from 'binance-api-node';

export default <TPSLStrategy>({
  price,
  candles,
  tradeConfig,
  pricePrecision,
  side,
}) => {
  let { takeProfits: takeProfitFromBasic, stopLosses: stopLossesFromBasic } =
    basicTpslStrategy({
      price,
      candles,
      tradeConfig,
      pricePrecision,
      side,
    });

  let {
    takeProfits: takeProfitFromFibonacci,
    stopLosses: stopLossesFromFibonacci,
  } = fibonacciTpslStrategy({
    price,
    candles,
    tradeConfig,
    pricePrecision,
    side,
  });

  return {
    takeProfits: takeProfitFromBasic.concat(takeProfitFromFibonacci),
    stopLosses: stopLossesFromBasic.concat(stopLossesFromFibonacci),
  };
};
