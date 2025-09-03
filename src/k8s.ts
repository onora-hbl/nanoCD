import {
  KubeConfig,
  AppsV1Api,
  V1Deployment,
  V1StatefulSet,
  V1DaemonSet,
} from '@kubernetes/client-node';
import logger from './logger';

const kc = new KubeConfig();
kc.loadFromDefault();

const appsV1Api = kc.makeApiClient(AppsV1Api);

export async function getDeployment(namespace: string, name: string): Promise<V1Deployment | null> {
  try {
    return await appsV1Api.readNamespacedDeployment({
      name,
      namespace,
    });
  } catch (err: any) {
    if (err.code === 404) {
      return null;
    }
    throw err;
  }
}

export async function getStatefulSet(
  namespace: string,
  name: string,
): Promise<V1StatefulSet | null> {
  try {
    return await appsV1Api.readNamespacedStatefulSet({
      name,
      namespace,
    });
  } catch (err: any) {
    if (err.code === 404) {
      return null;
    }
    throw err;
  }
}

export async function getDaemonSet(namespace: string, name: string): Promise<V1DaemonSet | null> {
  try {
    return await appsV1Api.readNamespacedDaemonSet({
      name,
      namespace,
    });
  } catch (err: any) {
    if (err.code === 404) {
      return null;
    }
    throw err;
  }
}

type WorkloadKind = 'Deployment' | 'StatefulSet' | 'DaemonSet';
type ContainerName = string;
type Image = string;

export async function patchWorkload(
  namespace: string,
  kind: WorkloadKind,
  workload: V1Deployment | V1StatefulSet | V1DaemonSet,
  name: string,
  updates: Record<ContainerName, Image>,
): Promise<void> {
  try {
    const containers = workload.spec?.template?.spec?.containers ?? [];
    if (containers.length === 0) {
      throw new Error(`${kind} ${name} has no containers`);
    }

    const patch: any[] = [];
    containers.forEach((c, idx) => {
      if (updates[c.name]) {
        patch.push({
          op: 'replace',
          path: `/spec/template/spec/containers/${idx}/image`,
          value: updates[c.name],
        });
      }
    });

    if (patch.length === 0) {
      logger.info(`No matching containers to update in ${kind} ${name}`);
      return;
    }

    if (kind === 'Deployment') {
      await appsV1Api.patchNamespacedDeployment({
        name,
        namespace,
        body: patch,
      });
    } else if (kind === 'StatefulSet') {
      await appsV1Api.patchNamespacedStatefulSet({
        name,
        namespace,
        body: patch,
      });
    } else if (kind === 'DaemonSet') {
      await appsV1Api.patchNamespacedDaemonSet({
        name,
        namespace,
        body: patch,
      });
    }

    logger.info(`✅ Updated ${kind} ${namespace}/${name} with new images: %o`, updates);
  } catch (err) {
    logger.error({ err }, `Failed to update images for ${kind} ${namespace}/${name}`);
  }
}
