import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const post = pgTable("post", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
