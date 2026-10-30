import { desc } from "drizzle-orm";
import { connection } from "next/server";

import { db } from "@/db";
import { post } from "@/db/schema";

export async function listPosts() {
  await connection();
  return db.select().from(post).orderBy(desc(post.createdAt));
}
