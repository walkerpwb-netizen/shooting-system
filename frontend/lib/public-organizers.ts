import "server-only";
import { cache } from "react";
import { apiUrl } from "./api";

type OrganizerEvent = { id: number; name: string; date: string; location: string; status: string; event_type: "competition" | "training" };
export type Organizer = { id: number; name: string; description: string; events: OrganizerEvent[] };

export const getOrganizer = cache(async (id: string): Promise<Organizer | null> => {
  if (!/^[1-9]\d*$/.test(id) || Number(id) > 2_147_483_647) return null;
  const signal = AbortSignal.timeout(5000);
  const response = await fetch(apiUrl(`/public-organizers/${id}`), { cache: "no-store", signal });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Organizer API HTTP ${response.status}`);
  const data = await response.json();
  if (!data || data.id !== Number(id) || typeof data.name !== "string" || !data.name || typeof data.description !== "string" || !data.description || !Array.isArray(data.events) || data.events.some((event: OrganizerEvent) => !Number.isInteger(event.id) || event.id < 1 || !["competition", "training"].includes(event.event_type) || !["published", "started", "completed"].includes(event.status) || typeof event.name !== "string" || typeof event.date !== "string" || typeof event.location !== "string")) throw new Error("Invalid organizer API response");
  return data;
});
