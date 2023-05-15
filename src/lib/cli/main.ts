import colors from 'kleur';
import { cmdGenerate } from './cmd-generate.js';
import type { CliArgs, CliCommand } from './types.js';
import { FRIEDA_VERSION } from '$lib/version.js';
import { showHelp, showHelpForCommand } from './ui/show-help.js';
import { parseArgs } from './parse-args.js';
import { cmdExplain } from './cmd-explain.js';
import { cmdInit } from './cmd-init.js';
export const main = async (argv: string[]) => {
  console.log(colors.bold('frieda'), colors.dim(`v${FRIEDA_VERSION}`), '🦮');
  const { command, cliArgs, positionalArgs } = parseArgs(argv);
  if (!command) {
    showHelp();
    return;
  }
  if (cliArgs.help) {
    showHelpForCommand(command as CliCommand);
    return;
  }
  switch (command.name) {
    case 'generate':
      await cmdGenerate(cliArgs as Partial<CliArgs>);
      break;
    case 'explain':
      await cmdExplain(cliArgs as Partial<CliArgs>, positionalArgs);
      break;
    case 'init':
      await cmdInit(cliArgs as Partial<CliArgs>);
      break;
  }
};
