import { connection } from "next/server";

type Check = [name: string, run: () => Promise<unknown>];

const checks: Check[] = [];

export async function GET() {
  await connection();
  const results = await Promise.allSettled(checks.map(([, run]) => run()));
  const failing = checks
    .filter((_, index) => results[index]?.status === "rejected")
    .map(([name]) => name);
  const isHealthy = failing.length === 0;
  return Response.json(
    { status: isHealthy ? "ok" : "failing", failing },
    { status: isHealthy ? 200 : 503 },
  );
}
