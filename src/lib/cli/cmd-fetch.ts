import { fetchDatabaseSchema } from '$lib/db-fetch/fetch-schema.js';
import type { ParseCommandResult } from './commands.js';
import { getSettings } from './settings.js';
import { intro, outro, log } from '@clack/prompts'
import { formatFilePath, getServerlessConnection, prettify, wait } from './utils.js';
import { writeCurrentSchema } from './write.js';
import colors from 'picocolors'
import { parseModelDefinition } from '$lib/parser/parser.js';
import {join} from 'path'
import fs from 'fs-extra'
export const cmdFetch = async (commandResult: ParseCommandResult) => {
  intro(`${colors.bold(`fetch`)} ${colors.dim('Fetch the current database schema')}`)
  const settings = await getSettings();
  const s = wait('Fetching schema')
  const schema = await fetchDatabaseSchema(getServerlessConnection(settings.databaseUrl));
  s.done();
  
  const written = await writeCurrentSchema(schema, settings);
  const logs = [
    colors.bold('Current schema fetched'),
    ...Object.keys(written).map(k => `${k}: ${formatFilePath(written[k])}`)
  ];
  log.success(logs.join('\n'));
  const parsedModels = schema.tables.map(t => parseModelDefinition(t, settings));

  outro(colors.bold('Done'))
};
