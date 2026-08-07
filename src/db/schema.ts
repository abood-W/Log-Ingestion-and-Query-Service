import {
  bigserial,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const logLevelEnum = pgEnum("log_level", [
  "info",
  "warn",
  "error",
  "debug",
]);
export const logs = pgTable(
  "logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),

    timestamp: timestamp("timestamp", {
      withTimezone: true,
      mode: "date",
    }).notNull(),

    level: logLevelEnum("level").notNull(),

    service: text("service").notNull(),

    message: text("message").notNull(),

    attributes: jsonb("attributes")
      .$type<Record<string, string | number | boolean>>()
      .notNull()
      .default({}),
  },
  (table) => [
    index("logs_timestamp_idx").on(table.timestamp),
    index("logs_service_idx").on(table.service),
    index("logs_level_idx").on(table.level),
    index("logs_service_timestamp_idx").on(table.service, table.timestamp),
    index("logs_level_timestamp_idx").on(table.level, table.timestamp),
  ],
);

export type Log = typeof logs.$inferSelect;
export type NewLog = typeof logs.$inferInsert;
