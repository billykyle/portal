import { publicShootUrl } from "./public-link";

export type DeliveryEvent = "shoot.ready" | "shoot.delivered";

export type DeliveryPayload = {
  event: DeliveryEvent;
  client: {
    id: string;
    displayName: string;
    inviteCode: string;
    primaryEmail: string;
  };
  shoot: {
    id: string;
    shotDate: string;
    address: string;
    publicUrl: string;
    fileCount: number;
  };
};

export function buildDeliveryPayload(input: {
  event: DeliveryEvent;
  client: { id: string; displayName: string; inviteCode: string; primaryEmail: string };
  shoot: { id: string; shotDate: string; address: string; publicToken: string };
  fileCount: number;
}): DeliveryPayload {
  return {
    event: input.event,
    client: input.client,
    shoot: {
      id: input.shoot.id,
      shotDate: input.shoot.shotDate,
      address: input.shoot.address,
      publicUrl: publicShootUrl(input.shoot.publicToken),
      fileCount: input.fileCount,
    },
  };
}

/** Optional Pepper / automation hook. No email is sent from the portal. */
export async function notifyDeliveryWebhook(payload: DeliveryPayload) {
  const url = process.env.DELIVERY_WEBHOOK_URL?.trim();
  if (!url) return { posted: false as const };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Delivery webhook ${res.status}`);
    }
    return { posted: true as const };
  } finally {
    clearTimeout(timer);
  }
}
