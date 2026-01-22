// File: packages/cli/src/commands/publish.ts

import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';
import path from 'path';
import FormData from 'form-data';
import axios from 'axios';
import { loadPackageJson } from '../utils/load-package.js';
import { loadManifest } from '../utils/load-manifest.js';

interface PublishOptions {
  apiUrl?: string;
  apiKey?: string;
  dist?: string;
}

export async function publishCommand(options: PublishOptions) {
  const spinner = ora('Publishing plugin...').start();

  try {
    const cwd = process.cwd();
    const distPath = path.join(cwd, options.dist || 'dist');
    const apiUrl = options.apiUrl || process.env.PLEXICA_API_URL || 'http://localhost:3000';

    // 1. Load package.json
    const packageJson = await loadPackageJson(cwd);
    if (!packageJson) {
      spinner.fail('No package.json found');
      process.exit(1);
    }

    // 2. Load and validate manifest
    spinner.text = 'Validating manifest...';
    const manifest = await loadManifest(cwd);
    if (!manifest) {
      spinner.fail('Failed to load manifest.ts');
      process.exit(1);
    }

    // 3. Verify dist directory exists
    if (!(await fs.pathExists(distPath))) {
      spinner.fail(`Dist directory not found: ${distPath}`);
      console.log(chalk.yellow('\nRun ') + chalk.cyan('plexica build') + chalk.yellow(' first!'));
      process.exit(1);
    }

    // 4. Verify remoteEntry.js exists
    let remoteEntryPath = path.join(distPath, 'remoteEntry.js');
    if (!(await fs.pathExists(remoteEntryPath))) {
      remoteEntryPath = path.join(distPath, 'assets', 'remoteEntry.js');
    }

    if (!(await fs.pathExists(remoteEntryPath))) {
      spinner.fail('remoteEntry.js not found in dist directory');
      process.exit(1);
    }

    // 5. Get all files in dist directory
    spinner.text = 'Collecting files...';
    const files = await getAllFiles(distPath);

    if (files.length === 0) {
      spinner.fail('No files found in dist directory');
      process.exit(1);
    }

    spinner.text = `Found ${files.length} files to upload`;

    // 6. Create form data
    const form = new FormData();
    form.append('pluginId', manifest.id);
    form.append('version', packageJson.version);

    // Add all files
    for (const file of files) {
      const relativePath = path.relative(distPath, file);
      const fileStream = fs.createReadStream(file);
      form.append('files', fileStream, relativePath);
    }

    // 7. Upload to API
    spinner.text = `Uploading ${chalk.cyan(manifest.id)}@${chalk.gray(packageJson.version)}...`;

    const uploadUrl = `${apiUrl}/api/plugins/upload`;

    try {
      const response = await axios.post(uploadUrl, form, {
        headers: {
          ...form.getHeaders(),
          ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      if (response.data.success) {
        spinner.succeed(`Published ${chalk.cyan(manifest.id)}@${chalk.gray(packageJson.version)}`);

        console.log(chalk.bold('\nCDN URLs:'));
        console.log(
          `  ${chalk.gray('•')} Remote Entry: ${chalk.blue(response.data.remoteEntryUrl)}`
        );

        if (response.data.urls && response.data.urls.length > 0) {
          console.log(
            `  ${chalk.gray('•')} Total files: ${chalk.white(response.data.urls.length)}`
          );
        }

        console.log(chalk.green('\n✓ Plugin published successfully!'));
      } else {
        spinner.fail('Upload failed');
        console.error(chalk.red('Server returned error'));
        process.exit(1);
      }
    } catch (error: any) {
      spinner.fail('Upload failed');

      if (error.response) {
        console.error(chalk.red('\nServer error:'), error.response.status);
        console.error(chalk.gray(JSON.stringify(error.response.data, null, 2)));
      } else if (error.request) {
        console.error(chalk.red('\nNo response from server'));
        console.error(chalk.gray(`URL: ${uploadUrl}`));
      } else {
        console.error(chalk.red('\nError:'), error.message);
      }

      process.exit(1);
    }
  } catch (error: any) {
    spinner.fail('Publish failed');
    console.error(chalk.red('\nError:'), error.message);
    process.exit(1);
  }
}

/**
 * Recursively get all files in a directory
 */
async function getAllFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry: any) => {
      const fullPath = path.join(dir, entry.name);
      return entry.isDirectory() ? getAllFiles(fullPath) : [fullPath];
    })
  );
  return files.flat();
}
