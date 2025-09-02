import { V1Container } from '@kubernetes/client-node';
import { loadConfig } from './config.js';
import { getDaemonSet, getDeployment, getStatefulSet } from './k8s.js';
import logger from './logger.js';
import { NanoCDConfig } from './types.js';

function getConfig() {
  try {
    return loadConfig(process.env.CONFIG_PATH ?? '/etc/nanocd/config/config.yaml');
  } catch (err) {
    logger.error({ err }, 'Failed to load config');
    process.exit(1);
  }
}

async function processContainers(containers: V1Container[]) {
  for (const container of containers) {
    const image = container.image;
    if (image == null) {
      continue;
    }
    logger.debug('Processing image %s for container %s', image, container.name);
  }
}

async function cycle(config: NanoCDConfig) {
  logger.debug('Cycling...');

  for (const [namespace, nsConfig] of Object.entries(config.namespaces)) {
    logger.debug('Processing namespace: %s', namespace);
    for (const deployment of nsConfig.deployment ?? []) {
      logger.debug('Processing deployment: %s', deployment);
      const deploymentDetails = await getDeployment(namespace, deployment);
      if (!deploymentDetails) {
        logger.warn('Deployment not found: %s', deployment);
        continue;
      }
      await processContainers(deploymentDetails.spec?.template?.spec?.containers ?? []);
    }
    for (const statefulSet of nsConfig.statefulSet ?? []) {
      logger.debug('Processing statefulSet: %s', statefulSet);
      const statefulSetDetails = await getStatefulSet(namespace, statefulSet);
      if (!statefulSetDetails) {
        logger.warn('StatefulSet not found: %s', statefulSet);
        continue;
      }
      await processContainers(statefulSetDetails.spec?.template?.spec?.containers ?? []);
    }
    for (const daemonSet of nsConfig.daemonSet ?? []) {
      logger.debug('Processing daemonSet: %s', daemonSet);
      const daemonSetDetails = await getDaemonSet(namespace, daemonSet);
      if (!daemonSetDetails) {
        logger.warn('DaemonSet not found: %s', daemonSet);
        continue;
      }
      await processContainers(daemonSetDetails.spec?.template?.spec?.containers ?? []);
    }
  }

  logger.debug('Cycle complete');
}

async function main() {
  const config = getConfig();
  logger.debug('Loaded config: %o', config);

  setInterval(() => cycle(config), config.refreshIntervalSeconds * 1000);

  logger.info('Application started!');
}

main().catch((err) => {
  logger.error({ err }, 'Unhandled error');
  process.exit(1);
});
