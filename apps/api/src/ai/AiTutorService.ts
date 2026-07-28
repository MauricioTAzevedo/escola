import { GeminiAiTutorService } from './GeminiAiTutorService';
import { MockAiTutorService } from './MockAiTutorService';
import { IAiTutorService } from './types';

export * from './types';
export * from './AiCacheService';
export * from './RateLimiter';
export * from './GeminiAiTutorService';
export * from './MockAiTutorService';

let activeService: IAiTutorService;

if (process.env.NODE_ENV === 'test') {
  activeService = new MockAiTutorService();
} else {
  activeService = new GeminiAiTutorService();
}

export const aiTutorService = activeService;
