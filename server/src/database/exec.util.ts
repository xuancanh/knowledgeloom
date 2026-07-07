/**
 * Execute a Drizzle write statement across both supported drivers.
 *
 * better-sqlite3 query builders are synchronous and run on `.run()`; the
 * node-postgres builders have no `.run()` and instead execute when awaited
 * (they are PromiseLike). Duck-typing on `.run` lets a single call site work
 * for both dialects, so per-scope repositories don't each need a
 * `if (dialect === 'postgres')` branch around every insert/update/delete.
 */
export async function runWrite(stmt: any): Promise<void> {
  if (stmt && typeof stmt.run === 'function') {
    stmt.run();
    return;
  }
  await stmt;
}

/**
 * Fetch a single row across both drivers. better-sqlite3 builders expose
 * `.get()`; node-postgres builders return an array when awaited, so take the
 * first element. Returns undefined when no row matches.
 */
export async function getOne<T = any>(stmt: any): Promise<T | undefined> {
  if (stmt && typeof stmt.get === 'function') {
    return stmt.get();
  }
  const rows = await stmt;
  return Array.isArray(rows) ? rows[0] : rows;
}
