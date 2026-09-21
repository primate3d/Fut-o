import { sql } from "drizzle-orm";
import { db } from "./db/index";
import { RequestError } from "./request-error";

export type DatabaseExecutor = Pick<typeof db, "select" | "insert" | "update" | "delete" | "execute">;

// Transaction-scoped locks are shared across processes and released on rollback/disconnect.
export async function withKeyLock<T>(
  resource: string,
  action: (tx: DatabaseExecutor) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    const rows = await tx.execute(sql`select pg_try_advisory_xact_lock(hashtextextended(${resource}, 0)) as acquired`);
    if (!rows[0]?.acquired) {
      throw new RequestError("Une operation est deja en cours. Veuillez patienter.", 409);
    }
    return action(tx);
  });
}
