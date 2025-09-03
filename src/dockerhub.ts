import fetch from 'node-fetch';

export async function getDockerHubTags(image: string): Promise<string[]> {
  image = image.trim().split(':')[0];
  const repo = image.includes('/') ? image : `library/${image}`;

  const tokenResp = await fetch(
    `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repo}:pull`,
  );
  if (!tokenResp.ok) {
    throw new Error(`Failed to get Docker Hub token: ${tokenResp.statusText}`);
  }
  const tokenData = (await tokenResp.json()) as { token: string };

  const tagsResp = await fetch(`https://registry-1.docker.io/v2/${repo}/tags/list`, {
    headers: { Authorization: `Bearer ${tokenData.token}` },
  });
  if (!tagsResp.ok) {
    throw new Error(`Failed to fetch tags: ${tagsResp.statusText}`);
  }

  const data = (await tagsResp.json()) as { name: string; tags?: string[] };
  return data.tags ?? [];
}
