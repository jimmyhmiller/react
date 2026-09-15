/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Environment flags implemented only by the Rust compiler
 * (`compiler/crates/react_compiler_hir/src/environment_config.rs`).
 *
 * The TypeScript pragma parser ignores keys that are not part of its schema,
 * so snap parses these flags itself and passes them to the Rust plugin.
 */
const RUST_ONLY_ENVIRONMENT_FLAGS: ReadonlyArray<string> = [
  'enableComponentInlining',
  'enableJsxBlocks',
  'enableListItemMemoization',
  'enableContextSelectors',
];

export function assertRustOnlyEnvironmentFlag(flag: string): void {
  if (!RUST_ONLY_ENVIRONMENT_FLAGS.includes(flag)) {
    throw new Error(
      `Unknown Rust-only environment flag '${flag}'. Known flags: ${RUST_ONLY_ENVIRONMENT_FLAGS.join(', ')}`,
    );
  }
}

export function parseRustOnlyEnvironmentPragma(
  firstLine: string,
): Record<string, boolean> {
  const environment: Record<string, boolean> = {};
  for (const entry of firstLine.split('@')) {
    const keyVal = entry.trim();
    const valIdx = keyVal.indexOf(':');
    const key =
      valIdx === -1 ? keyVal.split(' ', 1)[0] : keyVal.slice(0, valIdx);
    if (!RUST_ONLY_ENVIRONMENT_FLAGS.includes(key)) {
      continue;
    }
    const value = valIdx === -1 ? null : keyVal.slice(valIdx + 1).trim();
    if (value === null || value === 'true') {
      environment[key] = true;
    } else if (value === 'false') {
      environment[key] = false;
    } else {
      throw new Error(
        `Invalid value for Rust-only environment flag '${key}': '${value}'`,
      );
    }
  }
  return environment;
}
