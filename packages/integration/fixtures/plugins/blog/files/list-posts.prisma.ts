import { connection } from "next/server";

import { prisma } from "@/lib/prisma";

export async function listPosts() {
  await connection();
  return prisma.post.findMany({ orderBy: { createdAt: "desc" } });
}
