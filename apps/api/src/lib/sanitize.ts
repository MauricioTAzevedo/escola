import { z } from 'zod';

/**
 * Utility functions for input sanitization to protect against XSS and script injection.
 */
export function sanitizeString(text: string): string {
  if (!text) return '';
  return text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/on\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '')
    .trim();
}

/**
 * Zod string transform helper that trims and sanitizes inputs automatically.
 */
export function sanitizedString(minLength = 1, errorMsg?: string) {
  return z
    .string({ required_error: errorMsg })
    .transform(sanitizeString)
    .refine((val) => val.length >= minLength, {
      message: errorMsg || `Deve conter pelo menos ${minLength} caractere(s)`,
    });
}
