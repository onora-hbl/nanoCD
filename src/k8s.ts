import {
  KubeConfig,
  AppsV1Api,
  V1Deployment,
  V1StatefulSet,
  V1DaemonSet,
} from '@kubernetes/client-node';

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
