import fs from 'fs';
import yaml from 'yaml';
import { z } from 'zod';
import type { NanoCDConfig } from './types.js';

export const ImageConfigSchema = z.strictObject({
  prefix: z.string().nonempty(),
  versionMatch: z.string().nonempty(),
});

export const NamespaceConfigSchema = z.strictObject({
  deployment: z.array(z.string()).nonempty().optional(),
  statefulSet: z.array(z.string()).nonempty().optional(),
  daemonSet: z.array(z.string()).nonempty().optional(),
  images: z.record(z.string(), ImageConfigSchema),
  discordWebhook: z.string().optional(),
});

const NanoCDConfigSchema = z.strictObject({
  namespaces: z.record(z.string(), NamespaceConfigSchema),
  refreshIntervalSeconds: z.number().min(1).optional(),
});

export function loadConfig(path: string): NanoCDConfig {
  const file = fs.readFileSync(path, 'utf8');
  const raw = yaml.parse(file);

  const parsed = NanoCDConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid config: ${parsed.error.message}`);
  }

  return {
    namespaces: Object.fromEntries(
      Object.entries(parsed.data.namespaces).map(([name, config]) => [
        name,
        {
          ...config,
          images: config.images ?? {},
        },
      ]),
    ),
    refreshIntervalSeconds: parsed.data.refreshIntervalSeconds ?? 60,
  };
}
