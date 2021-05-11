"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var nodemon_1 = __importDefault(require("nodemon"));
nodemon_1.default({ script: require.resolve('./server.js') });
nodemon_1.default
    .on('start', function () {
    // bot.prepare();
    // bot.run();
})
    .on('quit', function () {
    console.log('Bot stop working');
    process.exit(1);
});
