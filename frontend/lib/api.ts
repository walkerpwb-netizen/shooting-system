const DEFAULT_SERVER_API_URL = "http://127.0.0.1:8000";

function normalizePath(path: string) {
  return path.startsWith("/")
    ? path
    : `/${path}`;
}

export function apiUrl(path: string) {
  const normalizedPath = normalizePath(path);

  if (typeof window !== "undefined") {
    const browserApiUrl = process.env.NEXT_PUBLIC_API_URL
      || `${window.location.protocol}//${window.location.hostname}:8000`;

    return `${browserApiUrl}${normalizedPath}`;
  }

  const serverApiUrl = process.env.API_URL
    || process.env.NEXT_PUBLIC_API_URL
    || DEFAULT_SERVER_API_URL;

  return `${serverApiUrl}${normalizedPath}`;
}
