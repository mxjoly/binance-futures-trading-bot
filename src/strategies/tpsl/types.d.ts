interface BuySellProperty {
  deltaPercentage?: number; // Percentage of rise or fall to buy/sell
  fibonacciLevel?: FibonacciRetracementLevel | FibonacciExtensionLevel;
  quantityPercentage: number; // percentage between 0 and 1 for the quantity of tokens to buy/sell
}
