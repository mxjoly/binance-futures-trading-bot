import fs from 'fs';
import path from 'path';
import nodemon from 'nodemon';

const appDirectory = fs.realpathSync(process.cwd());
const resolveApp = (relativePath: string) =>
  path.resolve(appDirectory, relativePath);

nodemon({
  script: `${resolveApp('build')}/index.js`,
  ignore: ['db.json', 'bot.log'],
});

nodemon
  .on('start', () => {
    console.log('The trading bot has started');
  })
  .on('quit', () => {
    console.log('The trading bot stop to trade');
    process.exit();
  })
  .on('restart', (files) => {
    console.log(`The trading bot has restarted due to : ${files}`);
  });
