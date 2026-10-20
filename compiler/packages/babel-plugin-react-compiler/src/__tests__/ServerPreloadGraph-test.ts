/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import path from 'node:path';
import {compileServerPreloadGraph} from '../Server/CompileServerPreloadGraph';
import type {ServerPreloadGraphOptions} from '../Server/CompileServerPreloadGraph';

async function graph(
  sources: Record<string, string>,
  options: Partial<ServerPreloadGraphOptions> = {},
) {
  return compileServerPreloadGraph({
    entryPoints: ['/app/Page.jsx'],
    resources: [{source: 'data', importSpecifierName: 'read'}],
    load: async id => {
      if (!(id in sources)) {
        throw new Error('missing ' + id);
      }
      return sources[id];
    },
    resolve: async (source, importer) => {
      if (!source.startsWith('.') && !source.startsWith('/')) {
        return null;
      }
      const base = path.posix.resolve(path.posix.dirname(importer), source);
      return (
        [
          base,
          ...['.js', '.jsx', '.ts', '.tsx'].map(extension => base + extension),
        ].find(id => id in sources) ?? null
      );
    },
    ...options,
  });
}

it('converges for cyclic component imports and star re-exports', async () => {
  const result = await graph({
    '/app/Page.jsx': `import {read} from 'data'; import {Other} from './Other'; export async function Page({id}) {const value=await read(id); return <Other id={id}/>;}`,
    '/app/Other.jsx': `import {read} from 'data'; import {Page} from './Page'; export async function Other({id}) {const value=await read(id); return <Page id={id}/>;}`,
  });
  expect(result.modules.get('/app/Page.jsx')!.summaries.has('Page')).toBe(true);
  expect(result.modules.get('/app/Other.jsx')!.summaries.has('Other')).toBe(
    true,
  );
});

it('does not pick one side of an ambiguous star export', async () => {
  const result = await graph({
    '/app/Page.jsx': `export * from './left'; export * from './right';`,
    '/app/left.jsx': `import {read} from 'data'; export async function Child({id}) {const value=await read(id); return <div/>;}`,
    '/app/right.jsx': `import {read} from 'data'; export async function Child({id}) {const value=await read(id); return <div/>;}`,
  });
  expect(result.modules.get('/app/Page.jsx')!.summaries.has('Child')).toBe(
    false,
  );
});

it('recognizes the same export origin forwarded through two star paths', async () => {
  const result = await graph({
    '/app/Page.jsx': `export * from './left'; export * from './right';`,
    '/app/left.js': `export {Child} from './Child';`,
    '/app/right.js': `export {Child} from './Child';`,
    '/app/Child.jsx': `import {read} from 'data'; export async function Child({id}) {const value=await read(id); return <div/>;}`,
  });
  expect(result.modules.get('/app/Page.jsx')!.summaries.has('Child')).toBe(
    true,
  );
});

it.each(['use client', 'use server', 'use no memo'])(
  'does not expose plans through a %s module',
  async directive => {
    const result = await graph({
      '/app/Page.jsx': `export {Child} from './boundary';`,
      '/app/boundary.js': `'${directive}'; export {Child} from './Child';`,
      '/app/Child.jsx': `import {read} from 'data'; export async function Child({id}) {const value=await read(id); return <div/>;}`,
    });
    expect(result.modules.get('/app/Page.jsx')!.summaries.size).toBe(0);
    expect(result.modules.has('/app/Child.jsx')).toBe(false);
  },
);

it('does not turn type-only exports into runtime imports', async () => {
  const result = await graph({
    '/app/Page.jsx': `export type {Child} from './Child';`,
    '/app/Child.jsx': `import {read} from 'data'; export async function Child({id}) {const value=await read(id); return <div/>;}`,
  });
  expect(result.modules.size).toBe(1);
  expect(result.modules.get('/app/Page.jsx')!.code).not.toContain(
    '__reactPreload_',
  );
});

it('uses resolved resource identity rather than matching unrelated relative import spellings', async () => {
  const result = await graph(
    {
      '/app/Page.jsx': `import {read} from './data'; import {Other} from '../other/Other'; export async function Page({id}) {const value=await read(id); return <Other id={id}/>;}`,
      '/app/data.js': `export const read = externalRead;`,
      '/other/Other.jsx': `import {read} from './data'; export async function Other({id}) {const value=await read(id); return <div/>;}`,
      '/other/data.js': `export const read = unrelatedRead;`,
    },
    {resources: [{source: './data', importSpecifierName: 'read'}]},
  );
  expect(result.modules.get('/app/Page.jsx')!.summaries.has('Page')).toBe(true);
  expect(result.modules.get('/other/Other.jsx')!.summaries.size).toBe(0);
});

it('carries resource contracts through stable export aliases and barrels', async () => {
  const result = await graph(
    {
      '/app/Page.jsx': `import {load} from './barrel'; export async function Page({id}) {const value=await load(id); return <div/>;}`,
      '/app/barrel.js': `export {read as load} from './data';`,
      '/app/data.js': `const original = externalRead; export {original as read};`,
    },
    {resources: [{source: './data', importSpecifierName: 'read'}]},
  );
  expect(result.modules.get('/app/Page.jsx')!.summaries.has('Page')).toBe(true);
});

it('supports anonymous default components and TypeScript input', async () => {
  const result = await graph({
    '/app/Page.jsx': `export {default as Page} from './Child';`,
    '/app/Child.tsx': `import {read} from 'data'; export default async ({id}: {id: string}) => {const value = await read(id); return <div>{value}</div>;};`,
  });
  expect(result.modules.get('/app/Child.tsx')!.summaries.has('default')).toBe(
    true,
  );
  expect(result.modules.get('/app/Page.jsx')!.summaries.has('Page')).toBe(true);
});

it('honors source filtering during graph discovery and forwarding', async () => {
  const result = await graph(
    {
      '/app/Page.jsx': `export {Child} from './Child';`,
      '/app/Child.jsx': `import {read} from 'data'; export async function Child({id}) {const value=await read(id); return <div/>;}`,
    },
    {compilerOptions: {sources: id => !id.includes('Child')}},
  );
  expect(result.modules.get('/app/Page.jsx')!.summaries.size).toBe(0);
});

it('supports graph-wide analysis without exposing unavailable companion imports', async () => {
  const result = await graph(
    {
      '/app/Page.jsx': `import {read} from 'data'; import {Child} from './Child'; export async function Page({id}) {const value=await read(id); return <Child id={id}/>;}`,
      '/app/Child.jsx': `import {read} from 'data'; export async function Child({id}) {const value=await read(id); return <div/>;}`,
    },
    {preloads: {mode: 'analyze'}},
  );
  expect(result.modules.get('/app/Page.jsx')!.summaries.has('Page')).toBe(true);
  for (const module of result.modules.values()) {
    expect(module.code).not.toContain('react-compiler-runtime/server');
    expect(module.code).not.toContain('__reactPreload_');
  }
});

it('recognizes a contracted resource declared beside a component and keeps its implementation opaque', async () => {
  const result = await graph(
    {
      '/app/Page.jsx': `import {cache} from 'react'; export const read=cache(async id=>nativeRead(id)); export async function Page({id}) {const value=await read(id); return <div/>;}`,
    },
    {resources: [{source: './Page.jsx', importSpecifierName: 'read'}]},
  );
  expect(result.modules.get('/app/Page.jsx')!.summaries.has('Page')).toBe(true);
  expect(result.modules.get('/app/Page.jsx')!.summaries.has('read')).toBe(
    false,
  );
});

it('rejects contradictory result contracts that resolve to the same resource identity', async () => {
  await expect(
    graph(
      {
        '/app/Page.jsx': `export {read} from './data';`,
        '/app/data.js': `export const read=externalRead;`,
        '/app/barrel.js': `export {read as load} from './data';`,
      },
      {
        resources: [
          {source: './data', importSpecifierName: 'read', result: 'unknown'},
          {
            source: './Page.jsx',
            importSpecifierName: 'read',
            result: 'immutable-data',
          },
        ],
      },
    ),
  ).rejects.toThrow('Conflicting resource result contracts');
});

it('supports multiple local aliases of the same imported contract', async () => {
  const result = await graph({
    '/app/Page.jsx': `import {read as first, read as second} from 'data'; export async function Page({id}) {const one=await first(id); const two=await second(id); return <div/>;}`,
  });
  expect(result.modules.get('/app/Page.jsx')!.summaries.has('Page')).toBe(true);
});

it('preserves distinct canonical identities at opaque package boundaries without loading them', async () => {
  const sources: Record<string, string> = {
    '/app/Page.jsx': `import {read} from 'data'; import {Other} from '../other/Other'; export async function Page({id}) {const value=await read(id); return <Other id={id}/>;}`,
    '/other/Other.jsx': `import {read} from 'data'; export async function Other({id}) {const value=await read(id); return <div/>;}`,
  };
  const result = await graph(sources, {
    resolve: async (source, importer) =>
      source === 'data'
        ? {
            id: importer.startsWith('/app/')
              ? '/app/node_modules/data/index.js'
              : '/other/node_modules/data/index.js',
            opaque: true,
          }
        : source === '../other/Other'
          ? '/other/Other.jsx'
          : null,
  });
  expect(result.modules.size).toBe(2);
  expect(result.modules.get('/app/Page.jsx')!.summaries.has('Page')).toBe(true);
  expect(result.modules.get('/other/Other.jsx')!.summaries.size).toBe(0);
});

it('honors the default node_modules source exclusion when forwarding exports', async () => {
  const result = await graph({
    '/app/Page.jsx': `export {Child} from './node_modules/Child';`,
    '/app/node_modules/Child.jsx': `export {Child} from '../Child';`,
    '/app/Child.jsx': `import {read} from 'data'; export async function Child({id}) {const value=await read(id); return <div/>;}`,
  });
  expect(result.modules.get('/app/Page.jsx')!.summaries.size).toBe(0);
  expect(result.modules.has('/app/Child.jsx')).toBe(false);
});

it('treats CommonJS resource implementations as opaque export identities', async () => {
  const result = await graph(
    {
      '/app/Page.jsx': `import {read} from './data'; export async function Page({id}) {const value=await read(id); return <div/>;}`,
      '/app/data.js': `const {cache}=require('react'); exports.read=cache(async id=>nativeRead(id));`,
    },
    {resources: [{source: './data', importSpecifierName: 'read'}]},
  );
  expect(result.modules.get('/app/Page.jsx')!.summaries.has('Page')).toBe(true);
  expect(result.modules.get('/app/data.js')!.summaries.size).toBe(0);
  expect(result.modules.get('/app/data.js')!.code).not.toContain(
    'react-compiler-runtime',
  );
});

it('preserves excluded module source exactly, including quoted export aliases', async () => {
  const source = `export {"original" as "alias"} from './Child';`;
  const result = await graph(
    {'/app/Page.jsx': source},
    {compilerOptions: {sources: () => false}},
  );
  expect(result.modules.get('/app/Page.jsx')!.code).toBe(source);
});

it('links critical paths across helpers, aliases, and component boundaries', async () => {
  const result = await graph(
    {
      '/app/Page.jsx': `import {read} from 'data'; import {Child} from './barrel'; export async function Page({id}) {const value=await read(id); return <Child id={value.id}/>;}`,
      '/app/barrel.js': `export {Child} from './Child';`,
      '/app/Child.jsx': `import {helper} from './helper'; import {read} from 'data'; export async function Child({id}) {const value=await helper(id); const next=await read(value.id); return <div/>;}`,
      '/app/helper.js': `import {read} from 'data'; export async function helper(id) {const value=await read(id); return value;}`,
    },
    {
      resources: [
        {source: 'data', importSpecifierName: 'read', result: 'immutable-data'},
      ],
    },
  );
  const code = result.modules.get('/app/Page.jsx')!.code;
  const hint = code.match(/criticalPath: \[([^\]]+)\]/)![1];
  expect(hint).toContain('/app/Child.jsx');
  expect(hint).toContain('/app/helper.js');
  expect(
    result.dependencyGraph!.edges.some(edge =>
      edge.to.includes('/app/Child.jsx:Child@'),
    ),
  ).toBe(true);
});

it('builds serializable route manifests through export aliases with render preloads independently disabled', async () => {
  const result = await graph(
    {
      '/app/Page.jsx': `import {read} from 'data'; export async function Page({id}) {const value=await read(id); return <div/>;}`,
      '/app/routes.js': `export {Page as Product} from './Page';`,
    },
    {
      preloads: {features: {routeManifests: true, preloading: false}},
      routes: [{id: 'product', source: './routes', exportName: 'Product'}],
    },
  );
  expect(result.manifest?.routes).toEqual([
    {
      id: 'product',
      module: '/app/routes.js',
      exportName: 'Product',
      preload: '__reactPreload_Product',
      props: ['id'],
    },
  ]);
  expect(JSON.parse(JSON.stringify(result.manifest))).toEqual(result.manifest);
  expect(result.modules.get('/app/Page.jsx')!.code).toContain(
    '__reactPreload_Page',
  );
});

it('rejects before-render manifests whose original resource consumption bypasses the scheduler', async () => {
  await expect(
    graph(
      {
        '/app/Page.jsx': `import {read} from 'data'; export async function Page({id}) {return read(id);}`,
      },
      {
        preloads: {features: {routeManifests: true}},
        routes: [{id: 'page', source: './Page.jsx', exportName: 'Page'}],
      },
    ),
  ).rejects.toThrow('unmanaged original consumer');
});

it('does not advertise or load configured routes when their feature is disabled', async () => {
  const result = await graph(
    {'/app/Page.jsx': 'export const value=1;'},
    {routes: [{id: 'page', source: './unavailable', exportName: 'Page'}]},
  );
  expect(result.manifest).toBeUndefined();
});

it('discovers source-declared reads through aliases and barrels without resource configuration', async () => {
  const result = await graph(
    {
      '/app/Page.jsx': `import {getProduct} from './barrel'; export async function Page({id}) {const product=await getProduct(id); return <div>{product.name}</div>;}`,
      '/app/barrel.js': `export {product as getProduct} from './data';`,
      '/app/data.js': `import {createServerRead as read} from 'react-compiler-runtime/server'; import {db} from 'db'; const product=read(async id => db.product(id), {result:'immutable-data'}); export {product};`,
    },
    {resources: []},
  );
  expect(result.modules.get('/app/Page.jsx')!.code).toContain(
    'use react server preloads',
  );
  expect(result.modules.get('/app/Page.jsx')!.summaries.has('Page')).toBe(true);
  expect(result.dependencyGraph.nodes.some(node => node.kind === 'read')).toBe(
    true,
  );
});

it('discovers batched resource declarations and namespace factory imports', async () => {
  const result = await graph(
    {
      '/app/Page.jsx': `import * as resources from 'react-compiler-runtime/server'; const get=resources.createBatchedResource(async keys=>keys.map(([id])=>({status:'fulfilled',value:id})), {result:'primitive'}); export async function Page({id}) {const value=await get(id); return <div>{value}</div>;}`,
    },
    {resources: []},
  );
  expect(result.modules.get('/app/Page.jsx')!.summaries.has('Page')).toBe(true);
});

it.each([
  `import {createServerRead} from 'unrelated'; const get=createServerRead(async id=>id);`,
  `import {createServerRead} from 'react-compiler-runtime/server'; let get=createServerRead(async id=>id); get=other;`,
  `import type {createServerRead} from 'react-compiler-runtime/server'; const get=createServerRead(async id=>id);`,
])(
  'does not infer read contracts from unrelated, unstable or type-only factories: %s',
  async declaration => {
    const result = await graph(
      {
        '/app/Page.jsx': `${declaration} export async function Page({id}) {const value=await get(id); return <div/>;}`,
      },
      {resources: []},
    );
    expect(result.modules.get('/app/Page.jsx')!.summaries.has('Page')).toBe(
      false,
    );
  },
);

it('rejects dynamic contracts rather than silently assuming safety', async () => {
  await expect(
    graph(
      {
        '/app/Page.jsx': `import {createServerRead} from 'react-compiler-runtime/server'; const get=createServerRead(async id=>id, options); export async function Page({id}) {const value=await get(id); return <div/>;}`,
      },
      {resources: []},
    ),
  ).rejects.toThrow('static object');
});

it('rejects contradictory explicit and source result contracts', async () => {
  await expect(
    graph(
      {
        '/app/Page.jsx': `import {createServerRead} from 'react-compiler-runtime/server'; export const get=createServerRead(backend, {result:'primitive'}); export async function Page({id}) {const value=await get(id); return <div/>;}`,
      },
      {
        resources: [
          {
            source: '/app/Page.jsx',
            importSpecifierName: 'get',
            result: 'immutable-data',
          },
        ],
      },
    ),
  ).rejects.toThrow('Conflicting server read contract');
});

it('does not treat a destructured function property as the resource itself', async () => {
  const result = await graph(
    {
      '/app/Page.jsx': `import {createServerRead} from 'react-compiler-runtime/server'; const {name:get}=createServerRead(backend); export async function Page({id}) {const value=await get(id); return <div/>;}`,
    },
    {resources: []},
  );
  expect(result.modules.get('/app/Page.jsx')!.summaries.has('Page')).toBe(
    false,
  );
});

it('keeps unified batch implementations opaque while following resource aliases and barrels', async () => {
  const result = await graph(
    {
      '/app/Page.jsx': `import {get} from './barrel'; export async function Page({id}) {const value=await get(id); return <div>{value}</div>;}`,
      '/app/barrel.js': `export {resource as get} from './data';`,
      '/app/data.js': `import {createServerRead as resource} from 'react-compiler-runtime/server'; import {single, bulk} from 'native'; export const get=resource(single, {result:'primitive', maxBatchSize: 25, async batch(keys) {return bulk(keys);}}); export {get as resource};`,
    },
    {resources: []},
  );
  expect(result.modules.get('/app/Page.jsx')!.summaries.has('Page')).toBe(true);
  expect(result.modules.get('/app/data.js')!.code).not.toContain(
    '__reactPreload_batch',
  );
  expect(result.modules.get('/app/data.js')!.code).toContain(
    'return bulk(keys)',
  );
});

it.each([
  `get batch() {return bulk;}`,
  `set batch(value) {capture(value);}`,
  `[name]: bulk`,
  `...options`,
])('rejects unprovable unified resource options: %s', async option => {
  await expect(
    graph(
      {
        '/app/Page.jsx': `import {createServerRead} from 'react-compiler-runtime/server'; const get=createServerRead(single, {${option}}); export async function Page({id}) {const value=await get(id); return <div/>;}`,
      },
      {resources: []},
    ),
  ).rejects.toThrow('static object');
});
