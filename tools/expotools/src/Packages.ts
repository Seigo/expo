import path from 'path';
import glob from 'glob';
import fs from 'fs-extra';

import IosUnversionablePackages from './versioning/ios/unversionablePackages.json';
import * as Directories from './Directories';

const IOS_DIR = Directories.getIosDir();
const PACKAGES_DIR = Directories.getPackagesDir();

/**
 * Represents a package in the monorepo.
 */
class Package {
  path: string;
  packageJson: any;
  unimoduleJson: any;

  constructor(path: string, packageJson: { [key: string]: any }) {
    this.path = path;
    this.packageJson = packageJson;
    this.unimoduleJson = readUnimoduleJsonAtDirectory(path);
  }

  get packageName(): string {
    return this.packageJson.name;
  }

  get packageVersion(): string {
    return this.packageJson.version;
  }

  get packageSlug(): string {
    return (this.unimoduleJson && this.unimoduleJson.name) || this.packageName;
  }

  get scripts(): { [key: string]: string } {
    return this.packageJson.scripts || {};
  }

  get podspecName(): string | null {
    if (!this.unimoduleJson) {
      return null;
    }

    const iosConfig = {
      subdirectory: 'ios',
      ...('ios' in this.unimoduleJson ? this.unimoduleJson.ios : {}),
    };

    // 'ios.podName' is actually not used anywhere in our unimodules, but let's have the same logic as react-native-unimodules script.
    if ('podName' in iosConfig) {
      return iosConfig.podName as string;
    }

    // Obtain podspecName by looking for podspecs
    const podspecPaths = glob.sync('**/*.podspec', {
      cwd: path.join(this.path, iosConfig.subdirectory),
    });

    if (!podspecPaths || podspecPaths.length === 0) {
      return null;
    }
    return path.basename(podspecPaths[0], '.podspec');
  }

  isUnimodule() {
    return !!this.unimoduleJson;
  }

  isIncludedInExpoClientOnPlatform(platform: 'ios'): boolean {
    if (platform === 'ios') {
      // On iOS we can easily check whether the package is included in Expo client by checking if it is installed by Cocoapods.
      const { podspecName } = this;
      return (
        podspecName != null &&
        fs.existsSync(path.join(IOS_DIR, 'Pods', 'Headers', 'Public', podspecName))
      );
    }
    throw new Error(
      `'isIncludedInExpoClientOnPlatform' is not supported on '${platform}' platform yet.`
    );
  }

  isVersionableOnPlatform(platform: 'ios'): boolean {
    if (platform === 'ios') {
      return this.podspecName != null && !IosUnversionablePackages.includes(this.packageName);
    }
    throw new Error(`'isVersionableOnPlatform' is not supported on '${platform}' platform yet.`);
  }
}

/**
 * Resolves to an array of Package instances that represent Expo packages inside given directory.
 *
 * @param dir Directory at which the function will look for packages. Defaults to `packages`.
 * @param packages Array of already found packages (used when traversing the directory recursively).
 */
async function getListOfPackagesAsync(
  dir: string = PACKAGES_DIR,
  packages: Package[] = []
): Promise<Package[]> {
  const dirs = await fs.readdir(dir);

  for (const dirName of dirs) {
    const packagePath = path.join(dir, dirName);
    const packageJsonPath = path.join(packagePath, 'package.json');

    if (!(await fs.lstat(packagePath)).isDirectory()) {
      continue;
    }
    if (await fs.exists(packageJsonPath)) {
      const packageJson = require(packageJsonPath);
      packages.push(new Package(packagePath, packageJson));
    } else {
      // Recursively add packages under directories without package.json file.
      await getListOfPackagesAsync(packagePath, packages);
    }
  }
  return packages;
}

function readUnimoduleJsonAtDirectory(dir: string) {
  const unimoduleJsonPath = path.join(dir, 'unimodule.json');
  try {
    return require(unimoduleJsonPath);
  } catch (error) {
    return null;
  }
}

export { Package, getListOfPackagesAsync };
