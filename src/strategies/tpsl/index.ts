import basicTpslStrategy from './basic';
import fibonacciTpslStrategy from './fibonacci';

const strategy: TPSLStrategy = ({
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

export default strategy;
