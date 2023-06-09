import type {
  Connection,
  ExecutedQuery,
  Transaction
} from '@planetscale/database';
import type {
  CustomModelCast,
  DbExecuteError,
  DbLoggingOptions,
  FieldDefinition,
  ModelDefinition,
  ModelOrderByInput,
  ModelSelectColumnsInput,
  ModelWhereInput,
  OneBasedPagingInput,
  SchemaDefinition,
  SelectedModel
} from './types.js';
import sql, { join, empty, raw, type Sql } from 'sql-template-tag';
import { createCastFunction } from './create-cast-function.js';

import { bt, getLimitOffset, getOrderBy, getWhere } from './sql-utils.js';

export class ExecuteError extends Error implements DbExecuteError {
  constructor(public readonly originalError: unknown, public readonly query: Sql) {
    super(originalError instanceof Error ? originalError.message : 'unkown error')
  }
}

export class BaseDb {
  #connOrTx: Connection | Transaction;
  #schema: SchemaDefinition;
  #loggingOptions: DbLoggingOptions;
  constructor(
    conn: Connection | Transaction,
    schema: SchemaDefinition,
    loggingOptions: DbLoggingOptions = {}
  ) {
    this.#connOrTx = conn;
    this.#schema = schema;
    this.#loggingOptions = loggingOptions;
  }

  get connOrTx(): Connection | Transaction {
    return this.#connOrTx;
  }

  get schema(): SchemaDefinition {
    return this.#schema;
  }

  get loggingOptions(): DbLoggingOptions {
    return this.#loggingOptions;
  }

  get performanceLogger(): (
    executedQuery: ExecutedQuery,
    roundTripMs: number
  ) => void {
    return (
      this.loggingOptions.performanceLogger ||
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ((_e: ExecutedQuery, _t: number) => {
        /** noop */
      })
    );
  }

  get errorLogger(): (error: ExecuteError) => void {
    return (
      this.loggingOptions.errorLogger ||
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ((_e: ExecuteError) => {
        /** noop */
      })
    );
  }

  public async execute(
    query: Sql,
    customModelCast?: CustomModelCast<Record<string, unknown>>
  ): Promise<ExecutedQuery> {
    try {
      const start = Date.now();
      const result = await this.connOrTx.execute(query.sql, query.values, {
        as: 'object',
        cast: createCastFunction(this.schema.cast, customModelCast)
      });
      // noop by default, see getter
      this.performanceLogger(result, Date.now() - start);
      return result;
    } catch (error) {
      this.errorLogger(
        new ExecuteError(error, query)
      );
      throw new Error(`Internal server error.`);
    }
  }

  public async executeSelect<M extends Record<string, unknown>>(
    query: Sql,
    customModelCast?: CustomModelCast<M>
  ): Promise<{ executedQuery: ExecutedQuery; rows: M[] }> {
    const executedQuery = await this.execute(query, customModelCast);
    return { executedQuery, rows: executedQuery.rows as M[] };
  }

  public async executeSelectFirst<M extends Record<string, unknown>>(
    query: Sql,
    customModelCast?: CustomModelCast<M>
  ): Promise<M | null> {
    const { rows } = await this.executeSelect(query, customModelCast);
    return rows[0] || null;
  }
  public async executeSelectFirstOrThrow<M extends Record<string, unknown>>(
    query: Sql,
    customModelCast?: CustomModelCast<M>
  ): Promise<M> {
    const result = await this.executeSelectFirst(query, customModelCast);
    if (!result) {
      throw new Error('executeSelectFirstOrThrow failed to find a record.');
    }
    return result;
  }

  
}

export class ModelDb<
  M extends Record<string, unknown>,
  ModelSelectAll extends { [K in keyof M]?: M[K] },
  PrimaryKey extends { [K in keyof M]?: M[K] },
  CreateData extends { [K in keyof M]?: M[K] },
  UpdateData extends { [K in keyof M]?: M[K] },
  FindUniqueParams extends { [K in keyof M]?: M[K] }
> extends BaseDb {
  #model: ModelDefinition;
  constructor(
    modelName: string,
    conn: Connection | Transaction,
    schema: SchemaDefinition,
    loggingOptions: DbLoggingOptions = {}
  ) {
    super(conn, schema, loggingOptions);
    const model = schema.models.find((m) => m.modelName === modelName);
    if (!model) {
      throw new Error(`Model ${modelName} not found in schema.`);
    }
    this.#model = model;
  }

  get model(): ModelDefinition {
    return this.#model;
  }

  get tableName(): string {
    return this.model.tableName;
  }

  get fields(): FieldDefinition[] {
    return Object.values(this.model.fields);
  }

  get keys(): (keyof M & string)[] {
    return this.fields.map((f) => f.fieldName);
  }

  get primaryKeys(): (keyof M & string)[] {
    return this.fields.filter((f) => f.isPrimaryKey).map((f) => f.fieldName);
  }

  protected get jsonKeys(): (keyof M & string)[] {
    return this.fields
      .filter((f) => f.castType === 'json')
      .map((f) => f.fieldName);
  }

  protected get setKeys(): (keyof M & string)[] {
    return this.fields
      .filter((f) => f.castType === 'set')
      .map((f) => f.fieldName);
  }

  protected get autoIncrementingPrimaryKey(): (keyof M & string) | null {
    const field = this.fields.find((f) => f.isAutoIncrement);
    return field ? field.fieldName : null;
  }

  async findMany<S extends ModelSelectColumnsInput<M> = undefined>(input: {
    where?: ModelWhereInput<M>;
    paging?: OneBasedPagingInput;
    orderBy?: ModelOrderByInput<M>;
    select?: S;
  }): Promise<SelectedModel<M, S, ModelSelectAll>[]> {
    const where = getWhere(input.where, this.tableName);
    const orderBy = getOrderBy(input.orderBy, this.tableName);
    const limit = getLimitOffset(input.paging);
    const getSelectForFieldName = (fieldName: string): Sql => {
      const field = this.fields.find((f) => f.fieldName === fieldName);
      if (!field) {
        throw new Error(
          `Invalid select: the field named ${fieldName} does not exist.`
        );
      }
      return sql`${bt(this.tableName, field.columnName)} as ${bt(
        field.fieldName
      )}`;
    };
    const select =
      Array.isArray(input.select) && input.select.length > 0
        ? join(
            input.select.map((fieldName) => getSelectForFieldName(fieldName)),
            ','
          )
        : 'all' === input.select
        ? join(
            this.keys.map((fieldName) => getSelectForFieldName(fieldName)),
            ','
          )
        : raw('*');
    const query = sql`
        SELECT 
        ${select} 
        FROM 
        ${bt(this.tableName)} 
        ${where} 
        ${orderBy} 
        ${limit}`;
    const { rows } = await this.executeSelect<
      SelectedModel<M, S, ModelSelectAll>
    >(query);
    return rows;
  }

  async findFirst<S extends ModelSelectColumnsInput<M> = undefined>(input: {
    where: Partial<M> | Sql;
    orderBy?: ModelOrderByInput<M> | Sql;
    select?: S;
  }): Promise<SelectedModel<M, S, ModelSelectAll> | null> {
    const rows = await this.findMany({
      ...input,
      paging: { page: 1, rpp: 1 }
    });
    return rows[0] || null;
  }

  async findFirstOrThrow<
    S extends ModelSelectColumnsInput<M> = undefined
  >(input: {
    where: Partial<M> | Sql;
    orderBy?: ModelOrderByInput<M>;
    select?: S;
  }): Promise<SelectedModel<M, S, ModelSelectAll>> {
    const result = await this.findFirst(input);
    if (!result) {
      throw new Error('findFirstOrThrow failed to find a record.');
    }
    return result;
  }
  async findUnique<S extends ModelSelectColumnsInput<M> = undefined>(input: {
    where: FindUniqueParams;
    select?: S;
  }): Promise<SelectedModel<M, S, ModelSelectAll> | null> {
    return await this.findFirst(input);
  }
  async findUniqueOrThrow<
    S extends ModelSelectColumnsInput<M> = undefined
  >(input: {
    where: FindUniqueParams;
    select?: S;
  }): Promise<SelectedModel<M, S, ModelSelectAll>> {
    return await this.findFirstOrThrow(input);
  }
  async countBigInt(input: { where: ModelWhereInput<M> }): Promise<bigint> {
    const where = getWhere(input.where, this.tableName);
    const query = sql`SELECT COUNT(*) AS \`ct\` FROM ${bt(
      this.tableName
    )} ${where}`;
    const result = await this.executeSelect<{ ct: bigint }>(query, {
      ct: 'bigint'
    });
    return result.rows[0] ? result.rows[0].ct : 0n;
  }
  async count(input: { where: ModelWhereInput<M> }): Promise<number> {
    const ct = await this.countBigInt(input);
    if (ct > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(
        'count returned a number greater than Number.MAX_SAFE_INTEGER'
      );
    }
    return Number(ct);
  }

  async create(input: { data: CreateData }): Promise<PrimaryKey> {
    const names: Sql[] = [];
    const insertValues: Sql[] = [];
    const data: Partial<M> = input.data || {};
    const keys = Object.keys(data);
    keys.forEach((k) => {
      names.push(bt(this.tableName, k));
      if (data[k] === null) {
        insertValues.push(raw('NULL'));
      } else {
        if (this.jsonKeys.includes(k)) {
          insertValues.push(sql`${JSON.stringify(data[k])}`);
        } else if (this.setKeys.includes(k) && data[k] instanceof Set) {
          const stringValue: string = Array.from(
            (data[k] as Set<string>).values()
          ).join(',');
          insertValues.push(sql`${stringValue}`);
        } else {
          insertValues.push(sql`${data[k]}`);
        }
      }
    });
    const namesSql = names.length > 0 ? join(names) : empty;
    const valuseSql = insertValues.length > 0 ? join(insertValues) : empty;
    const query = sql`INSERT INTO ${bt(
      this.tableName
    )} (${namesSql}) VALUES (${valuseSql})`;
    const executedQuery = await this.execute(query);
    const autoGeneratedPrimaryKey = this.autoIncrementingPrimaryKey;
    let primaryKey: PrimaryKey;
    if (autoGeneratedPrimaryKey) {
      primaryKey = {
        [autoGeneratedPrimaryKey]: executedQuery.insertId as string
      } as PrimaryKey;
    } else {
      primaryKey = this.primaryKeys.reduce((acc, k) => {
        return { ...acc, [k]: input.data[k] };
      }, {}) as PrimaryKey;
    }
    return primaryKey;
  }

  async updateWhere(input: {
    data: UpdateData;
    where: ModelWhereInput<M> | Sql;
  }): Promise<ExecutedQuery> {
    const keys = Object.keys(input.data);
    const updates: Sql[] = keys.map((k) => {
      if (input.data[k] === null) {
        return sql`${bt(this.tableName, k)} = NULL`;
      } else if (this.jsonKeys.includes(k)) {
        return sql`${bt(this.tableName, k)} = ${JSON.stringify(input.data[k])}`;
      } else if (this.setKeys.includes(k) && input.data[k] instanceof Set) {
        const stringValue: string = Array.from(
          (input.data[k] as Set<string>).values()
        ).join(',');
        return sql`${bt(this.tableName, k)} = ${stringValue}`;
      } else {
        return sql`${bt(this.tableName, k)} = ${input.data[k]}`;
      }
    });
    const updateSql = join(updates);
    const where = getWhere(input.where, this.tableName);
    const query = sql`UPDATE ${bt(this.tableName)} SET ${updateSql} ${where}`;
    return await this.execute(query);
  }

  async update(input: {
    data: UpdateData;
    where: PrimaryKey;
  }): Promise<ExecutedQuery> {
    return await this.updateWhere(input);
  }

  async deleteWhere(input: {
    where: ModelWhereInput<M> | Sql;
  }): Promise<ExecutedQuery> {
    const where = getWhere(input.where, this.tableName);
    const query = sql`DELETE FROM ${bt(this.tableName)} ${where}`;
    return await this.execute(query);
  }

  async delete(input: { where: PrimaryKey }): Promise<ExecutedQuery> {
    return this.deleteWhere(input);
  }
}
