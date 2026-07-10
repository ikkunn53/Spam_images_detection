import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/env.js';
import { AiClient } from './aiClient.js';
import { logger } from '../utils/logger.js';

const allowedExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

const findImageFiles = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return findImageFiles(fullPath);
    if (!entry.isFile()) return [];
    return allowedExtensions.has(path.extname(entry.name).toLowerCase()) ? [fullPath] : [];
  }));
  return files.flat();
};

export const importLocalSpamImages = async (botUserId?: string): Promise<void> => {
  const importDir = path.resolve(config.spamImageImportDir);
  const ai = new AiClient();
  try {
    const dirStat = await stat(importDir).catch(() => null);
    if (!dirStat?.isDirectory()) {
      logger.info({ importDir }, 'local spam image import directory does not exist; skipping import');
      return;
    }

    const imageFiles = await findImageFiles(importDir);
    logger.info({ importDir, count: imageFiles.length }, 'local spam image import started');
    for (const imagePath of imageFiles) {
      try {
        const fileStat = await stat(imagePath);
        if (fileStat.size > config.maxImageSizeBytes) {
          logger.warn({ imagePath, bytes: fileStat.size, maxBytes: config.maxImageSizeBytes }, 'local spam image skipped because it exceeds max size');
          continue;
        }
        const buffer = await readFile(imagePath);
        const result = await ai.registerSpamImage(buffer, path.basename(imagePath), {
          guild_id: '',
          registered_by_user_id: botUserId ?? 'local_import',
          category: 'local_import',
          notes: `imported from ${imagePath}`
        });
        logger.info({ imagePath, result }, 'local spam image imported');
      } catch (error) {
        logger.warn({ error, imagePath }, 'failed to import local spam image');
      }
    }
    logger.info({ importDir, count: imageFiles.length }, 'local spam image import finished');
  } catch (error) {
    logger.warn({ error, importDir }, 'local spam image import failed');
  }
};
