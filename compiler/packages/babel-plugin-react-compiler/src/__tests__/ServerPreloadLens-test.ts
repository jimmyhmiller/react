/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {JSDOM} from 'jsdom';
import {renderServerPreloadComparison} from '../Server/ServerPreloadComparison';
import {renderServerPreloadLens} from '../Server/ServerPreloadLens';
import {serverPreloadCriticalPaths} from '../Server/ServerPreloadAnalysis';

it('renders an interactive offline lens with filtering, dependency details, and safe source text', () => {
  const id = '</script><script>window.injected=true</script>';
  const html = renderServerPreloadLens({
    title: '<unsafe title>',
    sources: {
      '/app/Page.jsx':
        'async function Page() {\n  const product = await getProduct();\n}',
    },
    graph: {
      nodes: [
        {
          id: 'product',
          kind: 'read',
          label: 'getProduct',
          file: '/app/Page.jsx',
          line: 2,
          column: 4,
        },
        {
          id,
          kind: 'read',
          label: id,
          file: '/app/Child.jsx',
          line: 3,
          column: 0,
        },
      ],
      edges: [{from: 'product', to: id, kind: 'data'}],
    },
    diagnostics: [
      {
        kind: 'ServerPreload',
        file: '/app/Page.jsx',
        fnLoc: null,
        loc: null,
        action: 'retain',
        reason: 'Unknown call: authorize()',
      },
    ],
    trace: {
      events: [
        {
          kind: 'started',
          taskId: 1,
          operationId: 1,
          batchSize: 20,
          resource: 'product',
          priority: 2,
          active: 1,
          queued: 0,
          elapsedMs: 1,
          speculative: true,
        },
        {
          kind: 'fulfilled',
          taskId: 1,
          operationId: 1,
          resource: 'product',
          priority: 2,
          active: 0,
          queued: 0,
          elapsedMs: 5,
          speculative: true,
        },
      ],
    },
  });
  const dom = new JSDOM(html, {runScripts: 'dangerously'});
  const {document, Event} = dom.window;
  expect(document.title).toBe('<unsafe title>');
  expect(dom.window['injected']).toBeUndefined();
  expect(document.querySelector('#stats')!.textContent).toContain(
    'Backend operations',
  );
  expect(document.querySelector('tbody')!.textContent).toContain('20 keys');
  (
    document.querySelector('[data-tab="dependencies"]') as HTMLButtonElement
  ).click();
  expect(document.querySelectorAll('tbody tr')).toHaveLength(2);
  (document.querySelector('tbody tr') as HTMLTableRowElement).click();
  expect(document.querySelector('#detail')!.textContent).toContain('Unlocks:');
  expect(document.querySelector('#detail')!.textContent).toContain(
    '2:   const product = await getProduct();',
  );
  expect(document.querySelector('#detail')!.textContent).toContain(id);
  const filter = document.querySelector('#filter') as HTMLInputElement;
  filter.value = 'getProduct';
  filter.dispatchEvent(new Event('input'));
  expect(document.querySelectorAll('tbody tr')).toHaveLength(1);
  filter.value = '';
  filter.dispatchEvent(new Event('input'));
  (
    document.querySelector('[data-tab="boundaries"]') as HTMLButtonElement
  ).click();
  expect(document.querySelector('tbody')!.textContent).toContain('authorize()');
  dom.window.close();
});

it('bounds recursive critical paths and handles long chains without recursive graph traversal', () => {
  const nodes = Array.from({length: 1000}, (_, index) => ({
    id: String(index),
    kind: 'read' as const,
    label: String(index),
    file: 'test',
    line: null,
    column: null,
  }));
  const edges = nodes.slice(1).map((node, index) => ({
    from: String(index),
    to: node.id,
    kind: 'data' as const,
  }));
  const paths = serverPreloadCriticalPaths({nodes, edges});
  expect(paths.get('0')).toHaveLength(1000);
  const cycle = serverPreloadCriticalPaths({
    nodes: nodes.slice(0, 3),
    edges: [
      {from: '0', to: '1', kind: 'call'},
      {from: '1', to: '0', kind: 'call'},
      {from: '1', to: '2', kind: 'data'},
    ],
  });
  expect(new Set(cycle.get('0')).size).toBe(3);
});

it('switches among measured profiles and never invents values for missing combinations', async () => {
  const base = {
    preloading: false,
    batching: false,
    criticalPath: false,
    routeManifests: false,
    deferAwait: false,
    lens: false,
  };
  const metrics = {
    samples: 3,
    shellMs: 200,
    criticalContentMs: 300,
    completionMs: 350,
    operations: 26,
    peakConcurrency: 2,
    completionRangeMs: [345, 355] as [number, number],
  };
  const html = renderServerPreloadComparison([
    {...metrics, features: base},
    {
      ...metrics,
      operations: 7,
      completionMs: 220,
      features: {...base, batching: true},
    },
    {
      ...metrics,
      operations: 7,
      shellMs: 5,
      completionMs: 150,
      features: {
        preloading: true,
        batching: true,
        criticalPath: true,
        routeManifests: true,
        deferAwait: true,
        lens: true,
      },
    },
  ]);
  const dom = new JSDOM(html, {runScripts: 'dangerously'});
  const document = dom.window.document;
  expect(document.querySelector('#metrics')!.textContent).toContain('150.0 ms');
  (document.querySelector('#baseline') as HTMLButtonElement).click();
  expect(document.querySelector('#metrics')!.textContent).toContain('350.0 ms');
  (document.querySelector('#batching') as HTMLInputElement).click();
  expect(document.querySelector('#metrics')!.textContent).toContain('220.0 ms');
  (document.querySelector('#routeManifests') as HTMLInputElement).click();
  expect(document.querySelector('#status')!.textContent).toContain(
    'has not been measured',
  );
  expect(document.querySelectorAll('#metrics tbody tr')).toHaveLength(0);
  dom.window.close();
});
