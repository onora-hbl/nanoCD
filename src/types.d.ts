export type ImageConfig = {
  prefix: string;
  versionMatch: string;
};

export type NamespaceConfig = {
  deployment?: string[];
  statefulSet?: string[];
  daemonSet?: string[];
  images: Record<string, ImageConfig>;
  discordWebhook?: string;
};

export type NanoCDConfig = {
  namespaces: Record<string, NamespaceConfig>;
  refreshIntervalSeconds: number;
};
