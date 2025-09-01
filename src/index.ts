import logger from './logger.js';

async function main() {
  logger.info('application started!');
  process.exit(0);
}

main().catch((err) => {
  logger.error('Unhandled error:', err);
  process.exit(1);
});
