import { V1Container } from '@kubernetes/client-node';
import { loadConfig } from './config.js';
import { getDaemonSet, getDeployment, getStatefulSet, patchWorkload } from './k8s.js';
import logger from './logger.js';
import { ImageConfig, NanoCDConfig } from './types.js';
import { getDockerHubTags } from './dockerhub.js';
import semver from 'semver';
import fetch from 'node-fetch';

function getConfig() {
  try {
    return loadConfig(process.env.CONFIG_PATH ?? '/etc/nanocd/config/config.yaml');
  } catch (err) {
    logger.error({ err }, 'Failed to load config');
    process.exit(1);
  }
}

async function getNewImage(image: string, imageConfig: ImageConfig) {
  const [currentImage, currentTag] = image.split(':');
  if (currentTag == null || !currentTag.startsWith(imageConfig.prefix)) {
    logger.warn('Image %s does not have the correct prefix', image);
    return null;
  }
  const currentVersion = currentTag.substring(imageConfig.prefix.length);
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

  let isNotSatisfies = false;
  for (const tag of tags) {
    if (!tag.startsWith(imageConfig.prefix)) {
      continue;
    }
    const tagVersion = tag.substring(imageConfig.prefix.length);
    if (!semver.valid(tagVersion)) {
      continue;
    }
    if (semver.gt(tagVersion, newVersion)) {
      logger.debug('Found new version %s test range %s', tagVersion, imageConfig.versionMatch);
      if (!semver.satisfies(tagVersion, imageConfig.versionMatch)) {
        isNotSatisfies = true;
        continue;
      }
      newVersion = tagVersion;
    }
  }

  if (newVersion === currentVersion) {
    logger.debug('Image %s is already at the latest version %s', image, currentVersion);
    if (isNotSatisfies) {
      logger.info(
        'Image %s is not at the last version but new version does not satisfy the image range',
        image,
      );
    }
    return null;
  }

  logger.info('Image %s has an update to version %s', image, newVersion);
  return `${currentImage}:${imageConfig.prefix}${newVersion}`;
}

async function getContainersPatch(containers: V1Container[], images: Record<string, ImageConfig>) {
  const patch: Record<string, string> = {};
  for (const container of containers) {
    const image = container.image;
    if (image == null) {
      continue;
    }
    const imageName = image.split(':')[0];
    if (!(imageName in images)) {
      continue;
    }
    logger.debug('Processing image %s for container %s', image, container.name);
    const newImage = await getNewImage(image, images[imageName]);
    if (newImage != null) {
      patch[container.name] = newImage;
    }
  }
  return patch;
}

async function sendWebhook(
  namespace: string,
  workloadType: string,
  workloadName: string,
  patch: Record<string, string>,
  discordWebhookUrl: string,
) {
  const message = `${workloadType} \`${workloadName}\` from namespace \`${namespace}\` has been upgraded as follows:\n${Object.entries(
    patch,
  )
    .map(([container, image]) => `- \`${container}\` now points to \`${image}\``)
    .join('\n')}`;
  try {
    await fetch(discordWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content: message }),
    });
  } catch (err) {
    logger.error({ err }, 'Failed to send Discord webhook');
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
      const patch = await getContainersPatch(
        deploymentDetails.spec?.template?.spec?.containers ?? [],
        nsConfig.images,
      );
      if (Object.keys(patch).length > 0) {
        await patchWorkload(namespace, 'Deployment', deploymentDetails, deployment, patch);
        if (nsConfig.discordWebhook != null) {
          await sendWebhook(namespace, 'Deployment', deployment, patch, nsConfig.discordWebhook);
        }
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
        nsConfig.images,
      );
      if (Object.keys(patch).length > 0) {
        await patchWorkload(namespace, 'StatefulSet', statefulSetDetails, statefulSet, patch);
        if (nsConfig.discordWebhook != null) {
          await sendWebhook(namespace, 'StatefulSet', statefulSet, patch, nsConfig.discordWebhook);
        }
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
        nsConfig.images,
      );
      if (Object.keys(patch).length > 0) {
        await patchWorkload(namespace, 'DaemonSet', daemonSetDetails, daemonSet, patch);
        if (nsConfig.discordWebhook != null) {
          await sendWebhook(namespace, 'DaemonSet', daemonSet, patch, nsConfig.discordWebhook);
        }
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
