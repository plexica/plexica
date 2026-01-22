// File: packages/cli/src/utils/load-package.ts

import fs from 'fs-extra';
import path from 'path';

export interface PackageJson {
  name: string;
  version: string;
  description?: string;
  author?: string;
  [key: string]: any;
}

export async function loadPackageJson(dir: string): Promise<PackageJson | null> {
  const packagePath = path.join(dir, 'package.json');

  try {
    const exists = await fs.pathExists(packagePath);
    if (!exists) {
      return null;
    }

    const content = await fs.readJson(packagePath);
    return content as PackageJson;
  } catch {
    return null;
  }
}
