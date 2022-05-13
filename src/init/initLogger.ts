import fs from 'fs';
import { createLogger, format, transports } from 'winston';

const loggerFilePath = {
  production: 'logs/bot-prod.log',
  development: 'logs/bot-dev.log',
  test: 'logs/bot-test.log',
};

if (fs.existsSync(loggerFilePath[process.env.NODE_ENV])) {
  fs.unlinkSync(loggerFilePath[process.env.NODE_ENV]);
}

export const initLogger = () =>
  createLogger({
    level: 'info',
    format: format.simple(),
    transports: [
      new transports.File({
        filename: loggerFilePath[process.env.NODE_ENV],
      }),
    ],
  });
