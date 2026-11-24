export type MediaKind = 'image' | 'file' | 'voice' | 'video';

export const MEDIA_KINDS: MediaKind[] = ['image', 'file', 'voice', 'video'];

const TYPES: Record<MediaKind, Record<string, string>> = {
  image: {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
  },
  voice: {
    'audio/mpeg': '.mp3',
    'audio/mp4': '.m4a',
    'audio/x-m4a': '.m4a',
    'audio/aac': '.aac',
    'audio/ogg': '.ogg',
    'audio/webm': '.webm',
  },
  video: {
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/webm': '.webm',
  },
  // Documents only. Programs and scripts are never accepted.
  file: {
    'application/pdf': '.pdf',
    'application/zip': '.zip',
    'text/plain': '.txt',
    'text/csv': '.csv',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/vnd.ms-powerpoint': '.ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  },
};

const DEFAULT_MB: Record<MediaKind, number> = { image: 10, voice: 10, video: 100, file: 50 };
export const MAX_VOICE_SECONDS_DEFAULT = 900;

export function extensionFor(kind: MediaKind, contentType: string): string | null {
  return TYPES[kind][contentType.toLowerCase()] ?? null;
}

/** MAX_IMAGE_MB, MAX_VOICE_MB, MAX_VIDEO_MB, MAX_FILE_MB, else the default. */
export function maxBytes(kind: MediaKind, env: (key: string) => string | undefined): number {
  const value = Number(env(`MAX_${kind.toUpperCase()}_MB`));
  return (Number.isFinite(value) && value > 0 ? value : DEFAULT_MB[kind]) * 1024 * 1024;
}

/** Keeps a display name readable and harmless: no paths, no control characters. */
export function safeName(name: string | undefined): string | null {
  if (!name) return null;
  const cleaned = name
    .replace(/[\\/]/g, '_')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 120);
  return cleaned || null;
}
