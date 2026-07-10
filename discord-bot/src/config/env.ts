import 'dotenv/config';

const numberFromEnv = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) throw new Error(`Invalid number for ${name}`);
  return parsed;
};

export const config = {
  discordToken: process.env.DISCORD_TOKEN ?? '',
  clientId: process.env.CLIENT_ID ?? '',
  guildId: process.env.GUILD_ID,
  databasePath: process.env.DATABASE_PATH ?? '../data/bot.sqlite',
  aiServiceUrl: process.env.AI_SERVICE_URL ?? 'http://localhost:8000',
  aiHeadersTimeoutMs: numberFromEnv('AI_HEADERS_TIMEOUT_MS', 180_000),
  aiBodyTimeoutMs: numberFromEnv('AI_BODY_TIMEOUT_MS', 300_000),
  messageContentIntent: process.env.MESSAGE_CONTENT_INTENT !== 'false',
  maxImageSizeBytes: numberFromEnv('MAX_IMAGE_SIZE_MB', 8) * 1024 * 1024,
  downloadTimeoutMs: numberFromEnv('DOWNLOAD_TIMEOUT_MS', 8000),
  downloadConcurrency: numberFromEnv('DOWNLOAD_CONCURRENCY', 4),
  spamAutoDeleteThreshold: numberFromEnv('SPAM_AUTO_DELETE_THRESHOLD', 0.97),
  spamReviewThreshold: numberFromEnv('SPAM_REVIEW_THRESHOLD', 0.9),
  phashMaxDistance: numberFromEnv('PHASH_MAX_DISTANCE', 10),
  reviewDeleteOnMedium: process.env.REVIEW_DELETE_ON_MEDIUM === 'true',
  cacheTtlMs: numberFromEnv('CACHE_TTL_MS', 300_000),
  spamImageImportDir: process.env.SPAM_IMAGE_IMPORT_DIR ?? './spam-images',
  falsePositiveReportChannelId: process.env.FALSE_POSITIVE_REPORT_CHANNEL_ID ?? '',
  adminWebPort: numberFromEnv('ADMIN_WEB_PORT', 3000),
  botOwnerUserIds: (process.env.BOT_OWNER_USER_IDS ?? '').split(',').map((id) => id.trim()).filter(Boolean),
  discordClientSecret: process.env.CLIENT_SECRET ?? '',
  webBaseUrl: (process.env.WEB_BASE_URL ?? `http://localhost:${numberFromEnv('ADMIN_WEB_PORT', 3000)}`).replace(/\/+$/, ''),
  logLevel: process.env.LOG_LEVEL ?? 'info'
};
