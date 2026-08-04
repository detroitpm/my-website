// Shared Postgres connection to Supabase for the SOW builder's database
// functions (saved SOWs + rate table). A module-level singleton pool, since
// each function file requires this the same way and Node's module cache
// keeps it a true singleton within a warm Lambda container - avoids opening
// a fresh connection pool on every invocation.
const { Pool } = require("pg");

let pool;
function getPool() {
  if (!pool) {
    const connectionString = process.env.SUPABASE_DB_URL;
    if (!connectionString) {
      throw new Error("SUPABASE_DB_URL environment variable is not set");
    }
    pool = new Pool({
      connectionString: connectionString,
      // Supabase's pooler requires SSL; rejectUnauthorized:false is the
      // standard node-postgres workaround for hosted Postgres providers
      // whose cert chain isn't in Node's default trust store.
      ssl: { rejectUnauthorized: false }
    });
  }
  return pool;
}

module.exports = { getPool };
