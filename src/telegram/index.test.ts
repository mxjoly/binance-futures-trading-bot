import { sendTelegramMessage } from './index';
import { telegramBot } from '../init';

const consoleLog = console.log;

describe('Telegram Bot', () => {
  beforeAll(() => {
    telegramBot.addListener('text', (messageInfo) => {
      telegramBot.deleteMessage(
        messageInfo.chat.id,
        String(messageInfo.message_id)
      );
    });
  });

  afterAll(() => {
    telegramBot.removeAllListeners();
  });

  beforeEach(() => {
    console.log = jest.fn();
  });

  afterEach(() => {
    console.log = consoleLog;
  });

  it('bot is initially correctly', async () => {
    expect(telegramBot).toBeDefined();
  });

  it('send a message', async () => {
    let messageInfo = await sendTelegramMessage('test');
    expect(messageInfo.text).toBe('test');
  });
});
