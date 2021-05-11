"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSellSignalRSI = exports.isBuySignalRSI = void 0;
var indicators = require('technicalindicators');
var RSI = indicators.RSI;
// RSI
var RSI_PERIOD = 14;
var RSI_OVERBOUGHT = 70;
var RSI_OVERSOLD = 30;
var isBuySignalRSI = function (tradeConfig, candles) {
    if (candles.length >= RSI_PERIOD) {
        var rsiValues = RSI.calculate({
            values: candles.map(function (candle) { return candle.close; }),
            period: tradeConfig.period,
        });
        var last = rsiValues[rsiValues.length - 2];
        var current = rsiValues[rsiValues.length - 1];
        // The rsi crossed the oversold line
        return last < RSI_OVERSOLD && current > RSI_OVERSOLD;
    }
};
exports.isBuySignalRSI = isBuySignalRSI;
var isSellSignalRSI = function (tradeConfig, candles) {
    if (candles.length >= RSI_PERIOD) {
        var rsiValues = RSI.calculate({
            values: candles.map(function (candle) { return candle.close; }),
            period: tradeConfig.period,
        });
        var last = rsiValues[rsiValues.length - 2];
        var current = rsiValues[rsiValues.length - 1];
        // The rsi crossed the overbought line
        return last > RSI_OVERBOUGHT && current < RSI_OVERBOUGHT;
    }
};
exports.isSellSignalRSI = isSellSignalRSI;
