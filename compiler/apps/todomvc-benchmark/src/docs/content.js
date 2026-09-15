/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// Deterministic content of the documentation page app: a long article of
// headings, paragraphs with inline code, links and emphasis, code blocks,
// lists, tables and callouts, a sidebar of pages and a table of contents.

function createRandom() {
  let seed = 11;
  return max => {
    seed = (seed * 48271) % 2147483647;
    return seed % max;
  };
}

const WORDS = [
  'component', 'render', 'state', 'effect', 'hydration', 'server', 'client',
  'boundary', 'suspense', 'transition', 'context', 'reducer', 'memo', 'ref',
  'event', 'handler', 'update', 'commit', 'tree', 'element', 'props', 'value',
  'stream', 'cache', 'resource', 'priority', 'lane', 'fiber', 'root', 'node',
  'the', 'a', 'when', 'which', 'every', 'only', 'before', 'after', 'during',
  'returns', 'reads', 'writes', 'schedules', 'keeps', 'skips', 'measures',
];
const IDENTIFIERS = [
  'useState', 'useEffect', 'startTransition', 'createRoot', 'hydrateRoot',
  'Suspense', 'useMemo', 'useId', 'renderToString', 'useOptimistic',
];
const PAGE_GROUPS = [
  'Getting started', 'Describing the UI', 'Adding interactivity',
  'Managing state', 'Escape hatches', 'Hooks', 'Components', 'APIs',
  'Server rendering', 'Legacy APIs',
];

function sentence(random, words) {
  const parts = [];
  for (let i = 0; i < words; i++) {
    parts.push(WORDS[random(WORDS.length)]);
  }
  const text = parts.join(' ');
  return text[0].toUpperCase() + text.slice(1) + '.';
}

function inlineParts(random) {
  const parts = [];
  const count = 3 + random(4);
  for (let i = 0; i < count; i++) {
    const kind = random(6);
    if (kind === 0) {
      parts.push({type: 'code', text: IDENTIFIERS[random(IDENTIFIERS.length)]});
    } else if (kind === 1) {
      const name = IDENTIFIERS[random(IDENTIFIERS.length)];
      parts.push({type: 'link', text: name, href: '/reference/' + name});
    } else if (kind === 2) {
      parts.push({type: 'strong', text: sentence(random, 2 + random(3))});
    } else {
      parts.push({type: 'text', text: ' ' + sentence(random, 6 + random(10)) + ' '});
    }
  }
  return parts;
}

function codeLines(random) {
  const lines = [];
  const count = 4 + random(10);
  for (let i = 0; i < count; i++) {
    const name = IDENTIFIERS[random(IDENTIFIERS.length)];
    lines.push([
      {kind: 'keyword', text: random(2) === 0 ? 'const ' : 'let '},
      {kind: 'name', text: WORDS[random(30)]},
      {kind: 'plain', text: ' = '},
      {kind: 'call', text: name},
      {kind: 'plain', text: '(' + WORDS[random(30)] + ');'},
    ]);
  }
  return lines;
}

function block(random, id) {
  const kind = random(10);
  if (kind < 5) {
    return {id, type: 'paragraph', parts: inlineParts(random)};
  }
  if (kind < 7) {
    return {id, type: 'code', lines: codeLines(random)};
  }
  if (kind === 7) {
    const items = [];
    const count = 3 + random(5);
    for (let i = 0; i < count; i++) {
      items.push({id: i, parts: inlineParts(random)});
    }
    return {id, type: 'list', items};
  }
  if (kind === 8) {
    const rows = [];
    const count = 3 + random(6);
    for (let i = 0; i < count; i++) {
      rows.push({
        id: i,
        name: IDENTIFIERS[random(IDENTIFIERS.length)],
        type: WORDS[random(30)],
        description: sentence(random, 5 + random(6)),
      });
    }
    return {id, type: 'table', rows};
  }
  return {
    id,
    type: 'callout',
    tone: random(2) === 0 ? 'note' : 'pitfall',
    title: sentence(random, 3),
    parts: inlineParts(random),
  };
}

export function createDocsContent() {
  const random = createRandom();
  const sections = [];
  let blockId = 0;
  for (let i = 0; i < 24; i++) {
    const title = sentence(random, 3 + random(3)).slice(0, -1);
    const blocks = [];
    const count = 8 + random(8);
    for (let j = 0; j < count; j++) {
      blocks.push(block(random, blockId++));
    }
    sections.push({id: 'section-' + i, title, blocks});
  }
  const groups = PAGE_GROUPS.map((title, i) => {
    const pages = [];
    for (let j = 0; j < 15; j++) {
      const name = sentence(random, 2 + random(2)).slice(0, -1);
      pages.push({id: i + '-' + j, title: name, href: '/learn/' + i + '/' + j});
    }
    return {id: i, title, pages};
  });
  return {
    title: 'Rendering on the server',
    currentPageId: '8-3',
    sections,
    groups,
  };
}
