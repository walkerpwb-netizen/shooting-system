import "server-only";

import { cache } from "react";

import { apiUrl } from "./api";

const API_TIMEOUT_MS = 5_000;

// Share the result (including failures) between metadata and the page within
// one render, without caching a missing record or an outage across requests.
const fetchPublicEvent = cache(async (collection: "competitions" | "trainings", id: string) => {
  // Event primary keys are positive PostgreSQL integers. Reject malformed and
  // out-of-range paths before they can become backend validation/database errors.
  if (!/^[1-9]\d*$/.test(id) || Number(id) > 2_147_483_647) {
    return null;
  }

  const signal = AbortSignal.timeout(API_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(apiUrl(`/${collection}/${id}`), {
      cache: "no-store",
      signal,
    });
  } catch (cause) {
    throw new Error(`Public event API ${signal.aborted ? "timeout" : "connection failure"}: ${collection}/${id}`, { cause });
  }

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Public event API HTTP ${response.status}: ${collection}/${id}`);
  }

  // Read the body within the timeout too. Invalid JSON is an API failure,
  // never evidence that a record does not exist.
  let event: unknown;
  try {
    event = await response.json();
  } catch (cause) {
    throw new Error(`Public event API ${signal.aborted ? "timeout" : "invalid response"}: ${collection}/${id}`, { cause });
  }

  if (!event || typeof event !== "object" || !("id" in event) || event.id !== Number(id)) {
    throw new Error(`Public event API invalid response: ${collection}/${id}`);
  }

  return event;
});

export async function getPublicEvent<T>(collection: "competitions" | "trainings", id: string): Promise<T | null> {
  return fetchPublicEvent(collection, id) as Promise<T | null>;
}
