import { apiUrl } from "@/lib/api";

export type ShootingRange = {
  id: number; name: string; address: string; phone: string; website: string;
  latitude: number; longitude: number;
};

export async function getShootingRanges(): Promise<ShootingRange[]> {
  const response = await fetch(apiUrl("/shooting-ranges"), {
    cache: "no-store", signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Shooting ranges API: HTTP ${response.status}`);
  const data: unknown = await response.json();
  if (!Array.isArray(data) || data.some((range) => !range || typeof range !== "object"
    || !Number.isInteger(range.id) || range.id < 1 || range.id > 2_147_483_647
    || typeof range.name !== "string" || !range.name.trim()
    || [range.address, range.phone, range.website].some((value) => typeof value !== "string")
    || !Number.isFinite(range.latitude) || range.latitude < -90 || range.latitude > 90
    || !Number.isFinite(range.longitude) || range.longitude < -180 || range.longitude > 180)
    || new Set(data.map((range) => range.id)).size !== data.length) {
    throw new Error("Shooting ranges API: invalid directory");
  }
  return data as ShootingRange[];
}

export function websiteUrl(value: string): string | undefined {
  if (!value.trim()) return undefined;
  try {
    const url = new URL(/^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}
