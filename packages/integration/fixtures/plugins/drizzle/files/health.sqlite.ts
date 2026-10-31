import { sql } from "drizzle-orm";

import { db } from "@/db";

export async function checkDatabase() {
  await db.run(sql`select 1`);
}
