import { pluginNames } from '../dayjsPlugins';
import dayjs from 'dayjs';

describe('DayJS Plugins', () => {
  it('plugins is defined', () => {
    pluginNames.forEach((plugin) => {
      expect(dayjs()[plugin]).toBeDefined();
    });
  });
});
