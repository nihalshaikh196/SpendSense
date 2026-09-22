/**
 * @module log
 * @description Error logging that keeps detail out of the public build.
 *
 * Firebase errors can carry request context, so production logs only the
 * message and the error's code (e.g. "permission-denied"); the full object
 * is logged in development where it's useful.
 */

export function logError(message, err) {
  if (import.meta.env?.DEV) {
    console.error(message, err);
  } else {
    console.error(message, err?.code ?? '');
  }
}
