import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Attachment } from 'discord.js';
import { config } from '../config/env.js';
import { sha256 } from './hashService.js';
import { downloadImage, downloadImageFromUrl, DownloadedImage } from './imageDownloader.js';
import { AiClient } from './aiClient.js';

const ai = new AiClient();

const extensionFromFilename = (filename: string): string => {
  const ext = path.extname(filename).toLowerCase();
  return ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext) ? ext : '.bin';
};

export type SpamImageRegistrationFields = {
  guild_id: string;
  registered_by_user_id: string;
  category?: string;
  notes?: string;
};

export type SpamImageRegistrationResult = {
  digest: string;
  localPath: string;
  aiResult: unknown;
  image: DownloadedImage;
  spamImageId?: number | null;
};

const spamImageIdFromAiResult = (value: unknown): number | null => {
  if (!value || typeof value !== 'object' || !('spam_image_id' in value)) return null;
  const id = (value as { spam_image_id?: unknown }).spam_image_id;
  return typeof id === 'number' && Number.isFinite(id) ? id : null;
};

export const saveSpamImageToBotFolder = async (buffer: Buffer, filename: string): Promise<{ digest: string; localPath: string; created: boolean }> => {
  const digest = sha256(buffer);
  const importDir = path.resolve(config.spamImageImportDir);
  await mkdir(importDir, { recursive: true });
  const localPath = path.join(importDir, `${digest}${extensionFromFilename(filename)}`);
  let created = true;
  await writeFile(localPath, buffer, { flag: 'wx' }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'EEXIST') throw error;
    created = false;
  });
  return { digest, localPath, created };
};

export const registerDownloadedSpamImage = async (image: DownloadedImage, fields: SpamImageRegistrationFields, client: Pick<AiClient, 'registerSpamImage'> = ai): Promise<SpamImageRegistrationResult> => {
  const saved = await saveSpamImageToBotFolder(image.buffer, image.filename);
  try {
    const aiResult = await client.registerSpamImage(image.buffer, image.filename, {
      guild_id: fields.guild_id,
      registered_by_user_id: fields.registered_by_user_id,
      category: fields.category ?? '',
      notes: fields.notes ? `${fields.notes}\nbot_image_path=${saved.localPath}` : `bot_image_path=${saved.localPath}`
    });
    return { digest: saved.digest, localPath: saved.localPath, aiResult, image, spamImageId: spamImageIdFromAiResult(aiResult) };
  } catch (error) {
    // A failed API call must not leave a new file in the watched import folder:
    // otherwise the next bot restart would silently register the failed image.
    if (saved.created) await unlink(saved.localPath).catch(() => undefined);
    throw error;
  }
};

export const registerSpamImageAttachment = async (attachment: Attachment, fields: SpamImageRegistrationFields): Promise<SpamImageRegistrationResult> => {
  const image = await downloadImage(attachment);
  return registerDownloadedSpamImage(image, fields);
};

export const registerSpamImageUrl = async (url: string, filename: string, fields: SpamImageRegistrationFields): Promise<SpamImageRegistrationResult> => {
  const image = await downloadImageFromUrl(url, filename);
  return registerDownloadedSpamImage(image, fields);
};
