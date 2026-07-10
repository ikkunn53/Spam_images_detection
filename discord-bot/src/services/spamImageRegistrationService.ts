import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Attachment } from 'discord.js';
import { config } from '../config/env.js';
import { sha256 } from './hashService.js';
import { downloadImage, DownloadedImage } from './imageDownloader.js';
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
};

export const saveSpamImageToBotFolder = async (buffer: Buffer, filename: string): Promise<{ digest: string; localPath: string }> => {
  const digest = sha256(buffer);
  const importDir = path.resolve(config.spamImageImportDir);
  await mkdir(importDir, { recursive: true });
  const localPath = path.join(importDir, `${digest}${extensionFromFilename(filename)}`);
  await writeFile(localPath, buffer, { flag: 'wx' }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'EEXIST') throw error;
  });
  return { digest, localPath };
};

export const registerDownloadedSpamImage = async (image: DownloadedImage, fields: SpamImageRegistrationFields): Promise<SpamImageRegistrationResult> => {
  const saved = await saveSpamImageToBotFolder(image.buffer, image.filename);
  const aiResult = await ai.registerSpamImage(image.buffer, image.filename, {
    guild_id: fields.guild_id,
    registered_by_user_id: fields.registered_by_user_id,
    category: fields.category ?? '',
    notes: fields.notes ? `${fields.notes}\nbot_image_path=${saved.localPath}` : `bot_image_path=${saved.localPath}`
  });
  return { ...saved, aiResult, image };
};

export const registerSpamImageAttachment = async (attachment: Attachment, fields: SpamImageRegistrationFields): Promise<SpamImageRegistrationResult> => {
  const image = await downloadImage(attachment);
  return registerDownloadedSpamImage(image, fields);
};
