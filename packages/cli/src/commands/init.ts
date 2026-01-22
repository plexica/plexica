// File: packages/cli/src/commands/init.ts

import chalk from 'chalk';
import prompts from 'prompts';

interface InitOptions {
  template?: string;
}

export async function initCommand(name?: string, _options?: InitOptions) {
  console.log(chalk.bold.cyan('\n🚀 Plexica Plugin Init\n'));

  // Get plugin name if not provided
  let pluginName = name;
  if (!pluginName) {
    const response = await prompts({
      type: 'text',
      name: 'name',
      message: 'Plugin name:',
      validate: (value: string) => (value.length > 0 ? true : 'Plugin name is required'),
    });
    pluginName = response.name;
  }

  if (!pluginName) {
    console.log(chalk.yellow('\nOperation cancelled'));
    return;
  }

  console.log(chalk.yellow('\n⚠️  Plugin scaffolding not yet implemented'));
  console.log(chalk.gray('\nFor now, please copy the plugin-template-frontend directory:'));
  console.log(chalk.cyan(`\n  cp -r apps/plugin-template-frontend apps/${pluginName}`));
  console.log(chalk.gray('\nThen update the manifest in ') + chalk.cyan('src/manifest.ts'));
}
