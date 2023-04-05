import { spinner, log } from '@clack/prompts';
import { join } from 'path';
import { generateCode } from './shared/generate-code.js';
import type {
  GeneratedCode,
  RawSchema,
  ResolvedFriedaVars
} from './shared/types.js';
import fs from 'fs-extra';
import { formatFilePath, prettify } from './shared/utils.js';
import colors from 'picocolors';
import { getModelSchemas } from './shared/get-model-schemas.js';

export const generate = async (
  schema: RawSchema,
  vars: ResolvedFriedaVars
) => {
  const writeSpinner = spinner();
  writeSpinner.start(`Generating code...`);
  const modelSchemas = getModelSchemas(schema.tables);
  const code: GeneratedCode = generateCode(modelSchemas, vars);
  await fs.ensureDir(vars.generatedModelsDirectoryFullPath);
  const filePaths = await Promise.all(
    Object.keys(code).map((key) =>
      writeFile(key, code[key as keyof GeneratedCode], vars)
    )
  );

  writeSpinner.stop(`Code generated.`);
  
  log.info([
    colors.dim('Generated files:'),
    ...filePaths.map((p) => formatFilePath(p)),
    `Visit ${colors.underline(colors.cyan('https://github.com/nowzoo/frieda'))} for documentation.`,
    
  ].join('\n'));
};

const writeFile = async (
  key: string,
  code: string,
  vars: ResolvedFriedaVars
): Promise<string> => {
  const fullPath = join(vars.generatedModelsDirectoryFullPath, `${key}.ts`);

  const prettified = await prettify(code, fullPath);
  await fs.writeFile(fullPath, prettified);
  return fullPath;
};
