// The site is deployed under a sub-path (GitHub Pages project site), so public
// assets must be prefixed with the configured `base`. `BASE_URL` does not
// always include a trailing slash, so normalize it before joining paths.
const BASE_URL = import.meta.env.BASE_URL.replace(/\/?$/, "/");

// Resolve a base-relative public path (e.g. "/favicon.svg") to a full URL
// that includes the deployment base path. Use this for anything served from
// `public/`; relative URLs break in dev, where the page is served without a
// trailing slash.
export function resolvePublicUrl(path: string): string {
  return `${BASE_URL}${path.replace(/^\//, "")}`;
}
