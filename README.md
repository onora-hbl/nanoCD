# Nano CD

A minimal continuous deployment tool for Kubernetes workloads based on Docker hub and semantic versioning

## Features

- Image upgrading from Docker hub
- Semantic version based
- Kubernetes workload support (Deployments, StatefulSets, DaemonSets)
- Discord webhook notifications

## Usage

Deploy `onorahubleur/nano-cd` in your Kubernetes cluster and configure it using a ConfigMap (See [Configuration section](#configuration) for details)

It should have a role that allows it to read and patch specified workloads in configured namespaces

At regular intervals, the tool will check for new image versions on the docker hub (following semantic versioning) and patch the workloads with the new image versions if available

Nano CD will not create workload and will only update existing ones

## Configuration

Configuration file should be available at `/etc/nanocd/config/config.yaml` (or the path specified in the `CONFIG_PATH` environment variable). The configuration file should be in YAML format and contain the following sections:

```yaml
namespaces:
  <namespace>:
    deployment?:
      - <deployment-name>
    statefulSet?:
      - <statefulset-name>
    daemonSet?:
      - <daemonset-name>
    images:
      <image-name>:
        prefix: <prefix>
        versionMatch: <semver-range>
    discordWebhook?: <webhook-url>

refreshIntervalSeconds?: <seconds>
```

- The `refreshIntervalSeconds` field specifies how often the tool should check for new image versions (in seconds). If not specified, a default value of 60 seconds will be used
- The `prefix` field is used to specify a custom tag prefix before semantic versioning (if `v`, images should be versioned as `image:v<semver>`)
- The `versionMatch` field is used to specify a semantic version range to match against available images (e.g. `1.x`, `<2.0.0`, `*`, etc.). Any image that does not match the specified range will be ignored (even if the version is greater than the currently deployed version)
- The `discordWebhook` is an optional field that is used to specify a Discord webhook URL to be notified of new image versions

## K8S Example

Here is a basic example of a configuration file to deploy Nano CD in your k8s cluster

Warning: The role of this example gives permissions to read and patch all deployments, statefulsets, and daemonsets in the cluster, you should restrict it to only the necessary resources in your environment

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: nanocd-config
  namespace: nanocd
data:
  config.yaml: |
    namespaces:
      test:
        deployment:
          - test-app
        images:
          onorahubleur/test-app:
            prefix: v
            versionMatch: '*'
    refreshIntervalSeconds: 180

---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: nanocd
  namespace: nanocd
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: nanocd-role
rules:
  - apiGroups: ["apps"]
    resources: ["deployments", "statefulsets", "daemonsets"]
    verbs: ["get", "patch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: nanocd-binding
subjects:
  - kind: ServiceAccount
    name: nanocd
    namespace: nanocd
roleRef:
  kind: ClusterRole
  name: nanocd-role
  apiGroup: rbac.authorization.k8s.io

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nanocd
  namespace: nanocd
spec:
  replicas: 1
  selector:
    matchLabels:
      app: nanocd
  template:
    metadata:
      labels:
        app: nanocd
    spec:
      serviceAccountName: nanocd
      containers:
        - name: nanocd
          image: onorahubleur/nano-cd:latest
          volumeMounts:
            - name: nanocd-config
              mountPath: /etc/nanocd/config
              readOnly: true
      volumes:
        - name: nanocd-config
          configMap:
            name: nanocd-config
            items:
              - key: config.yaml
                path: config.yaml
```