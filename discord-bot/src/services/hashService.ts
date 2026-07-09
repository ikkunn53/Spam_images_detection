import crypto from 'node:crypto';
export const sha256 = (buffer: Buffer): string => crypto.createHash('sha256').update(buffer).digest('hex');
