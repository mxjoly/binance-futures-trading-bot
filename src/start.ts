import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import nodemon from 'nodemon';
import dateFormat from 'dateformat';

const appDirectory = fs.realpathSync(process.cwd());
const resolveApp = (relativePath: string) =>
  path.resolve(appDirectory, relativePath);

const server = nodemon({ script: `${resolveApp('build')}/index.js` });

server
  .on('start', () => {
    console.log(
      `${chalk.blueBright(dateFormat())} : The trading bot has started`
    );
  })
  .on('restart', () => {
    console.log(
      `${chalk.blueBright(dateFormat())} : The trading bot has restarted`
    );
  })
  .on('quit', () => {
    console.log(
      `${chalk.blueBright(dateFormat())} : The trading bot stops to trade`
    );
    process.exit();
  })
  .on('error', () => {
    console.error(`${chalk.blueBright(dateFormat())} : An error occurred`);
    process.exit(1);
  });
