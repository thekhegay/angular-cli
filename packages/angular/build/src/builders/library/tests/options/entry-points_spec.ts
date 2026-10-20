/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import { executeLibraryBuilder } from '../../builder';
import { LIBRARY_BUILDER_INFO, describeLibraryBuilder } from '../setup';

describeLibraryBuilder(executeLibraryBuilder, LIBRARY_BUILDER_INFO, (harness) => {
  describe('Package.json "exports" entry points', () => {
    it('should succeed when entry point is a .ts file', async () => {
      const { result } = await harness.executeOnce();
      expect(result?.success).toBeTrue();
    });

    it('should succeed when exports is a string shorthand', async () => {
      await harness.modifyFile('projects/lib/package.json', (content) => {
        const pkg = JSON.parse(content);
        pkg.exports = './src/public-api.ts';

        return JSON.stringify(pkg, null, 2);
      });

      const { result } = await harness.executeOnce();
      expect(result?.success).toBeTrue();
    });

    it('should succeed when entry point is a .mts file', async () => {
      await harness.writeFiles({
        'projects/lib/src/public-api.mts': 'export const VALUE = 42;\n',
      });
      await harness.modifyFile('projects/lib/package.json', (content) => {
        const pkg = JSON.parse(content);
        pkg.exports = {
          '.': './src/public-api.mts',
        };

        return JSON.stringify(pkg, null, 2);
      });

      const { result } = await harness.executeOnce();
      expect(result?.success).toBeTrue();
    });

    it('should fail when entry point is not a .ts or .mts file', async () => {
      await harness.modifyFile('projects/lib/package.json', (content) => {
        const pkg = JSON.parse(content);
        pkg.exports = {
          '.': './src/public-api.cts',
        };

        return JSON.stringify(pkg, null, 2);
      });

      const { result, error } = await harness.executeOnce({
        outputLogsOnException: false,
        outputLogsOnFailure: false,
      });
      expect(result).toBeUndefined();
      expect(error).toBeDefined();
      expect((error as Error).message).toMatch(/must be a TypeScript file \('\.ts' or '\.mts'\)/);
    });

    it('should fail when entry point is a declaration file', async () => {
      await harness.modifyFile('projects/lib/package.json', (content) => {
        const pkg = JSON.parse(content);
        pkg.exports = {
          '.': './src/public-api.d.ts',
        };

        return JSON.stringify(pkg, null, 2);
      });

      const { result, error } = await harness.executeOnce({
        outputLogsOnException: false,
        outputLogsOnFailure: false,
      });
      expect(result).toBeUndefined();
      expect(error).toBeDefined();
      expect((error as Error).message).toMatch(/must be a TypeScript file \('\.ts' or '\.mts'\)/);
    });

    it('should add an entry point for every file matched by a subpath pattern', async () => {
      await harness.writeFiles({
        'projects/lib/feature/src/public-api.ts': 'export const FEATURE = 1;\n',
        'projects/lib/feature/testing/src/public-api.ts': 'export const FEATURE_TESTING = 2;\n',
      });
      await harness.modifyFile('projects/lib/package.json', (content) => {
        const pkg = JSON.parse(content);
        pkg.exports = {
          '.': './src/public-api.ts',
          './*': { sass: './*/_index.scss', default: './*/src/public-api.ts' },
        };

        return JSON.stringify(pkg, null, 2);
      });

      const { result } = await harness.executeOnce();
      expect(result?.success).toBeTrue();

      const { exports } = JSON.parse(harness.readFile('dist/lib/package.json'));
      expect(Object.keys(exports)).toEqual([
        '.',
        './feature',
        './feature/testing',
        './package.json',
      ]);
      expect(exports['./feature/testing']).toEqual({
        types: './types/lib-feature-testing.d.ts',
        sass: './feature/testing/_index.scss',
        default: './fesm2022/lib-feature-testing.mjs',
      });
      harness.expectFile('dist/lib/fesm2022/lib-feature.mjs').content.toContain('FEATURE');
      harness
        .expectFile('dist/lib/fesm2022/lib-feature-testing.mjs')
        .content.toContain('FEATURE_TESTING');
    });

    it('should not add an entry point for a pattern match excluded with null', async () => {
      await harness.writeFiles({
        'projects/lib/feature/src/public-api.ts': `export * from '../lib/src/public-api';\n`,
        'projects/lib/feature/lib/src/public-api.ts': 'export const FEATURE = 1;\n',
      });
      await harness.modifyFile('projects/lib/package.json', (content) => {
        const pkg = JSON.parse(content);
        pkg.exports = {
          '.': './src/public-api.ts',
          './*': './*/src/public-api.ts',
          './*/lib': null,
        };

        return JSON.stringify(pkg, null, 2);
      });

      const { result } = await harness.executeOnce();
      expect(result?.success).toBeTrue();

      const { exports } = JSON.parse(harness.readFile('dist/lib/package.json'));
      expect(Object.keys(exports)).toEqual(['.', './feature', './*/lib', './package.json']);
      expect(exports['./*/lib']).toBeNull();
      harness.expectFile('dist/lib/fesm2022/lib-feature-lib.mjs').toNotExist();
    });

    it('should prefer an explicit subpath over a pattern match', async () => {
      await harness.writeFiles({
        'projects/lib/feature/src/public-api.ts': 'export const FEATURE = 1;\n',
        'projects/lib/feature/src/index.ts': 'export const FEATURE_INDEX = 2;\n',
      });
      await harness.modifyFile('projects/lib/package.json', (content) => {
        const pkg = JSON.parse(content);
        pkg.exports = {
          '.': './src/public-api.ts',
          './feature': { sass: './feature/_index.scss', default: './feature/src/index.ts' },
          './*': './*/src/public-api.ts',
        };

        return JSON.stringify(pkg, null, 2);
      });

      const { result } = await harness.executeOnce();
      expect(result?.success).toBeTrue();

      const { exports } = JSON.parse(harness.readFile('dist/lib/package.json'));
      expect(Object.keys(exports)).toEqual(['.', './feature', './package.json']);
      expect(exports['./feature'].sass).toBe('./feature/_index.scss');
      harness.expectFile('dist/lib/fesm2022/lib-feature.mjs').content.toContain('FEATURE_INDEX');
    });

    it('should fail when a subpath pattern does not match any files', async () => {
      await harness.modifyFile('projects/lib/package.json', (content) => {
        const pkg = JSON.parse(content);
        pkg.exports = {
          '.': './src/public-api.ts',
          './*': './*/missing.ts',
        };

        return JSON.stringify(pkg, null, 2);
      });

      const { result, error } = await harness.executeOnce({
        outputLogsOnException: false,
        outputLogsOnFailure: false,
      });
      expect(result).toBeUndefined();
      expect((error as Error).message).toMatch(
        /Subpath pattern '\.\/\*' in '.+' did not match any files/,
      );
    });

    it('should fail when a subpath pattern target does not contain a single "*"', async () => {
      await harness.modifyFile('projects/lib/package.json', (content) => {
        const pkg = JSON.parse(content);
        pkg.exports = {
          '.': './src/public-api.ts',
          './*': './src/public-api.ts',
        };

        return JSON.stringify(pkg, null, 2);
      });

      const { result, error } = await harness.executeOnce({
        outputLogsOnException: false,
        outputLogsOnFailure: false,
      });
      expect(result).toBeUndefined();
      expect((error as Error).message).toMatch(/must each contain exactly one '\*'/);
    });
  });
});
