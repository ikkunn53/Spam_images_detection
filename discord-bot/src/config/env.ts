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
  messageContentIntent: process.env.MESSAGE_CONTENT_INTENT === 'true',
  maxImageSizeBytes: numberFromEnv('MAX_IMAGE_SIZE_MB', 8) * 1024 * 1024,
  downloadTimeoutMs: numberFromEnv('DOWNLOAD_TIMEOUT_MS', 8000),
  downloadConcurrency: numberFromEnv('DOWNLOAD_CONCURRENCY', 4),
  spamAutoDeleteThreshold: numberFromEnv('SPAM_AUTO_DELETE_THRESHOLD', 0.97),
  spamReviewThreshold: numberFromEnv('SPAM_REVIEW_THRESHOLD', 0.9),
  phashMaxDistance: numberFromEnv('PHASH_MAX_DISTANCE', 6),
  reviewDeleteOnMedium: process.env.REVIEW_DELETE_ON_MEDIUM === 'true',
  cacheTtlMs: numberFromEnv('CACHE_TTL_MS', 300_000),
  logLevel: process.env.LOG_LEVEL ?? 'info'
};
