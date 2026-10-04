import * as FileSystem from "expo-file-system/legacy";

const CACHE_DIR = `${FileSystem.cacheDirectory ?? ""}catalog-images/`;

const memoryCache = new Map<string, string>();
const inFlight = new Map<string, Promise<string>>();

function hashUrl(url: string): string {
  let h = 5381;
  for (let i = 0; i < url.length; i++) {
    h = ((h << 5) + h) ^ url.charCodeAt(i);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function extensionFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const match = path.match(/\.(webp|jpe?g|png|gif)$/i);
    return match ? match[0].toLowerCase() : ".webp";
  } catch {
    return ".webp";
  }
}

function localPathForUrl(remoteUrl: string): string {
  return `${CACHE_DIR}${hashUrl(remoteUrl)}${extensionFromUrl(remoteUrl)}`;
}

async function ensureCacheDir(): Promise<void> {
  if (!FileSystem.cacheDirectory) return;
  await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
}

/**
 * Returns a device-local file URI for a remote catalog image.
 * Reuses disk cache when the same URL was downloaded before; a new URL downloads again.
 */
export async function resolveCatalogImageUri(remoteUrl: string): Promise<string> {
  const trimmed = remoteUrl.trim();
  if (!trimmed) {
    throw new Error("Empty image URL");
  }
  if (!FileSystem.cacheDirectory) {
    return trimmed;
  }

  const cached = memoryCache.get(trimmed);
  if (cached) return cached;

  const pending = inFlight.get(trimmed);
  if (pending) return pending;

  const job = (async () => {
    await ensureCacheDir();
    const localUri = localPathForUrl(trimmed);
    const info = await FileSystem.getInfoAsync(localUri);
    if (info.exists && info.size && info.size > 0) {
      memoryCache.set(trimmed, localUri);
      return localUri;
    }

    const result = await FileSystem.downloadAsync(trimmed, localUri);
    memoryCache.set(trimmed, result.uri);
    return result.uri;
  })();

  inFlight.set(trimmed, job);
  try {
    return await job;
  } finally {
    inFlight.delete(trimmed);
  }
}

/** Warm disk cache after catalog load (non-blocking). */
export function prefetchCatalogImages(urls: Iterable<string | null | undefined>): void {
  const seen = new Set<string>();
  for (const raw of urls) {
    const url = raw?.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    void resolveCatalogImageUri(url).catch(() => {
      /* network errors fall back to remote on display */
    });
  }
}
