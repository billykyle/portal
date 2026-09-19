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

export const bookingStatusEnum = pgEnum("booking_status", ["requested", "confirmed", "cancelled"]);

export const bookings = pgTable("bookings", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  address: text("address").notNull(),
  service: text("service"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  status: bookingStatusEnum("status").notNull().default("confirmed"),
  notes: text("notes"),
  accessCodes: text("access_codes"),
  calendarEventId: text("calendar_event_id"),
  driveSecondsFromPrior: integer("drive_seconds_from_prior"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const zipJobs = pgTable("zip_jobs", {
  id: text("id").primaryKey(),
  shootId: uuid("shoot_id")
    .notNull()
    .references(() => shoots.id, { onDelete: "cascade" }),
  state: text("state").notNull(),
  filesDone: integer("files_done").notNull().default(0),
  filesTotal: integer("files_total").notNull().default(0),
  bytes: integer("bytes").notNull().default(0),
  filename: text("filename").notNull(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Client = typeof clients.$inferSelect;
export type User = typeof users.$inferSelect;
export type Shoot = typeof shoots.$inferSelect;
export type Media = typeof media.$inferSelect;
export type MediaType = (typeof mediaTypeEnum.enumValues)[number];
export type ZipJob = typeof zipJobs.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type BookingStatus = (typeof bookingStatusEnum.enumValues)[number];
