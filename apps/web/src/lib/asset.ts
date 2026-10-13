/** URL for a file in `public/`, respecting the GitHub Pages base path. */
export function asset(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
}
