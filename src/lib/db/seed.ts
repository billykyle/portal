import { hash } from "bcryptjs";
import { db } from "./index";
import { clients, users } from "./schema";

/** Empty-database bootstrap only. No fake shoots — files come from NAS. */
export async function seedDemo() {
  const [client] = await db
    .insert(clients)
    .values({
      inviteCode: "BK00001",
      displayName: "Whitfield",
      primaryEmail: "whitfield@example.com",
      company: "Whitfield Homes",
      notes:
        "Invite is permanent and multi-use. Shoots appear when a matching folder exists on the NAS Client Deliverables share — this seed does not invent files.",
    })
    .returning();

  const passwordHash = await hash(process.env.DEMO_PASSWORD ?? "portal1234", 10);
  await db.insert(users).values({
    email: "demo@example.com",
    passwordHash,
    clientId: client.id,
  });
}
