import TelegramBot from 'node-telegram-bot-api';
import { error, log } from '../utils/log';

const token = process.env.TELEGRAM_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

if (!token || !chatId) {
  console.error(
    'You must set up the environment variable TELEGRAM_TOKEN and TELEGRAM_CHAT_ID to use the Telegram bot'
  );
  process.exit(1);
}

const telegramBot =
  process.env.NODE_ENV === 'production'
    ? new TelegramBot(token, { polling: true })
    : null;

export function sendTelegramMessage(message: string) {
  telegramBot
    .sendMessage(chatId, message)
    .then(() => {
      log(`Telegram message send successfully`);
    })
    .catch(error);
}
