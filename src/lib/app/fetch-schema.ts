import type { Connection } from '@planetscale/database';
import type {
  ColumnRow,
  CreateTableRow,
  FetchTableNamesResult,
  FetchedSchema,
  FetchedTable,
  IndexRow
} from './types.js';
import sql from 'sql-template-tag';
import { bt } from '../api/sql-utils.js';
import ora from 'ora';

export const fetchCreateTableSql = async (
  connection: Connection,
  tableName: string
): Promise<string> => {
  const query = sql`SHOW CREATE TABLE ${bt(tableName)};`;
  const result = await connection.execute(query.sql);
  return (result.rows[0] as CreateTableRow)['Create Table'];
};

export const fetchTableColumns = async (
  connection: Connection,
  tableName: string
): Promise<ColumnRow[]> => {
  const query = sql`SHOW FULL COLUMNS FROM ${bt(tableName)};`;
  const result = await connection.execute(query.sql);
  return result.rows as ColumnRow[];
};

export const fetchTableIndexes = async (
  connection: Connection,
  tableName: string
): Promise<IndexRow[]> => {
  const query = sql`SHOW INDEXES FROM ${bt(tableName)};`;
  const result = await connection.execute(query.sql);
  return result.rows as IndexRow[];
};

export const fetchTableNames = async (
  connection: Connection
): Promise<FetchTableNamesResult> => {
  const query = sql`SHOW FULL TABLES;`;
  const executedQuery = await connection.execute(query.sql);
  const nameKey = executedQuery.fields[0].name;
  const result: FetchTableNamesResult = {
    databaseName: nameKey.replace(/^tables_in_/gi, ''),
    tableNames: []
  };
  const rows = executedQuery.rows as Record<string, string>[];
  rows.forEach((row: Record<string, string>) => {
    const keys: (keyof typeof row)[] = Object.keys(row);
    const k0: keyof typeof row = keys[0];
    const k1: keyof typeof row = keys[1];
    // ignore views for now
    if (row[k1] !== 'BASE TABLE') {
      return;
    }
    const tableName: string = row[k0];
    result.tableNames.push(tableName);
  });

  return result;
};

export const fetchTable = async (
  connection: Connection,
  tableName: string
): Promise<FetchedTable> => {
  const results: [ColumnRow[], IndexRow[], string] = await Promise.all([
    fetchTableColumns(connection, tableName),
    fetchTableIndexes(connection, tableName),
    fetchCreateTableSql(connection, tableName)
  ]);
  return {
    name: tableName,
    columns: results[0],
    indexes: results[1],
    createSql: results[2]
  };
};

export const fetchSchema = async (
  connection: Connection
): Promise<FetchedSchema> => {
  const spinner = ora('Fetching schema...').start();
  const { databaseName, tableNames } = await fetchTableNames(connection);
  const tables = await Promise.all(
    tableNames.map((t) => fetchTable(connection, t))
  );
  spinner.succeed('Schema fetched.');
  const fetchedSchema = {
    fetched: new Date(),
    databaseName,
    tables
  };

  return fetchedSchema;
};
