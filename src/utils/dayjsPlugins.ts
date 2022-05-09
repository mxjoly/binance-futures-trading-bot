import dayjs, { PluginFunc } from 'dayjs';

export let pluginNames: string[] = [
  'isBetween',
  'isSameOrBefore',
  'isSameOrAfter',
];

let plugins: PluginFunc[] = pluginNames.map((plugin) =>
  require(`dayjs/plugin/${plugin}`)
);

/**
 * Initialize the plugins for dayjs
 * @see https://day.js.org/docs/en/plugin/loading-into-nodejs
 */
export function initializePlugins() {
  plugins.forEach((plugin) => dayjs.extend(plugin));
}

declare module 'dayjs' {
  interface Dayjs {
    isSameOrBefore(date: ConfigType, unit?: OpUnitType): boolean;
    isSameOrAfter(date: ConfigType, unit?: OpUnitType): boolean;
    isBetween(
      a: ConfigType,
      b: ConfigType,
      c?: OpUnitType | null,
      d?: '()' | '[]' | '[)' | '(]'
    ): boolean;
  }
}
