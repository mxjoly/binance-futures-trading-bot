import safeRequire from 'safe-require';

const defaultJsonPath = `${process.cwd()}/config.json`;

export const initJSonConfig = (path = defaultJsonPath) => {
  const config = safeRequire(path);
  if (!config) {
    console.error(
      'Something is wrong. No json config file has been found at the root of the project.'
    );
    process.exit(1);
  }
  return config;
};
