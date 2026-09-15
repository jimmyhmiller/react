/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// Checks that every variant renders the same DOM as the uncompiled app. Runs
// each workload's setup and steps in every variant and compares the app's DOM
// after the setup and after every step with the `no-compiler` variant. Exits
// with a non-zero code on the first difference.
//
// The DOM is compared in a canonical form that ignores two differences that
// compiled blocks are documented to have (see
// compiler/docs/experiments/0002-compiled-blocks.md): the order in which an
// element's attributes were created, and empty or split text nodes.
//
// Variants of other frameworks are compared in a form that also ignores how
// each framework represents the same UI state:
// - form state is compared through the `value` and `checked` properties of
//   inputs instead of their attributes (React also mirrors them into
//   attributes; other frameworks set only the properties), and the
//   `autofocus` attribute is ignored (frameworks focus the element instead),
// - an empty `class` attribute is treated like no `class` attribute (Preact
//   and Svelte remove it where React sets it to ''),
// - comment nodes are ignored (Vue and Svelte use them as anchors).
//
// With --ssr, the React variants' server-rendered pages (dist/<variant>/<app>/ssr,
// see build.mjs) are hydrated and compared the same way, with the hydrated
// `no-compiler` page as the reference. A hydration mismatch logs an error, which
// fails the check.
//
//   node scripts/verify.mjs [--chromium PATH] [--variant NAME]... [--ssr]

import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {VARIANTS, variantHasApp} from './variants.mjs';
import {APP_PAGES, PAGE_HELPERS, WORKLOADS} from './workloads.mjs';
import {APPS} from './apps.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REFERENCE = 'no-compiler';

function parseArgs(argv) {
  const args = {chromium: null, variants: [], ssr: false};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--ssr') {
      args.ssr = true;
    } else if (argv[i] === '--chromium') {
      args.chromium = argv[++i];
    } else if (argv[i] === '--variant') {
      args.variants.push(argv[++i]);
    } else {
      throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }
  return args;
}

async function snapshots(browser, variant, workload, ssr) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') {
      errors.push(message.text());
    }
  });
  try {
    const url = pathToFileURL(
      ssr
        ? path.join(ROOT, 'dist', variant.name, workload.app, 'ssr', 'index.html')
        : path.join(ROOT, 'dist', variant.name, workload.app, 'index.html'),
    ).href;
    await page.goto(url);
    await page.waitForSelector(
      ssr ? 'body[data-hydrated]' : APP_PAGES[workload.app].ready,
    );
    await page.evaluate(PAGE_HELPERS);
    const result = [];
    const capture = async label => {
      const html = await page.evaluate(
        `(async () => {
          await __bench.nextFrame();
          const root = document.querySelector('${APP_PAGES[workload.app].root}');
          const canonical = ${canonicalHTML.toString()};
          return {exact: canonical(root, false), state: canonical(root, true)};
        })()`,
      );
      result.push({label, html});
    };
    if (workload.setup !== '') {
      await page.evaluate(`(async () => { ${workload.setup}; })()`);
    }
    await capture('after setup');
    for (const step of workload.steps) {
      await page.evaluate(`(async () => { ${step.run}; await __bench.nextFrame(); ${step.verify} })()`);
      await capture(`after ${step.name}`);
    }
    if (errors.length !== 0) {
      throw new Error(`${variant.name} logged errors:\n${errors.join('\n')}`);
    }
    return result;
  } finally {
    await context.close();
  }
}

// Serialized in the page. Attributes are sorted and adjacent text nodes are
// merged, skipping empty ones. Static island comments are skipped. With
// `compareState`, inputs are serialized with their value and checked
// properties instead of the corresponding attributes, and comments are skipped.
function canonicalHTML(root, compareState) {
  function escape(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }
  function serialize(node) {
    const isInput = node.localName === 'input';
    const names = node
      .getAttributeNames()
      .filter(
        name =>
          !compareState ||
          !(
            (isInput &&
              (name === 'value' || name === 'checked' || name === 'autofocus')) ||
            (name === 'class' && node.getAttribute(name) === '')
          ),
      )
      .sort();
    let out = '<' + node.localName;
    for (const name of names) {
      out += ' ' + name + '="' + escape(node.getAttribute(name)) + '"';
    }
    if (compareState && isInput) {
      out += ' .value="' + escape(node.value) + '" .checked="' + node.checked + '"';
    }
    out += '>';
    let text = '';
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.nodeValue;
        continue;
      }
      if (
        child.nodeType === Node.COMMENT_NODE &&
        (child.nodeValue === '~' || child.nodeValue === '/~')
      ) {
        // The boundaries of dehydrated static islands (see
        // compiler/docs/experiments/0005-static-islands.md).
        continue;
      }
      if (text !== '') {
        out += escape(text);
        text = '';
      }
      if (child.nodeType === Node.ELEMENT_NODE) {
        out += serialize(child);
      } else if (child.nodeType === Node.COMMENT_NODE && !compareState) {
        out += '<!--' + child.nodeValue + '-->';
      }
    }
    if (text !== '') {
      out += escape(text);
    }
    return out + '</' + node.localName + '>';
  }
  return serialize(root);
}

function firstDifference(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) {
    i++;
  }
  return i;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const browser = await chromium.launch({
    headless: true,
    ...(args.chromium != null ? {executablePath: args.chromium} : {}),
  });
  let failed = false;
  try {
    for (const workload of WORKLOADS) {
      const reference = await snapshots(
        browser,
        VARIANTS.find(v => v.name === REFERENCE),
        workload,
        args.ssr,
      );
      for (const variant of VARIANTS) {
        if (
          variant.name === REFERENCE ||
          (args.ssr && variant.framework !== 'react') ||
          (args.variants.length !== 0 && !args.variants.includes(variant.name)) ||
          !variantHasApp(variant, APPS.find(app => app.name === workload.app))
        ) {
          continue;
        }
        const actual = await snapshots(browser, variant, workload, args.ssr);
        const form = variant.framework === 'react' ? 'exact' : 'state';
        for (let i = 0; i < reference.length; i++) {
          const expected = reference[i].html[form];
          const got = actual[i].html[form];
          if (got !== expected) {
            const at = firstDifference(expected, got);
            console.error(
              `MISMATCH ${workload.name} ${reference[i].label}: ${variant.name}\n` +
                `  expected: ...${expected.slice(Math.max(0, at - 80), at + 80)}\n` +
                `  actual:   ...${got.slice(Math.max(0, at - 80), at + 80)}`,
            );
            failed = true;
            break;
          }
        }
      }
      console.log(`${failed ? 'FAILED' : 'ok'} ${workload.name}`);
      if (failed) {
        break;
      }
    }
  } finally {
    await browser.close();
  }
  process.exit(failed ? 1 : 0);
}

await main();
