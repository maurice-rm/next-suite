import { drizzle } from "drizzle-orm/libsql";

import * as schema from "@/db/schema";

const url = process.env.DATABASE_URL!;

export const db = drizzle(url, { schema });
