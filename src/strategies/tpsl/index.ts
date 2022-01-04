import basicTpslStrategy from './basic';
import fibonacciTpslStrategy from './fibonacci';
import { OrderSide } from 'binance-api-node';

export default function ({
  candles,
  tradeConfig,
  pricePrecision,
  side,
}: {
  candles: ChartCandle[];
  tradeConfig?: TradeConfig;
  pricePrecision?: number;
  side: OrderSide;
}) {
  let { takeProfits: takeProfitFromBasic, stopLosses: stopLossesFromBasic } =
    basicTpslStrategy({
      candles,
      tradeConfig,
      pricePrecision,
      side,
    });

  let {
    takeProfits: takeProfitFromFibonacci,
    stopLosses: stopLossesFromFibonacci,
  } = fibonacciTpslStrategy({
    candles,
    tradeConfig,
    pricePrecision,
    side,
  });

  return {
    takeProfits: takeProfitFromBasic.concat(takeProfitFromFibonacci),
    stopLosses: stopLossesFromBasic.concat(stopLossesFromFibonacci),
  };
}
