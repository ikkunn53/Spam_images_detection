import { db } from './database.js';
export type SpamImage = { id: number; sha256: string; phash?: string | null };
export class SpamImageRepository {
  findActiveBySha256(sha256: string): SpamImage | undefined {
    return db.prepare('SELECT id, sha256, phash FROM spam_images WHERE sha256 = ? AND active = 1').get(sha256) as SpamImage | undefined;
  }
}
