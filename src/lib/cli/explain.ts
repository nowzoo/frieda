import type { FetchedSchema, FetchedTable } from '$lib/fetch/types.js';
import type { FsPaths } from '$lib/fs/types.js';
import {
  getCastType,
  getFieldName,
  getJavascriptType,
  getValidJsonAnnotation,
  getMysqlBaseType,
  isTinyIntOne,
  getBigIntAnnotation,
  getValidEnumAnnotation,
  getSetAnnotation,
  isNullable,
  isUnique,
  getModelFieldPresence,
  getCreateModelFieldPresence,
  getUpdateModelFieldPresence
} from '$lib/parse/field-parsers.js';
import {
  getModelCreateDataTypeName,
  getModelFindUniqueParamsTypeName,
  getModelName,
  getModelPrimaryKeyTypeName,
  getModelUpdateDataTypeName
} from '$lib/parse/model-parsers.js';
import kleur from 'kleur';
import type { Column, Table } from '../api/types.js';
import { fmtVal, fmtVarName, getStdOutCols } from './ui/formatters.js';
import log from './ui/log.js';
import { DEFAULT_JSON_FIELD_TYPE } from '$lib/constants.js';
import { prompt } from './ui/prompt.js';
import { dirname, basename } from 'node:path';
import type { DatabaseUrlResult, ResolvedCliOptions } from './types.js';
import { format } from 'prettier';
import {
  CreateModelFieldPresence,
  ModelFieldPresence,
  UpdateModelFieldPresence
} from '$lib/parse/types.js';
import { getModelTypeDeclarations } from '$lib/generate/get-model-type-declarations.js';
type ModelNextStep =
  | 'fieldTypes'
  | 'createTable'
  | 'modelTypes'
  | 'showAnotherModel'
  | 'back';
export class Explainer {
  private modelNextStep: ModelNextStep | null = null;
  constructor(
    public schema: FetchedSchema,
    public options: ResolvedCliOptions,
    public databaseUrlResult: DatabaseUrlResult
  ) {}

  async explain(): Promise<void> {
    console.log();
    return await this.promptNextStep();
  }
  async promptNextStep(): Promise<void> {
    const nextStep = await prompt<'done' | 'models' | 'typeOptions' | 'quick'>({
      type: 'select',
      name: 'next',
      message: 'Show',
      choices: [
        { title: 'Explore models', value: 'models' },
        { title: 'Show type options', value: 'typeOptions' },
        { title: 'Show quick start', value: 'quick' },
        { title: 'Exit →', value: 'done' }
      ]
    });
    console.log();
    switch (nextStep) {
      case 'models':
        return await this.promptModel();
      case 'typeOptions':
        return await this.typeOptionsScreen();
      case 'quick':
        return await this.quickStartScreen();
    }
  }
  async promptModel(search = ''): Promise<void> {
    type Choice = {
      title: string;
      value: Table;
    };
    const choices: Choice[] = this.schema.tables.map((t) => {
      return {
        title: getModelName(t),
        value: t
      };
    });

    const suggest = (inp: string, choices: Choice[]) => {
      return choices.filter(
        (c) =>
          c.title.toLowerCase().startsWith(inp.toLowerCase()) ||
          c.value.name.toLowerCase().startsWith(inp.toLowerCase())
      );
    };
    const initialChoice = suggest(search, choices)[0] || choices[0];
    const table: FetchedTable = await prompt<FetchedTable>({
      type: 'autocomplete',
      name: 'model',
      message: 'Model',
      initial: initialChoice.title,
      choices,
      limit: 5,
      suggest: async (inp: string, choices) => {
        return suggest(inp, choices as Choice[]);
      }
    });
    console.log();
    this.modelNextStep = 'fieldTypes';
    this.showModelFieldTypes(table);
    console.log();
    return await this.promptModelScreen(table);
  }

  explainJsType(column: Column): string {
    const mysqlType = getMysqlBaseType(column);
    if (!mysqlType) {
      return `Unhandled column type ${
        column.Type
      }. Typed and cast as javascript ${fmtVal('string')}.`;
    }
    if ('json' === mysqlType) {
      const annotation = getValidJsonAnnotation(column);
      if (!annotation) {
        return `No ${kleur.red(
          '@json'
        )} type annotation. Using default JSON type: ${fmtVal(
          DEFAULT_JSON_FIELD_TYPE
        )}.`;
      }
      return `Using type from the ${kleur.red('@json')} type annotation.`;
    }
    if (isTinyIntOne(column)) {
      return `${fmtVarName('typeTinyIntOneAsBoolean')}: ${fmtVal(
        JSON.stringify(this.options.typeTinyIntOneAsBoolean)
      )}`;
    }
    if ('bigint' === mysqlType) {
      if (!this.options.typeBigIntAsString) {
        return `${fmtVarName('typeBigIntAsString')}: ${fmtVal(
          JSON.stringify(this.options.typeBigIntAsString)
        )}`;
      }
      if (getBigIntAnnotation(column)) {
        return `Found  ${kleur.red(
          '@bigint'
        )} type annotation. Overrides ${fmtVarName(
          'typeBigIntAsString'
        )}: ${fmtVal(JSON.stringify(this.options.typeBigIntAsString))}`;
      }
      return `${fmtVarName('typeBigIntAsString')}: ${fmtVal(
        JSON.stringify(this.options.typeBigIntAsString)
      )}`;
    }
    if ('enum' === mysqlType) {
      const annotation = getValidEnumAnnotation(column);
      if (annotation) {
        return `Using type from the ${kleur.red('@enum')} type annotation.`;
      }
      return `Using the column's enum definition.`;
    }

    if ('set' === mysqlType) {
      const annotation = getSetAnnotation(column);
      if (annotation) {
        if (annotation.argument && annotation.argument.trim().length > 0) {
          return `Using type from the ${kleur.red('@set')} type annotation.`;
        }
        return `Using the ${kleur.red('@set')} type annotation.`;
      }
    }

    return `Default type for ${fmtVal(mysqlType)} columns.`;
  }

  async promptModelScreen(table: FetchedTable): Promise<void> {
    const choices: { title: string; value: ModelNextStep }[] = [
      {
        title: `Field Types`,
        value: 'fieldTypes'
      },

      {
        title: `Model Types`,
        value: 'modelTypes'
      },
     
      {
        title: `CREATE TABLE`,
        value: 'createTable'
      },
      {
        title: `↑ Choose a different model`,
        value: 'showAnotherModel'
      },
     

      {
        title: `← Back`,
        value: 'back'
      }
    ];
    const initial = Math.max(choices.findIndex(c => c.value === this.modelNextStep), 0);

    this.modelNextStep = await prompt<ModelNextStep>({
      type: 'select',
      name: 'next',
      message: `Model: ${fmtVarName(getModelName(table))} | Show:`,
      choices,
      initial
    });
    console.log();
    switch (this.modelNextStep) {
      case 'fieldTypes':
        this.showModelFieldTypes(table);
        console.log();
        return await this.promptModelScreen(table);
      case 'modelTypes':
        this.showModelTypes(table);
        console.log();
        return await this.promptModelScreen(table);
      case 'createTable':
        this.showModelCreateSql(table);
        console.log();
        return await this.promptModelScreen(table);
      case 'showAnotherModel':
        return await this.promptModel(table.name);
      case 'back':
        return await this.promptNextStep();
    }
  }

  showModelFieldTypes(table: FetchedTable) {
    log.header(`Field Types | Model: ${getModelName(table)}`);
    log.info(kleur.bold(`Fields (${table.columns.length})`));
    log.table(
      [
        ...table.columns.map((c) => [
          fmtVarName(getFieldName(c)),
          fmtVal(
            getJavascriptType(c, this.options) + (isNullable(c) ? '|null' : '')
          ),
          kleur.dim(getCastType(c, this.options)),
          kleur.dim(c.Type)
        ])
      ],
      ['Field', 'Javascript Type', 'Cast', 'Column Type']
    );

    console.log();
    log.info([kleur.bold(`Field Type Notes`)]);
    log.table(
      [
        ...table.columns.map((c) => [
          fmtVarName(getFieldName(c)),
          fmtVal(getJavascriptType(c, this.options)),
          this.explainJsType(c)
        ])
      ],
      ['Field', 'Type', 'Note']
    );
    log.footer();
  }

  showModelTypes(table: FetchedTable) {
    log.header(`Model Types | Model: ${getModelName(table)}`);
    this.showModelBaseType(table)
    console.log();
    this.showModelPrimaryKeyType(table)
    console.log();
    this.showModelCreateDataType(table)
    console.log();
    this.showModelUpdateDataType(table)
    console.log();
    this.showModelFindUniqueType(table);
    log.footer()
  }

  showModelBaseType(table: FetchedTable) {
    const typeDecls = getModelTypeDeclarations(table, this.options);
    const notes = table.columns
      .filter(
        (c) =>
          getModelFieldPresence(c) === ModelFieldPresence.undefinedForSelectAll
      )
      .map((c) => {
        return `- ${fmtVarName(getFieldName(c))} will be ${fmtVal(
          'undefined'
        )} in ${fmtVal(getModelName(table))} using ${kleur.red(
          'SELECT *'
        )}. ${kleur.dim('(Column is INVISIBLE.)')}`;
      });
    if (notes.length > 0) {
      notes.unshift(kleur.italic('Notes:'));
    }
    const code = format(typeDecls.model, {
      filepath: 'x.ts',
      useTabs: false,
      printWidth: getStdOutCols() - 4
    })
      .trim()
      .split('\n')
      .map((s) => kleur.red(s));
    log.info([
      kleur.bold('Model Type:') + ' ' + fmtVal(getModelName(table)),
      ...code,
      ...notes
    ]);
  }

  showModelPrimaryKeyType(table: FetchedTable) {
    const typeDecls = getModelTypeDeclarations(table, this.options);

    const primaryKeyCode = format(typeDecls.primaryKey, {
      filepath: 'x.ts',
      useTabs: false,
      printWidth: getStdOutCols() - 4
    })
      .trim()
      .split('\n')
      .map((s) => kleur.red(s));

    log.info([
      kleur.bold('Primary Key Type:') +
        ' ' +
        fmtVal(getModelPrimaryKeyTypeName(table)),
      ...primaryKeyCode
    ]);
  }

  showModelCreateDataType(table: FetchedTable) {
    const typeDecls = getModelTypeDeclarations(table, this.options);

    const createDataCode = format(typeDecls.createData, {
      filepath: 'x.ts',
      useTabs: false,
      printWidth: getStdOutCols() - 4
    })
      .trim()
      .split('\n')
      .map((s) => kleur.red(s));
    const createDataNotes = table.columns
      .map((c) => {
        const p = getCreateModelFieldPresence(c);
        if (p === CreateModelFieldPresence.omittedGenerated) {
          return `- ${fmtVarName(getFieldName(c))} is omitted in ${fmtVal(
            getModelCreateDataTypeName(table)
          )}. ${kleur.dim('(Column is GENERATED.)')}`;
        }
        if (p === CreateModelFieldPresence.optionalAutoIncrement) {
          return `- ${fmtVarName(getFieldName(c))} is optional in ${fmtVal(
            getModelCreateDataTypeName(table)
          )}. ${kleur.dim('(Column is auto_increment.)')}`;
        }
        if (p === CreateModelFieldPresence.optionalHasDefault) {
          return `- ${fmtVarName(getFieldName(c))} is optional in ${fmtVal(
            getModelCreateDataTypeName(table)
          )}. ${kleur.dim('(Column has default value.)')}`;
        }
        return '';
      })
      .filter((s) => s.length > 0);

    if (createDataNotes.length > 0) {
      createDataNotes.unshift(kleur.italic('Notes:'));
    }
    log.info([
      kleur.bold('Create Data Type:') +
        ' ' +
        fmtVal(getModelCreateDataTypeName(table)),
      ...createDataCode,
      ...createDataNotes
    ]);
  }

  showModelUpdateDataType(table: FetchedTable) {
    const typeDecls = getModelTypeDeclarations(table, this.options);

    const updateDataCode = format(typeDecls.updateData, {
      filepath: 'x.ts',
      useTabs: false,
      printWidth: getStdOutCols() - 4
    })
      .trim()
      .split('\n')
      .map((s) => kleur.red(s));

    const updateDataNotes = table.columns
      .map((c) => {
        const p = getUpdateModelFieldPresence(c);
        if (p === UpdateModelFieldPresence.omittedGenerated) {
          return `- ${fmtVarName(getFieldName(c))} is omitted in ${fmtVal(
            getModelUpdateDataTypeName(table)
          )}. ${kleur.dim('(Column is GENERATED.)')}`;
        }
        if (p === UpdateModelFieldPresence.omittedPrimaryKey) {
          return `- ${fmtVarName(getFieldName(c))} is omitted in ${fmtVal(
            getModelUpdateDataTypeName(table)
          )}. ${kleur.dim('(Column is primary key.)')}`;
        }

        return '';
      })
      .filter((s) => s.length > 0);

    if (updateDataNotes.length > 0) {
      updateDataNotes.unshift(kleur.italic('Notes:'));
    }

    log.info([
      kleur.bold('Update Data Type:') +
        ' ' +
        fmtVal(getModelUpdateDataTypeName(table)),
      ...updateDataCode,
      ...updateDataNotes
    ]);
  }

  showModelFindUniqueType(table: FetchedTable) {
    const typeDecls = getModelTypeDeclarations(table, this.options);
    const uniqueCode = format(typeDecls.findUniqueParams, {
      filepath: 'x.ts',
      useTabs: false,
      printWidth: getStdOutCols() - 4,
      singleQuote: true
    })
      .trim()
      .split('\n')
      .map((s) => kleur.red(s));

    const uniqueNotes = table.columns
      .filter((c) => isUnique(c))
      .map((c) => {
        return `- ${fmtVarName(getFieldName(c))} is unique. ${kleur.dim(
          '(Key: UNI)'
        )}`;
      });

    if (uniqueNotes.length > 0) {
      uniqueNotes.unshift(kleur.italic('Notes:'));
    }
    log.info([
      kleur.bold('Find Unique Type:') +
        ' ' +
        fmtVal(getModelFindUniqueParamsTypeName(table)),
      ...uniqueCode,
      ...uniqueNotes
    ]);
  }

  showModelCreateSql(table: FetchedTable) {
    log.header(`Create Table | Model: ${getModelName(table)}`);
    log.info([
      kleur.bold('Model: ') +
        fmtVal(getModelName(table)) +
        kleur.dim(` (table: ${table.name})`),
      ...table.createSql.split('\n').map((s) => kleur.red(`${s}`))
    ]);
    log.footer();
  }

  showTypeOptions() {
    log.header(`Type Options`);
    log.table([
      [
        fmtVarName('typeBigIntAsString'),
        fmtVal(JSON.stringify(this.options.typeBigIntAsString))
      ],
      [
        fmtVarName('typeTinyIntOneAsBoolean'),
        fmtVal(JSON.stringify(this.options.typeTinyIntOneAsBoolean))
      ],
      [
        fmtVarName('typeImports'),
        fmtVal(JSON.stringify(this.options.typeImports))
      ]
    ]);
    log.footer();
  }

  async quickStartScreen(): Promise<void> {
    log.header('Quick Start');
    const unformatted =
      `
    // ${dirname(this.options.outputDirectory)}/get-db.${
        this.options.compileJs ? 'js' : 'ts'
      }
    import { AppDb } from './${basename(
      this.options.outputDirectory
    )}/database.js';
    import { connect } from '@planetscale/database';
    import { ${
      this.databaseUrlResult.databaseUrlKey
    } } from '$env/static/private';
  ` +
      (this.options.compileJs
        ? `

    /** @type {AppDb|undefined} */
    let db;
    /**
     * @returns {AppDb}
     */
    const getDb = () => {
      if (!db) {
        db = new AppDb(connect({ url: DATABASE_URL }));
      }
      return db;
    };
    `
        : `
    let db: AppDb|undefined
    const getDb = (): AppDb => {
      if (!db) {
        db = new AppDb(connect({ url: DATABASE_URL }));
      }
      return db;
    };
    `) +
      `
  export default getDb;
  `;

    const code = format(unformatted, {
      filepath: 'get-db.' + (this.options.compileJs ? 'js' : 'ts'),
      useTabs: false,
      printWidth: getStdOutCols() - 4
    });
    log.info([
      kleur.bold('Quick Start'),
      '',
      ...code.split('\n').map((s) => kleur.red(s))
    ]);
    log.footer();
    console.log();
    return await this.promptNextStep();
  }

  async typeOptionsScreen(): Promise<void> {
    this.showTypeOptions();
    console.log();
    return await this.promptNextStep();
  }
}
