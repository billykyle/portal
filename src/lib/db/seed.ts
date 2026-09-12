import { hash } from "bcryptjs";
import { createPublicToken } from "../public-link";
import { mapleMedia, west12Media } from "../sample-media";
import { db } from "./index";
import { clients, media, shoots, users } from "./schema";

export async function seedDemo() {
  const [client] = await db
    .insert(clients)
    .values({
      inviteCode: "BK00001",
      displayName: "Whitfield",
      primaryEmail: "whitfield@example.com",
      company: "Whitfield Homes",
      notes: "Demo client. Invite is permanent and multi-use — teammates redeem BK00001 and each get their own login.",
    })
    .returning();

  const passwordHash = await hash(process.env.DEMO_PASSWORD ?? "portal1234", 10);
  await db.insert(users).values({
    email: "demo@example.com",
    passwordHash,
    clientId: client.id,
  });

  const [maple] = await db
    .insert(shoots)
    .values({
      clientId: client.id,
      shotDate: "2026-09-04",
      address: "1847 Maple Avenue, Austin, TX",
      publicToken: createPublicToken(),
      nasRelativePath: "Whitfield/2026-09-04 - 1847 Maple Avenue, Austin, TX",
      dropboxUrl: "https://www.dropbox.com/scl/fo/demo-maple-avenue/placeholder?rlkey=demo&dl=0",
    })
    .returning();

  const [west12] = await db
    .insert(shoots)
    .values({
      clientId: client.id,
      shotDate: "2026-03-18",
      address: "412 West 12th Street, Unit 6B, Austin, TX",
      publicToken: createPublicToken(),
      nasRelativePath: "Whitfield/2026-03-18 - 412 West 12th Street, Unit 6B, Austin, TX",
      dropboxUrl: "https://www.dropbox.com/scl/fo/demo-west-12th/placeholder?rlkey=demo&dl=0",
    })
    .returning();

  await db.insert(media).values([
    ...mapleMedia.map((item) => ({ ...item, shootId: maple.id })),
    ...west12Media.map((item) => ({ ...item, shootId: west12.id })),
  ]);
}
