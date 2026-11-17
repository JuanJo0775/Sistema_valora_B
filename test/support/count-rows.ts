import { sql } from 'drizzle-orm';
import type { Database } from '../../src/shared/database/database.module';

// Total de filas en todas las tablas de la aplicación (sin las de PostgreSQL y PostGIS). Sirve para
// probar que una consulta no guarda nada, por ejemplo la ubicación del usuario (EC-08).
export async function countAllRows(db: Database): Promise<number> {
  const tables = await db.execute<{ name: string }>(
    sql`select format('%I.%I', table_schema, table_name) as name from information_schema.tables
        where table_type = 'BASE TABLE'
          and table_schema not in ('pg_catalog', 'information_schema', 'public', 'topology')`,
  );
  let total = 0;
  for (const { name } of tables.rows) {
    const result = await db.execute<{ count: string }>(
      sql.raw(`select count(*) as count from ${name}`),
    );
    total += Number(result.rows[0]?.count ?? 0);
  }
  return total;
}
