import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import nodemon from 'nodemon';
import dayjs from 'dayjs';

const appDirectory = fs.realpathSync(process.cwd());
const resolveApp = (relativePath: string) =>
  path.resolve(appDirectory, relativePath);

const server = nodemon({ script: `${resolveApp('build')}/index.js` });

server
  .on('start', () => {
    console.log(
      `${chalk.blueBright(
        dayjs().format('YYYY-MM-DD HH:mm:ss')
      )} : The trading bot has started`
    );
  })
  .on('restart', () => {
    console.log(
      `${chalk.blueBright(
        dayjs().format('YYYY-MM-DD HH:mm:ss')
      )} : The trading bot has restarted`
    );
  })
  .on('quit', () => {
    console.log(
      `${chalk.blueBright(
        dayjs().format('YYYY-MM-DD HH:mm:ss')
      )} : The trading bot stops to trade`
    );
    process.exit();
  })
  .on('error', () => {
    console.error(
      `${chalk.blueBright(
        dayjs().format('YYYY-MM-DD HH:mm:ss')
      )} : An error occurred`
    );
    process.exit(1);
  });
