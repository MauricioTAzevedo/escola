import sanitizeHtml from 'sanitize-html';

/**
 * Utility functions for input sanitization to protect against XSS and script injection.
 */
export function sanitizeString(text: string): string {
  if (!text) return '';
  return sanitizeHtml(text, {
    // Text fields in this app are plain text; strip ALL HTML tags/attributes.
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
  }).trim();
}
