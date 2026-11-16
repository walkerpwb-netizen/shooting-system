import type { MouseEvent } from "react";

export function normalizeWebsiteUrl(website: string) {
  const trimmedWebsite = website.trim();
  if (!trimmedWebsite) return "";
  return /^https?:\/\//i.test(trimmedWebsite) ? trimmedWebsite : `https://${trimmedWebsite}`;
}

export function openMapOnMac(event: MouseEvent<HTMLAnchorElement>) {
  // iPads can use a Macintosh user agent; preserve their working geo: links.
  if (!/Macintosh/.test(navigator.userAgent) || navigator.maxTouchPoints > 1) return;
  const coordinates = new URL(event.currentTarget.href).pathname;
  event.preventDefault();
  window.location.assign(`maps://?ll=${coordinates}&q=${coordinates}`);
}
