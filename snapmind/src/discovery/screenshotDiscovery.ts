import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';

import { CONFIG, type ScanRange, scanRangeCutoff } from '@/config';
import { META_KEYS, getMetaNumber, setMeta } from '@/db/database';
import { insertDiscoveredAssets, type DiscoveredAsset } from '@/db/repositories';

/**
 * Screenshot discovery.
 *
 * The whole point of SnapMind is that the user never picks images by hand, so
 * this module answers exactly one question: *which assets in the library are
 * screenshots?* It never sends anything anywhere — it only reads metadata.
 *
 * iOS  → PhotoKit exposes `mediaSubtypes: ['screenshot']`, which is exact.
 * Android → there is no subtype flag, so the "Screenshots" album is used, with
 *           filename/dimension heuristics as a fallback for devices that file
 *           screenshots elsewhere.
 */

const SCREENSHOT_ALBUM_NAMES = [
  'screenshots',
  'screenshot',
  'ekran görüntüleri',
  'ekran goruntuleri',
  'captures',
  'captures d’écran',
  'bildschirmfotos',
];

const FILENAME_PATTERN =
  /(screenshot|screen[_-]?shot|screen[_-]?capture|ekran|captura|capture|bildschirm|스크린샷|截屏|截图)/i;

export interface DiscoveryProgress {
  found: number;
  inserted: number;
  done: boolean;
}

export async function requestPhotoPermission(): Promise<MediaLibrary.PermissionResponse> {
  // `false` → read-only access; SnapMind never writes to the library.
  return MediaLibrary.requestPermissionsAsync(false);
}

export async function getPhotoPermission(): Promise<MediaLibrary.PermissionResponse> {
  return MediaLibrary.getPermissionsAsync(false);
}

/** True when the asset looks like a screenshot on the current platform. */
export function isScreenshotAsset(asset: MediaLibrary.Asset): boolean {
  if (asset.mediaType !== MediaLibrary.MediaType.photo) return false;

  const subtypes = (asset as { mediaSubtypes?: string[] }).mediaSubtypes;
  if (subtypes?.includes('screenshot')) return true;

  if (asset.filename && FILENAME_PATTERN.test(asset.filename)) return true;

  return false;
}

async function findScreenshotAlbum(): Promise<MediaLibrary.Album | null> {
  const albums = await MediaLibrary.getAlbumsAsync({
    includeSmartAlbums: true,
  });
  return (
    albums.find((album) =>
      SCREENSHOT_ALBUM_NAMES.includes(album.title.trim().toLowerCase()),
    ) ?? null
  );
}

/**
 * Walks the library page by page and records every screenshot it finds.
 *
 * Pages are reported as they land so the UI can show "Found 8,421 screenshots"
 * while the walk is still running, and the caller can abort at any page.
 */
export async function discoverScreenshots(options: {
  range: ScanRange;
  /** Only consider assets created after this ms timestamp (incremental scan). */
  createdAfter?: number | null;
  onProgress?: (progress: DiscoveryProgress) => void;
  shouldStop?: () => boolean;
}): Promise<DiscoveryProgress> {
  const { range, onProgress, shouldStop } = options;

  const rangeCutoff = scanRangeCutoff(range);
  const cutoff = Math.max(rangeCutoff ?? 0, options.createdAfter ?? 0) || null;

  // On Android the album narrows the walk enormously; on iOS the subtype flag
  // already does that, so the whole library is walked and filtered.
  const album = Platform.OS === 'android' ? await findScreenshotAlbum() : null;

  let after: MediaLibrary.AssetRef | undefined;
  let hasNext = true;
  let found = 0;
  let inserted = 0;
  let newestCreationTime = (await getMetaNumber(META_KEYS.lastDiscoveredCreationTime)) ?? 0;

  while (hasNext) {
    if (shouldStop?.()) break;

    const page = await MediaLibrary.getAssetsAsync({
      first: CONFIG.discoveryPageSize,
      after,
      album: album ?? undefined,
      mediaType: [MediaLibrary.MediaType.photo],
      sortBy: [MediaLibrary.SortBy.creationTime],
      ...(cutoff ? { createdAfter: cutoff } : {}),
    });

    const screenshots: DiscoveredAsset[] = [];
    let reachedCutoff = false;

    for (const asset of page.assets) {
      if (cutoff && asset.creationTime <= cutoff) {
        // Assets are newest-first, so everything below the cutoff is older.
        reachedCutoff = true;
        break;
      }
      // Inside a dedicated Screenshots album every photo counts; elsewhere the
      // asset has to look like a screenshot on its own.
      if (!album && !isScreenshotAsset(asset)) continue;

      screenshots.push({
        id: asset.id,
        uri: asset.uri,
        filename: asset.filename ?? null,
        width: asset.width ?? null,
        height: asset.height ?? null,
        creationTime: asset.creationTime ?? null,
      });
      newestCreationTime = Math.max(newestCreationTime, asset.creationTime ?? 0);
    }

    found += screenshots.length;
    inserted += await insertDiscoveredAssets(screenshots);
    onProgress?.({ found, inserted, done: false });

    hasNext = page.hasNextPage && !reachedCutoff;
    after = page.endCursor;
  }

  if (newestCreationTime > 0) {
    await setMeta(
      META_KEYS.lastDiscoveredCreationTime,
      String(newestCreationTime),
    );
  }

  const result = { found, inserted, done: true };
  onProgress?.(result);
  return result;
}

/**
 * Counts screenshots without inserting anything — used by onboarding to say
 * "We found 6,842 screenshots" before the user commits to a scan.
 */
export async function countScreenshots(range: ScanRange): Promise<number> {
  const cutoff = scanRangeCutoff(range);
  const album = Platform.OS === 'android' ? await findScreenshotAlbum() : null;

  // A whole-album count is already exact, so skip the walk entirely.
  if (album && cutoff === null) return album.assetCount;

  let after: MediaLibrary.AssetRef | undefined;
  let hasNext = true;
  let total = 0;

  while (hasNext) {
    const page = await MediaLibrary.getAssetsAsync({
      first: CONFIG.discoveryPageSize,
      after,
      album: album ?? undefined,
      mediaType: [MediaLibrary.MediaType.photo],
      sortBy: [MediaLibrary.SortBy.creationTime],
      ...(cutoff ? { createdAfter: cutoff } : {}),
    });
    total += album
      ? page.assets.length
      : page.assets.filter(isScreenshotAsset).length;
    hasNext = page.hasNextPage;
    after = page.endCursor;
  }

  return total;
}

/** Resolves a library asset to a readable `file://` URI for local processing. */
export async function resolveLocalUri(assetId: string): Promise<string | null> {
  try {
    const info = await MediaLibrary.getAssetInfoAsync(assetId);
    return info?.localUri ?? info?.uri ?? null;
  } catch {
    return null;
  }
}
