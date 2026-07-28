import crypto from 'crypto';
import { prisma } from '../lib/prisma';

export class AiCacheService {
  private static generateHash(keyParts: string[]): string {
    const combined = keyParts.join('::');
    return crypto.createHash('sha256').update(combined).digest('hex');
  }

  static async getCachedResponse(keyParts: string[]): Promise<string | null> {
    try {
      const hashKey = this.generateHash(keyParts);
      const cacheRecord = await prisma.aiCache.findUnique({
        where: { hashKey },
      });

      if (!cacheRecord) return null;

      // Check expiry
      if (cacheRecord.expiresAt < new Date()) {
        await prisma.aiCache.delete({ where: { hashKey } }).catch(() => {});
        return null;
      }

      return cacheRecord.response;
    } catch (err) {
      console.warn('⚠️ AiCache read failed:', err);
      return null;
    }
  }

  static async setCachedResponse(
    keyParts: string[],
    response: string,
    ttlHours: number = 72
  ): Promise<void> {
    try {
      const hashKey = this.generateHash(keyParts);
      const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

      await prisma.aiCache.upsert({
        where: { hashKey },
        update: {
          response,
          expiresAt,
        },
        create: {
          hashKey,
          response,
          expiresAt,
        },
      });
    } catch (err) {
      console.warn('⚠️ AiCache write failed:', err);
    }
  }
}
