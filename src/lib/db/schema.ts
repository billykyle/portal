import { bigint, integer, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const mediaTypeEnum = pgEnum("media_type", ["photo", "video", "floor_plan", "audio", "raw_video"]);

export const clientCategoryEnum = pgEnum("client_category", [
  "real_estate",
  "construction",
  "podcast",
  "other",
  "commercial",
]);

export const clients = pgTable("clients", {
  id: uuid("id").defaultRandom().primaryKey(),
  inviteCode: text("invite_code").notNull().unique(),
  displayName: text("display_name").notNull(),
  primaryEmail: text("primary_email").notNull(),
  company: text("company"),
  notes: text("notes"),
  category: clientCategoryEnum("category").notNull().default("other"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  phone: text("phone"),
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
  slug: text("slug").notNull(),
  nasRelativePath: text("nas_relative_path"),
  /** NAS category folder under the client, when the shoot is not at the client root. */
  categoryFolder: text("category_folder"),
  dropboxUrl: text("dropbox_url"),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Previous slugs for a shoot, so a renamed address still resolves. Unique per client. */
export const shootSlugAliases = pgTable(
  "shoot_slug_aliases",
  {
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    shootId: uuid("shoot_id")
      .notNull()
      .references(() => shoots.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.clientId, table.slug] })],
);

export const media = pgTable("media", {
  id: uuid("id").defaultRandom().primaryKey(),
  shootId: uuid("shoot_id")
    .notNull()
    .references(() => shoots.id, { onDelete: "cascade" }),
  type: mediaTypeEnum("type").notNull(),
  filename: text("filename").notNull(),
  url: text("url").notNull(),
  nasRelativePath: text("nas_relative_path"),
  width: integer("width"),
  height: integer("height"),
  byteSize: bigint("byte_size", { mode: "number" }),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const bookingStatusEnum = pgEnum("booking_status", ["requested", "confirmed", "cancelled", "queued"]);

export const bookings = pgTable("bookings", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  address: text("address").notNull(),
  service: text("service"),
  services: text("services").array(),
  commercialVideoHours: integer("commercial_video_hours"),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  status: bookingStatusEnum("status").notNull().default("confirmed"),
  notes: text("notes"),
  accessCodes: text("access_codes"),
  calendarEventId: text("calendar_event_id"),
  clientEmailMessageId: text("client_email_message_id"),
  clientEmailReferences: text("client_email_references"),
  clientEmailSubject: text("client_email_subject"),
  reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
  syncIssue: text("sync_issue"),
  driveSecondsFromPrior: integer("drive_seconds_from_prior"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** One saved notice. No row means nothing is scheduled. */
export const maintenanceNotices = pgTable("maintenance_notices", {
  id: text("id").primaryKey(),
  message: text("message").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** In-progress book/modify form. The id lives in an httpOnly cookie, not the URL. */
export const bookingDrafts = pgTable("booking_drafts", {
  id: text("id").primaryKey(),
  scope: text("scope").notNull(),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  address: text("address").notNull().default(""),
  placeId: text("place_id"),
  services: text("services").array(),
  commercialVideoHours: integer("commercial_video_hours"),
  notes: text("notes"),
  modifyBookingId: text("modify_booking_id"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
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
