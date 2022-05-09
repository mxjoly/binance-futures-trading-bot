import { OrderSide } from 'binance-api-node';
import { calculateActivationPrice } from '../trailingStop';

describe('Trailing Stop', () => {
  let currentPrice = 10;

  it('calculateActivationPrice with no trailingStopConfig and takeProfits in arguments', () => {
    let activationPrice = calculateActivationPrice(
      currentPrice,
      2,
      OrderSide.BUY
    );
    expect(activationPrice).toBe(currentPrice);
  });

  it('calculateActivationPrice with changePercentage prop', () => {
    let trailingStopConfig: TrailingStopConfig = {
      activation: { changePercentage: 0.05 },
      callbackRate: 0.1,
    };

    let activationPrice1 = calculateActivationPrice(
      currentPrice,
      2,
      OrderSide.SELL,
      trailingStopConfig
    );
    let activationPrice2 = calculateActivationPrice(
      currentPrice,
      2,
      OrderSide.BUY,
      trailingStopConfig
    );

    expect(activationPrice1).toBe(
      currentPrice * (1 + trailingStopConfig.activation.changePercentage)
    );
    expect(activationPrice2).toBe(
      currentPrice * (1 - trailingStopConfig.activation.changePercentage)
    );
  });

  it('calculateActivationPrice with percentageToTP prop', () => {
    let trailingStopConfig: TrailingStopConfig = {
      activation: { percentageToTP: 0.5 },
      callbackRate: 0.1,
    };

    let takeProfit1: TakeProfit = { price: 11, quantityPercentage: 1 };
    let takeProfit2: TakeProfit = { price: 9, quantityPercentage: 1 };

    let activationPrice1 = calculateActivationPrice(
      currentPrice,
      2,
      OrderSide.SELL,
      trailingStopConfig,
      [takeProfit1]
    );
    let activationPrice2 = calculateActivationPrice(
      currentPrice,
      2,
      OrderSide.BUY,
      trailingStopConfig,
      [takeProfit2]
    );

    expect(activationPrice1).toBe(
      (currentPrice + takeProfit1.price) *
        trailingStopConfig.activation.percentageToTP
    );
    expect(activationPrice2).toBe(
      (currentPrice + takeProfit2.price) *
        trailingStopConfig.activation.percentageToTP
    );
  });
});
