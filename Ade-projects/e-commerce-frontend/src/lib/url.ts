import { DEMO } from '../demo/server';

/** An absolute URL to a page of this app, for payment providers to return to. */
export function appUrl(path: string): string {
  return DEMO ? `${window.location.origin}${window.location.pathname}#${path}` : `${window.location.origin}${path}`;
}
