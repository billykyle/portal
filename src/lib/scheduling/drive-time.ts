import { mapsApiKey } from "./config";

/**
 * Live drive time (seconds) between two addresses.
 * Returns null when Maps is not configured, the API errors, or the pair
 * cannot be routed. Callers must refuse the slot — never invent a duration.
 */
export async function measureDriveSeconds(
  fromAddress: string,
  toAddress: string,
  departAt: Date,
): Promise<number | null> {
  const key = mapsApiKey();
  if (!key) return null;

  const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
  url.searchParams.set("origins", fromAddress);
  url.searchParams.set("destinations", toAddress);
  url.searchParams.set("mode", "driving");
  url.searchParams.set("key", key);
  const departure = Math.floor(Math.max(departAt.getTime(), Date.now()) / 1000);
  url.searchParams.set("departure_time", String(departure));

  const res = await fetch(url);
  if (!res.ok) return null;
  const body = (await res.json()) as {
    status?: string;
    rows?: Array<{
      elements?: Array<{
        status?: string;
        duration?: { value?: number };
        duration_in_traffic?: { value?: number };
      }>;
    }>;
  };
  if (body.status !== "OK") return null;
  const element = body.rows?.[0]?.elements?.[0];
  if (!element || element.status !== "OK") return null;
  const seconds = element.duration_in_traffic?.value ?? element.duration?.value;
  return typeof seconds === "number" && seconds >= 0 ? seconds : null;
}
