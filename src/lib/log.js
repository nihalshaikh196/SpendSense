/**
 * @module log
 * @description Error logging: the full error object in development, just
 * the message and error code in production builds, to keep the console
 * readable.
 */

export function logError(message, err) {
  if (import.meta.env?.DEV) {
    console.error(message, err);
  } else {
    console.error(message, err?.code ?? '');
  }
}
