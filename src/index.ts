import { loadConfig } from './config.js';
import logger from './logger.js';

function getConfig() {
  try {
    return loadConfig(process.env.CONFIG_PATH ?? '/etc/nanocd/config/config.yaml');
  } catch (err) {
    logger.error({ err }, 'Failed to load config');
    process.exit(1);
  }
}

async function main() {
  const config = getConfig();
  logger.debug('Loaded config: %o', config);

  logger.info('Application started!');
  process.exit(0);
}

main().catch((err) => {
  logger.error({ err }, 'Unhandled error');
  process.exit(1);
});
