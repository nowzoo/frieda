import type { Connection } from '@planetscale/database';
import type {
  RawSchema,
  RawTableColumnInfo,
  RawTableIndexInfo,
  RawTableInfo
} from './types.js';
import sql, { raw } from 'sql-template-tag';

export const fetchSchema = async (
  connection: Connection
): Promise<RawSchema> => {
  const {tableNames, databaseName} = await fetchTableNames(connection);
  const results = await Promise.all(
    tableNames.map((tableName) => fetchTableInfo(connection, tableName))
  );
  return {
    fetched: new Date(),
    databaseName,
    tableNames,
    tables: results
  };
};

const fetchTableNames = async (connection: Connection) => {
  const query = sql`SHOW FULL TABLES;`;
  const executedQuery = await connection.execute(query.sql);
  const nameKey = executedQuery.fields[0].name;
  const result: {databaseName: string, tableNames: string[]} = {
    databaseName: nameKey.replace(/^tables_in_/g, ''),
    tableNames: []
  }
  const rows: Record<string,string>[] = executedQuery.rows as Record<string,string>[];
  rows.forEach((row: Record<string,string>) => {
    const keys: (keyof typeof row)[] = Object.keys(row);
    const k0: keyof typeof row = keys[0];
    const k1: keyof typeof row = keys[1];
    // ignore views for now
    if (row[k1] !== 'BASE TABLE') {
      return;
    }
    const tableName: string = row[k0]
    result.tableNames.push(tableName)
  });
  return result;
};

const fetchTableCreateSql = async (
  connection: Connection,
  tableName: string
): Promise<string> => {
  const query = sql`SHOW CREATE TABLE ${raw(tableName)};`;
  const result = await connection.execute(query.sql);
  const row = result.rows[0] as { Table: string; 'Create Table': string };
  return row['Create Table'] + ';';
};

const fetchTableColumnsInfo = async (
  connection: Connection,
  tableName: string
): Promise<RawTableColumnInfo[]> => {
  const query = sql`SHOW FULL COLUMNS FROM ${raw(tableName)};`;
  const result = await connection.execute(query.sql);
  return result.rows as RawTableColumnInfo[];
};

const fetchTableIndexesInfo = async (
  connection: Connection,
  tableName: string
): Promise<RawTableIndexInfo[]> => {
  const query = sql`SHOW INDEXES FROM ${raw(tableName)};`;
  const result = await connection.execute(query.sql);
  return result.rows as RawTableIndexInfo[];
};

const fetchTableInfo = async (
  connection: Connection,
  tableName: string
): Promise<RawTableInfo> => {
  const [tableCreateStatement, columns, indexes] = await Promise.all([
    fetchTableCreateSql(connection, tableName),
    fetchTableColumnsInfo(connection, tableName),
    fetchTableIndexesInfo(connection, tableName)
  ]);
  return {
    name: tableName,
    tableCreateStatement,
    columns,
    indexes
  };
};


