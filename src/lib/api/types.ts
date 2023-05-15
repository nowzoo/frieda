import type { Sql } from 'sql-template-tag';
import type { ExecutedQuery } from '@planetscale/database';
// https://www.typescriptlang.org/play?#code/C4TwDgpgBAsg9gEwgGygXigJQgYzgJwQB4BnYfASwDsBzAGigFcqBrKuAdyoD4BuAKH6hIsRCgDKKXMApwqRGFAgAPYBCoISopMm7ooAChYQQcAGawAlAG0AulAA+TDRDPUICAUPDQAospxkRiQEADF8OABbSWRpAEFkZAUlVXVNbRQ9DCMTc1goADIoMkpaG1tBYWgY6Q9QihRNIn4ofJU1DS14HToWqF8UjvT-QOC6iOipHGAEpJhuXtbxQbSusWQa6dl5ef1mJDcqD34sqGX21cNjUwsYcqgAfigAbyhrAGkoajPrKkZIgBGEHwtlsAC5YB97ABfKAQgDykQowAUDF8v3+QJBei8VSgABUIGR9M8+gBDCElag0AStAGU8jU2lQHAQv6A4HMhAQgAiZLUAmhuJ8ZymagQhOJGE24vqjRIRElwAY1gA5GTVQxVQhVbY+PwgA
/**
 * The base type for models
 */
export type Model = Record<string, unknown>;

/**
 * The database types we handle typing for. Other types are allowed,
 * but they will be typed as javascript string.
 */
export const MYSQL_TYPES = [
  'bigint',
  'tinyint',
  'bool',
  'boolean',
  'smallint',
  'mediumint',
  'int',
  'integer',
  'float',
  'double',
  'real',
  'decimal',
  'numeric',
  'bit',
  'datetime',
  'timestamp',
  'date',
  'year',
  'time',
  'json',
  'enum',
  'set',
  'char',
  'binary',
  'varchar',
  'varbinary',
  'tinyblob',
  'tinytext',
  'blob',
  'text',
  'mediumblob',
  'mediumtext',
  'longblob',
  'longtext'
] as const;
export type MysqlBaseType = (typeof MYSQL_TYPES)[number];

/**
 * A simplified set of casting rules. We infer this for each schema field from:
 * - the database column type,
 * - optional type annotations in the column definition COMMENT
 * - global settings in .friedarc
 *
 * In addition, this is used to provide one-off cast overrides to db.executeSelect
 * in the case where columns returned from a query do not map to the schema.
 */
export const CAST_TYPES = [
  'string',
  'bigint',
  'int',
  'float',
  'json',
  'date',
  'boolean',
  'set',
  'enum'
] as const;
export type CastType = (typeof CAST_TYPES)[number];

/**
 * A row from a `SHOW FULL COLUMNS FROM TableName` query.
 * see https://dev.mysql.com/doc/refman/8.0/en/show-columns.html
 */
export type Column = {
  Field: string;
  Type: string;
  Null: 'YES' | 'NO';
  Collation: string | null;
  Key: string;
  Default: string | null;
  Extra: string;
  Comment: string;
  Privileges: string;
};

/**
 * A row from `SHOW INDEXES FROM FROM TableName`
 */
export type Index = {
  Table: string;
  Non_unique: number;
  Key_name: string;
  Seq_in_index: number;
  Column_name: string | null;
  Collation: string | null;
  Cardinality: string;
  Sub_part: string | null;
  Packed: string | null;
  Null: string;
  Index_type: string;
  Comment: string;
  Index_comment: string;
  Visible: string;
  Expression: string | null;
};

export type Table = {
  name: string;
  columns: Column[];
  indexes: Index[];
};

export type FieldDefinition = {
  fieldName: string;
  columnName: string;
  isPrimaryKey: boolean;
  isAutoIncrement: boolean;
  castType: CastType;
};

export type ModelDefinition = {
  modelName: string;
  tableName: string;
  fields: FieldDefinition[];
};

export type Schema = {
  databaseName: string;
  models: ModelDefinition[];
  cast: SchemaCastMap;
  typeOptions: TypeOptions;
};

export type CustomModelCast<M extends Model> = {
  [K in keyof M]?: CastType;
};
export type SchemaCastMap = {
  [orgTableOrgCol: string]: CastType;
};

export type TypeOptions = {
  typeTinyIntOneAsBoolean: boolean;
  typeBigIntAsString: boolean;
  typeImports: string[];
};

export type DbLoggingOptions = {
  performanceLogger?: (
    executedQuery: ExecutedQuery,
    roundTripMs: number
  ) => void;
  errorLogger?: (error: Error) => void;
};

export type ModelSelectColumnsInput<M extends Model> =
  | (keyof M & string)[]
  | undefined;

export type SelectedModel<
  M extends Model,
  ExcludedBySelectAll extends (keyof M)[],
  S extends ModelSelectColumnsInput<M>
> = S extends (keyof M)[]
  ? { [K in S[number]]: M[K] }
  : Omit<M, ExcludedBySelectAll[number]>;

export type ModelWhereInput<M extends Model> = Partial<M> | Sql | undefined;

export type ModelOrderByInput<M extends Model> =
  | {
      col: keyof M & string;
      dir: 'asc' | 'desc';
    }
  | {
      col: keyof M & string;
      dir: 'asc' | 'desc';
    }[]
  | Sql
  | undefined;

export type OneBasedPagingInput =
  | {
      page: number;
      rpp: number;
    }
  | undefined;

