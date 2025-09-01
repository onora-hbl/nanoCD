export type NamespaceConfig = {
  deployment?: string[];
  statefulSet?: string[];
  daemonSet?: string[];
  imagePrefix: string;
};

export type NanoCDConfig = {
  namespaces: Record<string, NamespaceConfig>;
  refreshIntervalSeconds: number;
};
