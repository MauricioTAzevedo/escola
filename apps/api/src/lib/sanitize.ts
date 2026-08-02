import { z } from 'zod';
import sanitizeHtml from 'sanitize-html';

/**
 * Utility functions for input sanitization using sanitize-html to protect against XSS.
 */
export function sanitizeString(text: string): string {
  if (!text) return '';

  return sanitizeHtml(text, {
    allowedTags: ['b', 'i', 'em', 'strong', 'code', 'pre', 'p', 'br', 'ul', 'ol', 'li', 'sub', 'sup', 'span'],
    allowedAttributes: {
      '*': ['class', 'style'],
    },
    allowedSchemes: ['http', 'https'],
  }).trim();
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
