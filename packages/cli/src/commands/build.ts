// File: packages/cli/src/commands/build.ts

import { execa } from 'execa';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'path';
import { loadPackageJson } from '../utils/load-package.js';

interface BuildOptions {
  config?: string;
  minify?: boolean;
  sourcemap?: boolean;
}

export async function buildCommand(options: BuildOptions) {
  const spinner = ora('Building plugin...').start();

  try {
    // 1. Verify we're in a plugin directory
    const cwd = process.cwd();
    const packageJson = await loadPackageJson(cwd);

    if (!packageJson) {
      spinner.fail('No package.json found. Are you in a plugin directory?');
      process.exit(1);
    }

    spinner.text = `Building ${chalk.cyan(packageJson.name)}@${chalk.gray(packageJson.version)}`;

    // 2. Validate manifest exists
    const manifestPath = path.join(cwd, 'src', 'manifest.ts');
    if (!(await fs.pathExists(manifestPath))) {
      spinner.fail('No manifest.ts found in src/ directory');
      process.exit(1);
    }

    // 3. Check for vite.config.ts
    const configPath = options.config || 'vite.config.ts';
    const fullConfigPath = path.join(cwd, configPath);

    if (!(await fs.pathExists(fullConfigPath))) {
      spinner.fail(`Vite config not found: ${configPath}`);
      process.exit(1);
    }

    // 4. Clean dist directory
    const distPath = path.join(cwd, 'dist');
    await fs.remove(distPath);
    spinner.text = 'Cleaned dist directory';

    // 5. Run TypeScript compiler
    spinner.text = 'Running TypeScript compiler...';
    try {
      await execa('pnpm', ['exec', 'tsc', '-b'], {
        cwd,
        stdio: 'pipe',
      });
    } catch (error: any) {
      spinner.fail('TypeScript compilation failed');
      console.error(chalk.red(error.stderr || error.message));
      process.exit(1);
    }

    // 6. Run Vite build
    spinner.text = 'Building with Vite...';
    const viteArgs = ['exec', 'vite', 'build'];

    if (!options.minify) {
      viteArgs.push('--minify', 'false');
    }

    if (options.sourcemap) {
      viteArgs.push('--sourcemap');
    }

    try {
      const result = await execa('pnpm', viteArgs, {
        cwd,
        stdio: 'pipe',
      });

      // Show build output
      if (result.stdout) {
        console.log('\n' + result.stdout);
      }
    } catch (error: any) {
      spinner.fail('Vite build failed');
      console.error(chalk.red(error.stderr || error.message));
      process.exit(1);
    }

    // 7. Verify build output
    if (!(await fs.pathExists(distPath))) {
      spinner.fail('Build completed but dist directory not found');
      process.exit(1);
    }

    // Look for remoteEntry.js in dist or dist/assets
    let remoteEntryPath = path.join(distPath, 'remoteEntry.js');
    if (!(await fs.pathExists(remoteEntryPath))) {
      remoteEntryPath = path.join(distPath, 'assets', 'remoteEntry.js');
    }

    if (!(await fs.pathExists(remoteEntryPath))) {
      spinner.fail('Build completed but remoteEntry.js not found');
      process.exit(1);
    }

    // 8. Get build stats
    const stats = await fs.stat(remoteEntryPath);
    const sizeKB = (stats.size / 1024).toFixed(2);

    spinner.succeed(
      `Build completed! ${chalk.cyan('remoteEntry.js')} (${chalk.gray(sizeKB + ' KB')})`
    );

    // 9. Show dist contents
    const files = await fs.readdir(distPath);
    console.log(chalk.bold('\nBuild output:'));
    for (const file of files) {
      const filePath = path.join(distPath, file);
      const stat = await fs.stat(filePath);
      if (stat.isFile()) {
        const size = (stat.size / 1024).toFixed(2);
        console.log(`  ${chalk.gray('•')} ${file} ${chalk.gray(`(${size} KB)`)}`);
      } else if (stat.isDirectory()) {
        const subFiles = await fs.readdir(filePath);
        console.log(`  ${chalk.gray('•')} ${file}/ ${chalk.gray(`(${subFiles.length} files)`)}`);
      }
    }

    console.log(
      chalk.green('\n✓ Ready to publish! Run ') +
        chalk.cyan('plexica publish') +
        chalk.green(' to upload to CDN')
    );
  } catch (error: any) {
    spinner.fail('Build failed');
    console.error(chalk.red('\nError:'), error.message);
    process.exit(1);
  }
}
