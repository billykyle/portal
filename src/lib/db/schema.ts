import { integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const mediaTypeEnum = pgEnum("media_type", ["photo", "video", "floor_plan"]);

export const clients = pgTable("clients", {
  id: uuid("id").defaultRandom().primaryKey(),
  inviteCode: text("invite_code").notNull().unique(),
  displayName: text("display_name").notNull(),
  primaryEmail: text("primary_email").notNull(),
  company: text("company"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const shoots = pgTable("shoots", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  publicToken: text("public_token").notNull().unique(),
  shotDate: text("shot_date").notNull(),
  address: text("address").notNull(),
  nasRelativePath: text("nas_relative_path"),
  dropboxUrl: text("dropbox_url"),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const media = pgTable("media", {
  id: uuid("id").defaultRandom().primaryKey(),
  shootId: uuid("shoot_id")
    .notNull()
    .references(() => shoots.id, { onDelete: "cascade" }),
  type: mediaTypeEnum("type").notNull(),
  filename: text("filename").notNull(),
  url: text("url").notNull(),
  nasRelativePath: text("nas_relative_path"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export type Client = typeof clients.$inferSelect;
export type User = typeof users.$inferSelect;
export type Shoot = typeof shoots.$inferSelect;
export type Media = typeof media.$inferSelect;
export type MediaType = (typeof mediaTypeEnum.enumValues)[number];
