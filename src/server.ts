import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import nodemon from 'nodemon';
import express, { Request, Response } from 'express';
import dayjs from 'dayjs';

const appDirectory = fs.realpathSync(process.cwd());
const resolveApp = (relativePath: string) =>
  path.resolve(appDirectory, relativePath);

const server = nodemon({ script: `${resolveApp('build')}/index.js` });
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req: Request, res: Response) => {
  res.send('Robot is running...');
});

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});

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
