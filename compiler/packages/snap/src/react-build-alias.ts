/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import Module from 'module';
import path from 'path';

/**
 * With SNAP_REACT_BUILD set to a directory containing React packages (such as
 * `<repo>/build/node_modules` after
 * `RELEASE_CHANNEL=experimental node scripts/rollup/build.js react/index,react/jsx-runtime,react/jsx-dev-runtime,react/compiler-runtime,react-dom/index,react-dom/client,react-dom/test-utils,scheduler/index --type=NODE_DEV,NODE_PROD`),
 * fixtures are evaluated with those packages instead of the installed ones.
 * This lets sprout evaluate output that uses experimental React runtime APIs
 * (compiled blocks, list item memoization, context selectors).
 *
 * This module must be imported before anything that imports React.
 */
export const REACT_BUILD: string | null =
  process.env['SNAP_REACT_BUILD'] ?? null;

const ALIASED_PACKAGES = new Set(['react', 'react-dom', 'scheduler']);

if (REACT_BUILD !== null) {
  const buildDirectory = path.resolve(REACT_BUILD);
  const resolveFilename = (Module as any)._resolveFilename;
  (Module as any)._resolveFilename = function (
    request: string,
    ...rest: Array<unknown>
  ): string {
    const packageName = request.split('/')[0];
    if (ALIASED_PACKAGES.has(packageName)) {
      return resolveFilename.call(
        this,
        path.join(buildDirectory, request),
        ...rest,
      );
    }
    return resolveFilename.call(this, request, ...rest);
  };
}
