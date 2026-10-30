import { prisma } from "@/lib/prisma";

export async function checkDatabase() {
  await prisma.$queryRaw`SELECT 1`;
}
