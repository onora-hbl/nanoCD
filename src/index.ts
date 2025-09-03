import { V1Container } from '@kubernetes/client-node';
import { loadConfig } from './config.js';
import { getDaemonSet, getDeployment, getStatefulSet, patchWorkload } from './k8s.js';
import logger from './logger.js';
import { NanoCDConfig } from './types.js';
import { getDockerHubTags } from './dockerhub.js';
import semver from 'semver';

function getConfig() {
  try {
    return loadConfig(process.env.CONFIG_PATH ?? '/etc/nanocd/config/config.yaml');
  } catch (err) {
    logger.error({ err }, 'Failed to load config');
    process.exit(1);
  }
}

async function getNewImage(image: string, imagePrefix: string) {
  const [currentImage, currentTag] = image.split(':');
  if (currentTag == null || !currentTag.startsWith(imagePrefix)) {
    logger.warn('Image %s does not have a valid tag', image);
    return null;
  }
  const currentVersion = currentTag.substring(imagePrefix.length);
  if (!semver.valid(currentVersion)) {
    logger.warn('Current version %s is not a valid semver', currentVersion);
    return null;
  }

  let newVersion = currentVersion;

  let tags: string[] = [];
  try {
    tags = await getDockerHubTags(image);
  } catch (err) {
    logger.error({ err }, 'Failed to get Docker Hub tags');
    return null;
  }
  for (const tag of tags) {
    if (!tag.startsWith(imagePrefix)) {
      continue;
    }
    const tagVersion = tag.substring(imagePrefix.length);
    if (!semver.valid(tagVersion)) {
      continue;
    }
    if (semver.gt(tagVersion, newVersion)) {
      newVersion = tagVersion;
    }
  }

  if (newVersion === currentVersion) {
    logger.debug('Image %s is already at the latest version %s', image, currentVersion);
    return null;
  }

  logger.info('Image %s has an update to version %s', image, newVersion);
  return `${currentImage}:${imagePrefix}${newVersion}`;
}

async function getContainersPatch(containers: V1Container[], imagePrefix: string) {
  const patch: Record<string, string> = {};
  for (const container of containers) {
    const image = container.image;
    if (image == null) {
      continue;
    }
    logger.debug('Processing image %s for container %s', image, container.name);
    const newImage = await getNewImage(image, imagePrefix);
    if (newImage != null) {
      patch[container.name] = newImage;
    }
  }
  return patch;
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
      const patch = await getContainersPatch(
        deploymentDetails.spec?.template?.spec?.containers ?? [],
        nsConfig.imagePrefix,
      );
      if (Object.keys(patch).length > 0) {
        await patchWorkload(namespace, 'Deployment', deploymentDetails, deployment, patch);
      }
    }
    for (const statefulSet of nsConfig.statefulSet ?? []) {
      logger.debug('Processing statefulSet: %s', statefulSet);
      const statefulSetDetails = await getStatefulSet(namespace, statefulSet);
      if (!statefulSetDetails) {
        logger.warn('StatefulSet not found: %s', statefulSet);
        continue;
      }
      const patch = await getContainersPatch(
        statefulSetDetails.spec?.template?.spec?.containers ?? [],
        nsConfig.imagePrefix,
      );
      if (Object.keys(patch).length > 0) {
        await patchWorkload(namespace, 'StatefulSet', statefulSetDetails, statefulSet, patch);
      }
    }
    for (const daemonSet of nsConfig.daemonSet ?? []) {
      logger.debug('Processing daemonSet: %s', daemonSet);
      const daemonSetDetails = await getDaemonSet(namespace, daemonSet);
      if (!daemonSetDetails) {
        logger.warn('DaemonSet not found: %s', daemonSet);
        continue;
      }
      const patch = await getContainersPatch(
        daemonSetDetails.spec?.template?.spec?.containers ?? [],
        nsConfig.imagePrefix,
      );
      if (Object.keys(patch).length > 0) {
        await patchWorkload(namespace, 'DaemonSet', daemonSetDetails, daemonSet, patch);
      }
    }
  }

  logger.debug('Cycle complete');
}

async function main() {
  const config = getConfig();
  logger.debug('Loaded config: %o', config);

  process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down...');
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down...');
    process.exit(0);
  });

  setInterval(() => cycle(config), config.refreshIntervalSeconds * 1000);

  logger.info('Application started!');
}

main().catch((err) => {
  logger.error({ err }, 'Unhandled error');
  process.exit(1);
});
