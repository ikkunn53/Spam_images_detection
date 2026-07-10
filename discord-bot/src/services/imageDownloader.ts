import { request } from 'undici';
import sharp from 'sharp';
import pLimit from 'p-limit';
import { Attachment } from 'discord.js';
import { config } from '../config/env.js';

const allowedExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const allowedMimePrefixes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const limit = pLimit(config.downloadConcurrency);

export type DownloadedImage = { buffer: Buffer; contentType: string; filename: string };

export const isProcessableImageAttachment = (attachment: Attachment): boolean => {
  if (attachment.size > config.maxImageSizeBytes) return false;
  const name = attachment.name?.toLowerCase() ?? '';
  const hasAllowedExtension = [...allowedExtensions].some((ext) => name.endsWith(ext));
  const contentType = attachment.contentType ?? '';
  return hasAllowedExtension && (contentType === '' || allowedMimePrefixes.some((prefix) => contentType.startsWith(prefix)));
};

const fetchImageUrl = async (url: string, filename: string): Promise<DownloadedImage> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.downloadTimeoutMs);
  try {
    const response = await request(url, { signal: controller.signal, maxRedirections: 2 });
    const contentType = String(response.headers['content-type'] ?? '');
    if (!allowedMimePrefixes.some((prefix) => contentType.startsWith(prefix))) throw new Error(`Unexpected content-type: ${contentType}`);
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of response.body) {
      const buf = Buffer.from(chunk);
      total += buf.length;
      if (total > config.maxImageSizeBytes) throw new Error('Image exceeds size limit');
      chunks.push(buf);
    }
    const buffer = Buffer.concat(chunks);
    await sharp(buffer, { limitInputPixels: 40_000_000 }).metadata();
    return { buffer, contentType, filename };
  } finally {
    clearTimeout(timeout);
  }
};

export const downloadImage = (attachment: Attachment): Promise<DownloadedImage> => limit(async () => {
  const filename = attachment.name ?? 'image';
  try {
    return await fetchImageUrl(attachment.url, filename);
  } catch (error) {
    if (!attachment.proxyURL || attachment.proxyURL === attachment.url) throw error;
    return fetchImageUrl(attachment.proxyURL, filename);
  }
});

export const downloadImageFromUrl = (url: string, filename = 'image'): Promise<DownloadedImage> => limit(() => fetchImageUrl(url, filename));
