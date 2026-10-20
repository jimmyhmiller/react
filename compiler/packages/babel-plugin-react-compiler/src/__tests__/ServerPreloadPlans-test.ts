/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {transformSync} from '@babel/core';
import path from 'node:path';
import BabelPlugin from '../Babel/BabelPlugin';
import {compileServerPreloadGraph} from '../Server/CompileServerPreloadGraph';
import type {PluginOptions, LoggerEvent} from '../Entrypoint/Options';

const runtime: typeof import('react-compiler-runtime/server') = require('react-compiler-runtime/server');
const resources = [
  {
    source: 'data',
    importSpecifierName: 'getProduct',
    result: 'immutable-data' as const,
  },
  {
    source: 'data',
    importSpecifierName: 'getSeller',
    result: 'immutable-data' as const,
  },
  {
    source: 'data',
    importSpecifierName: 'getReviews',
    result: 'primitive' as const,
  },
  {
    source: 'data',
    importSpecifierName: 'getFlags',
    result: 'primitive' as const,
  },
  {source: 'data', importSpecifierName: 'getRows', result: 'array' as const},
];
const imports = `import {getProduct, getSeller, getReviews, getFlags, getRows} from 'data';`;
const tick = (): Promise<void> => new Promise(resolve => setImmediate(resolve));
function deferred<T = any>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return {promise, resolve, reject};
}
function compile(source: string, options: PluginOptions = {}) {
  const events: Array<LoggerEvent> = [];
  const result = transformSync(source, {
    configFile: false,
    babelrc: false,
    filename: 'server.jsx',
    plugins: [
      [
        BabelPlugin,
        {
          outputMode: 'server',
          serverPreloads: {resources},
          logger: {
            logEvent(_filename: string, event: LoggerEvent) {
              events.push(event);
            },
          },
          ...options,
        },
      ],
    ],
    parserOpts: {plugins: ['jsx']},
  });
  return {code: result!.code!, events};
}
function load(code: string, modules: Record<string, unknown>) {
  const transformed = transformSync(code, {
    configFile: false,
    babelrc: false,
    presets: [
      [require('@babel/preset-react'), {pragma: 'h', pragmaFrag: 'Fragment'}],
    ],
    plugins: [require('@babel/plugin-transform-modules-commonjs')],
  });
  const exports: Record<string, any> = {};
  new Function('require', 'exports', 'h', 'Fragment', transformed!.code!)(
    (id: string) =>
      id === 'react-compiler-runtime/server'
        ? runtime
        : id === 'react'
          ? {Suspense: 'suspense', Fragment: 'fragment'}
          : modules[id],
    exports,
    (type: unknown, props: unknown, ...children: Array<unknown>) => ({
      type,
      props,
      children,
    }),
    'fragment',
  );
  return exports;
}

it('starts independent resources in source order and observes their original awaits', async () => {
  const {code} = compile(`${imports} export async function Page({id}) {
    const product = await getProduct(id);
    const reviews = await getReviews(id);
    return {product, reviews};
  }`);
  const product = deferred();
  const reviews = deferred();
  const trace: Array<string> = [];
  const api = load(code, {
    data: {
      getProduct: () => {
        trace.push('product');
        return product.promise;
      },
      getReviews: () => {
        trace.push('reviews');
        return reviews.promise;
      },
    },
  });
  const result = runtime.runWithServerPreloads({}, () =>
    api['Page']({id: 'id'}),
  );
  expect(trace).toEqual(['product', 'reviews']);
  reviews.resolve('reviews');
  product.resolve('product');
  await expect(result).resolves.toEqual({
    product: 'product',
    reviews: 'reviews',
  });
  expect(trace).toHaveLength(2);
});

it('unlocks a dependent request before an unrelated earlier await finishes', async () => {
  const {code} = compile(`${imports} export async function Page({id}) {
    const product = await getProduct(id);
    const flags = await getFlags(id);
    const seller = await getSeller(product.sellerId);
    return {flags, seller};
  }`);
  const product = deferred();
  const flags = deferred();
  const seller = deferred();
  const trace: Array<string> = [];
  const api = load(code, {
    data: {
      getProduct: () => {
        trace.push('product');
        return product.promise;
      },
      getFlags: () => {
        trace.push('flags');
        return flags.promise;
      },
      getSeller: (id: string) => {
        trace.push(`seller:${id}`);
        return seller.promise;
      },
    },
  });
  const result = runtime.runWithServerPreloads({}, () =>
    api['Page']({id: 'id'}),
  );
  expect(trace).toEqual(['product', 'flags']);
  product.resolve({sellerId: 'seller'});
  await tick();
  expect(trace).toEqual(['product', 'flags', 'seller:seller']);
  seller.resolve('seller');
  flags.resolve('flags');
  await expect(result).resolves.toEqual({flags: 'flags', seller: 'seller'});
});

it.each([true, false])(
  'preserves an early branch guard while overlapping its reads: %s',
  async show => {
    const {code} = compile(`${imports} export async function Page({id, show}) {
    const product = await getProduct(id);
    if (show) { const reviews = await getReviews(id); }
    return product;
  }`);
    const product = deferred();
    const reviews = jest.fn(() => Promise.resolve('reviews'));
    const api = load(code, {
      data: {getProduct: () => product.promise, getReviews: reviews},
    });
    const result = runtime.runWithServerPreloads({}, () =>
      api['Page']({id: 'id', show}),
    );
    expect(reviews).toHaveBeenCalledTimes(show ? 1 : 0);
    product.resolve('product');
    await result;
    expect(reviews).toHaveBeenCalledTimes(show ? 1 : 0);
  },
);

it('preloads a guarded child after prerequisite data resolves, without rendering it', async () => {
  const {code} = compile(`${imports}
    export async function Page({id}) {
      const product = await getProduct(id);
      const flags = await getFlags(id);
      return <>{product.show && <Reviews id={product.sellerId} />}</>;
    }
    async function Reviews({id}) { const reviews = await getReviews(id); recordRender(); return <div>{reviews}</div>; }
  `);
  const product = deferred();
  const flags = deferred();
  const reviews = jest.fn(() => Promise.resolve('reviews'));
  const api = load(code, {
    data: {
      getProduct: () => product.promise,
      getFlags: () => flags.promise,
      getReviews: reviews,
    },
  });
  const result = runtime.runWithServerPreloads({}, () =>
    api['Page']({id: 'id'}),
  );
  expect(reviews).not.toHaveBeenCalled();
  product.resolve({show: true, sellerId: 'seller'});
  await tick();
  expect(reviews).toHaveBeenCalledWith('seller');
  flags.resolve('flags');
  await result;
});

it('infers a visible async helper without speculatively executing its original body', async () => {
  const {code} = compile(`${imports}
    async function loadProduct(id) { const product = await getProduct(id); const reviews = await getReviews(id); return product; }
    export async function Page({id}) { const product = await loadProduct(id); const flags = await getFlags(id); return {product, flags}; }
  `);
  const product = deferred();
  const reviews = deferred();
  const flags = deferred();
  const trace: Array<string> = [];
  const api = load(code, {
    data: {
      getProduct: () => {
        trace.push('product');
        return product.promise;
      },
      getReviews: () => {
        trace.push('reviews');
        return reviews.promise;
      },
      getFlags: () => {
        trace.push('flags');
        return flags.promise;
      },
    },
  });
  const result = runtime.runWithServerPreloads({}, () =>
    api['Page']({id: 'id'}),
  );
  expect(trace).toEqual(['product', 'reviews', 'flags']);
  product.resolve('product');
  reviews.resolve('reviews');
  flags.resolve('flags');
  await result;
});

it('never skips authorization, including after a visible helper prefix', async () => {
  const {code} = compile(`${imports}
    async function loadProduct(id) { const product = await getProduct(id); await requireAccess(id); return product; }
    export async function Page({id}) { const product = await loadProduct(id); const reviews = await getReviews(id); return product; }
  `);
  const product = deferred();
  const reviews = jest.fn(() => Promise.resolve('reviews'));
  const api = load(code, {
    data: {getProduct: () => product.promise, getReviews: reviews},
  });
  const result = runtime.runWithServerPreloads({}, () =>
    api['Page']({id: 'id'}),
  );
  expect(reviews).not.toHaveBeenCalled();
  product.resolve('product');
  await expect(result).rejects.toThrow('requireAccess');
  expect(reviews).not.toHaveBeenCalled();
});

it('preloads immutable array iterations under the shared concurrency bound', async () => {
  const {code} = compile(`${imports} export async function Page({id}) {
    const rows = await getRows(id);
    for (const row of rows) { const review = await getReviews(row.id); }
    return 'done';
  }`);
  const pending = new Map<string, ReturnType<typeof deferred>>();
  const trace: Array<string> = [];
  const api = load(code, {
    data: {
      getRows: () => Promise.resolve([{id: 'a'}, {id: 'b'}, {id: 'c'}]),
      getReviews: (id: string) => {
        trace.push(id);
        const value = deferred();
        pending.set(id, value);
        return value.promise;
      },
    },
  });
  const result = runtime.runWithServerPreloads({maxConcurrent: 2}, () =>
    api['Page']({id: 'id'}),
  );
  await tick();
  expect(trace).toEqual(['a', 'b']);
  pending.get('a')!.resolve('a');
  await tick();
  expect(trace).toEqual(['a', 'b', 'c']);
  pending.get('b')!.resolve('b');
  pending.get('c')!.resolve('c');
  await expect(result).resolves.toBe('done');
});

it('keeps catches and finally effects at the original consumption sites', async () => {
  const {code} = compile(`${imports} export async function Page({id}) {
    try { const product = await getProduct(id); const reviews = await getReviews(id); }
    catch (error) { return 'caught'; }
    finally { recordFinally(); }
  }`);
  const product = deferred();
  const reviews = deferred();
  const api = load(
    code.replace('recordFinally();', 'globalThis.__preloadFinally();'),
    {
      data: {
        getProduct: () => product.promise,
        getReviews: () => reviews.promise,
      },
    },
  );
  const record = jest.fn();
  (globalThis as any).__preloadFinally = record;
  try {
    const result = runtime.runWithServerPreloads({}, () =>
      api['Page']({id: 'id'}),
    );
    reviews.reject(new Error('reviews'));
    await tick();
    expect(record).not.toHaveBeenCalled();
    product.resolve('product');
    await expect(result).resolves.toBe('caught');
    expect(record).toHaveBeenCalledTimes(1);
  } finally {
    delete (globalThis as any).__preloadFinally;
  }
});

it('leaves unknown getters and coercions out of speculative helper plans', () => {
  const {events} = compile(`${imports}
    function dangerous(value) { const id = value + ''; return id; }
    export async function Page({id}) { const product = await dangerous(id); const reviews = await getReviews(id); return reviews; }
  `);
  const summary = events.find(
    event =>
      event.kind === 'ServerPreloadSummary' && event.component === 'Page',
  );
  expect(summary).toBeUndefined();
});

it('automatically resolves child plans, helper plans and re-export aliases across a module graph', async () => {
  const sources: Record<string, string> = {
    '/app/Page.jsx': `${imports} import {Comments} from './barrel'; export async function Page({id}) { const product = await getProduct(id); return <Comments id={product.sellerId}/>; }`,
    '/app/barrel.js': `export {Reviews as Comments} from './Reviews';`,
    '/app/Reviews.jsx': `${imports} export async function Reviews({id}) { const reviews = await getReviews(id); return <div>{reviews}</div>; }`,
  };
  const graph = await compileServerPreloadGraph({
    entryPoints: ['/app/Page.jsx'],
    resources,
    load: async id => sources[id]!,
    resolve: async (specifier, importer) => {
      if (!specifier.startsWith('.')) {
        return null;
      }
      const base = path.posix.resolve(path.posix.dirname(importer), specifier);
      return (
        [base, base + '.js', base + '.jsx'].find(id => id in sources) ?? null
      );
    },
  });
  expect(graph.modules.get('/app/barrel.js')!.code).toContain(
    '__reactPreload_Comments',
  );
  const product = deferred();
  const reviews = jest.fn(() => Promise.resolve('reviews'));
  const data = {getProduct: () => product.promise, getReviews: reviews};
  const child = load(graph.modules.get('/app/Reviews.jsx')!.code, {data});
  const barrel = load(graph.modules.get('/app/barrel.js')!.code, {
    './Reviews': {...child, __esModule: true},
  });
  const parent = load(graph.modules.get('/app/Page.jsx')!.code, {
    data,
    './barrel': {...barrel, __esModule: true},
  });
  const result = runtime.runWithServerPreloads({}, () =>
    parent['Page']({id: 'id'}),
  );
  product.resolve({sellerId: 'seller'});
  await tick();
  expect(reviews).toHaveBeenCalledWith('seller');
  await result;
});

it('keeps reads after an early return behind that control dependency', async () => {
  const {code} = compile(`${imports} export async function Page({id, hide}) {
    if (hide) {return 'hidden';}
    const reviews = await getReviews(id);
    return reviews;
  }`);
  const reviews = jest.fn(() => Promise.resolve('reviews'));
  const api = load(code, {data: {getReviews: reviews}});
  await expect(
    runtime.runWithServerPreloads({}, () =>
      api['Page']({id: 'id', hide: true}),
    ),
  ).resolves.toBe('hidden');
  expect(reviews).not.toHaveBeenCalled();
});

it('observes a concurrently started helper rejection until the original earlier await consumes its error', async () => {
  const {code} = compile(`${imports}
    async function failHelper(id) {const value = await getReviews(id); return value;}
    export async function Page({id}) {const product = await getProduct(id); const reviews = await failHelper(id); return reviews;}
  `);
  const product = deferred();
  const reviews = deferred();
  const api = load(code, {
    data: {
      getProduct: () => product.promise,
      getReviews: () => reviews.promise,
    },
  });
  const result = runtime.runWithServerPreloads({}, () =>
    api['Page']({id: 'id'}),
  );
  const error = new Error('first product');
  const assertion = expect(result).rejects.toBe(error);
  reviews.reject(new Error('later helper'));
  await tick();
  product.reject(error);
  await assertion;
});

it('does not parallelize a loop whose body may return from the component', async () => {
  const {code} = compile(`${imports} export async function Page({id}) {
    const rows = await getRows(id);
    for (const row of rows) {if (row.hidden) {return 'hidden';} const reviews = await getReviews(row.id);}
    return 'done';
  }`);
  const reviews = jest.fn(() => Promise.resolve('reviews'));
  const api = load(code, {
    data: {
      getRows: () => Promise.resolve([{hidden: true, id: 'a'}, {id: 'b'}]),
      getReviews: reviews,
    },
  });
  await expect(
    runtime.runWithServerPreloads({}, () => api['Page']({id: 'id'})),
  ).resolves.toBe('hidden');
  expect(reviews).not.toHaveBeenCalled();
});

it('specializes a visible pure field helper using a proven immutable resource result', async () => {
  const {code} = compile(`${imports}
    function sellerKey(product) {return product.sellerId;}
    export async function Page({id}) {const product = await getProduct(id); const flags = await getFlags(id); const seller = await getSeller(sellerKey(product)); return seller;}
  `);
  const product = deferred();
  const flags = deferred();
  const seller = jest.fn(() => Promise.resolve('seller'));
  const api = load(code, {
    data: {
      getProduct: () => product.promise,
      getFlags: () => flags.promise,
      getSeller: seller,
    },
  });
  const result = runtime.runWithServerPreloads({}, () =>
    api['Page']({id: 'id'}),
  );
  product.resolve({sellerId: 'seller'});
  await tick();
  expect(seller).toHaveBeenCalledWith('seller');
  flags.resolve('flags');
  await expect(result).resolves.toBe('seller');
  expect(seller).toHaveBeenCalledTimes(1);
});

it('does not interpret a dropped speculative task as a domain error in a copied catch', async () => {
  const {code} = compile(`${imports} export async function Page({id}) {
    try {const product = await getProduct(id); const flags = await getFlags(id);}
    catch (error) {const fallback = await getReviews(id); return fallback;}
    return 'success';
  }`);
  const product = deferred();
  const flags = deferred();
  const fallback = jest.fn(() => Promise.resolve('fallback'));
  const api = load(code, {
    data: {
      getProduct: () => product.promise,
      getFlags: () => flags.promise,
      getReviews: fallback,
    },
  });
  const result = runtime.runWithServerPreloads(
    {maxConcurrent: 1, maxQueued: 0},
    () => api['Page']({id: 'id'}),
  );
  product.resolve('product');
  await tick();
  expect(fallback).not.toHaveBeenCalled();
  flags.resolve('flags');
  await expect(result).resolves.toBe('success');
  expect(fallback).not.toHaveBeenCalled();
});

it('supports anonymous concise default components without invoking their render bodies in a preload', async () => {
  const {code} = compile(
    `${imports} async function Reviews({id}) {const reviews = await getReviews(id); return <div>{reviews}</div>;} export default ({id}) => <Reviews id={id}/>;`,
  );
  const reviews = jest.fn(() => Promise.resolve('reviews'));
  const api = load(code, {data: {getReviews: reviews}});
  runtime.runWithServerPreloads({}, () => api['__reactPreload_default']('id'));
  await tick();
  expect(reviews).toHaveBeenCalledWith('id');
});

it('invalidates a mutable local data proof when an unknown call can change its elements', async () => {
  const {code} = compile(`${imports} export async function Page({id, mutate}) {
    const rows = [{id: 'initial'}];
    mutate(rows);
    const flags = await getFlags(id);
    for (const row of rows) {const reviews = await getReviews(row.id);}
    return flags;
  }`);
  const flags = deferred();
  const getter = jest.fn(() => 'changed');
  const api = load(code, {
    data: {
      getFlags: () => flags.promise,
      getReviews: () => Promise.resolve('reviews'),
    },
  });
  const result = runtime.runWithServerPreloads({}, () =>
    api['Page']({
      id: 'id',
      mutate: (rows: Array<any>) => {
        rows[0] = Object.defineProperty({}, 'id', {get: getter});
      },
    }),
  );
  await tick();
  expect(getter).not.toHaveBeenCalled();
  flags.resolve('flags');
  await result;
  expect(getter).toHaveBeenCalledTimes(1);
});

it('keeps bounded speculative loop cancellation out of domain-error catches', async () => {
  const {code} = compile(`${imports} export async function Page({id}) {
    try {const rows = await getRows(id); for (const row of rows) {const value = await getReviews(row.id);}}
    catch (error) {const fallback = await getFlags(id); return fallback;}
    return 'done';
  }`);
  const fallback = jest.fn(() => Promise.resolve('fallback'));
  const api = load(code, {
    data: {
      getRows: () => Promise.resolve([{id: 'a'}, {id: 'b'}, {id: 'c'}]),
      getReviews: () => Promise.resolve('reviews'),
      getFlags: fallback,
    },
  });
  await expect(
    runtime.runWithServerPreloads({maxPlanSteps: 3}, () =>
      api['Page']({id: 'id'}),
    ),
  ).resolves.toBe('done');
  expect(fallback).not.toHaveBeenCalled();
});

it('preserves an unknown resource value without re-reading its then accessor', async () => {
  const unknown = resources.map(resource =>
    resource.importSpecifierName === 'getProduct'
      ? {...resource, result: 'unknown' as const}
      : resource,
  );
  const {code} = compile(
    `${imports} export async function Page({id}) {const product = await getProduct(id); return product.name;}`,
    {serverPreloads: {resources: unknown}},
  );
  let accesses = 0;
  const value = Object.defineProperty({name: 'product'}, 'then', {
    get() {
      accesses++;
      return undefined;
    },
  });
  const native = Promise.resolve(value);
  const api = load(code, {data: {getProduct: () => native}});
  await expect(
    runtime.runWithServerPreloads({}, () => api['Page']({id: 'id'})),
  ).resolves.toBe('product');
  expect(accesses).toBe(1);
});

it('does not carry whole-props field proofs across an unknown mutating call', async () => {
  const {code} = compile(`${imports} export async function Page(props) {
    props.mutate(props);
    const flags = await getFlags(props.id);
    const reviews = await getReviews(props.id);
    return flags;
  }`);
  const flags = deferred();
  const getter = jest.fn(() => 'id');
  const api = load(code, {
    data: {
      getFlags: () => flags.promise,
      getReviews: () => Promise.resolve('reviews'),
    },
  });
  const props: Record<string, any> = {
    id: 'id',
    mutate(value: object) {
      Object.defineProperty(value, 'id', {get: getter});
    },
  };
  const result = runtime.runWithServerPreloads({}, () => api['Page'](props));
  expect(getter).toHaveBeenCalledTimes(1);
  flags.resolve('flags');
  await result;
  expect(getter).toHaveBeenCalledTimes(2);
});

it('reports advanced plans in analysis mode without adding runtime work or changing a concise body', () => {
  const {code, events} = compile(
    `${imports} export default async ({id}) => await getReviews(id);`,
    {serverPreloads: {resources, mode: 'analyze'}},
  );
  expect(code).not.toContain('react-compiler-runtime/server');
  expect(code).not.toContain('__reactPreload_default');
  expect(code).toContain('=> await getReviews(id)');
  expect(events.some(event => event.kind === 'ServerPreloadSummary')).toBe(
    true,
  );
});

it('preloads explicitly contracted cached bindings declared in the same module', async () => {
  const {code} = compile(
    `import {makeCached} from 'data';
    const getProduct = makeCached('product'); const getReviews = makeCached('reviews');
    export async function Page({id}) {const product=await getProduct(id); const reviews=await getReviews(id); return {product,reviews};}
  `,
    {
      serverPreloads: {
        resources: [],
        localResources: [{name: 'getProduct'}, {name: 'getReviews'}],
      },
    },
  );
  const product = deferred(),
    reviews = deferred();
  const trace: Array<string> = [];
  const api = load(code, {
    data: {
      makeCached: (name: string) => () => {
        trace.push(name);
        return name === 'product' ? product.promise : reviews.promise;
      },
    },
  });
  const result = runtime.runWithServerPreloads({}, () =>
    api['Page']({id: 'id'}),
  );
  expect(trace).toEqual(['product', 'reviews']);
  product.resolve('product');
  reviews.resolve('reviews');
  await expect(result).resolves.toEqual({
    product: 'product',
    reviews: 'reviews',
  });
});

it('rejects duplicate import contracts and missing local resource bindings', () => {
  expect(() =>
    compile('', {serverPreloads: {resources: [resources[0], resources[0]]}}),
  ).toThrow('Duplicate');
  expect(() =>
    compile('export function Page() {}', {
      serverPreloads: {resources: [], localResources: [{name: 'missing'}]},
    }),
  ).toThrow('stable module binding');
});

it('emits source-site dependency graphs and critical-path hints without adding false sequential edges', () => {
  const {code, events} = compile(`${imports}
    export async function Page({id}) {
      const product=await getProduct(id);
      const flags=await getFlags(id);
      const seller=await getSeller(product.sellerId);
      const reviews=await getReviews(seller.reviewId);
      return <div>{reviews}</div>;
    }`);
  const graph = events.find(event => event.kind === 'ServerPreloadGraph');
  if (graph?.kind !== 'ServerPreloadGraph') {
    throw new Error('missing graph');
  }
  const read = (name: string) =>
    graph.graph.nodes.find(
      node => node.kind === 'read' && node.label.includes(':' + name + ':'),
    )!;
  expect(graph.graph.edges).toContainEqual({
    from: read('getProduct').id,
    to: read('getSeller').id,
    kind: 'data',
  });
  expect(graph.graph.edges).toContainEqual({
    from: read('getSeller').id,
    to: read('getReviews').id,
    kind: 'data',
  });
  expect(
    graph.graph.edges.some(
      edge =>
        edge.from === read('getFlags').id && edge.to === read('getSeller').id,
    ),
  ).toBe(false);
  expect(read('getProduct').line).toBeGreaterThan(0);
  expect(code).toContain('criticalPath:');
});

it('uses dependency priorities to unlock a deeper child before unrelated queued speculation', async () => {
  const compiled = compile(`${imports}
    export async function Page({id}) {const product=await getProduct(id); const flags=await getFlags(id); return <Seller id={product.sellerId}/>;}
    async function Seller({id}) {const seller=await getSeller(id); const reviews=await getReviews(seller.reviewId); return <div>{reviews}</div>;}`);
  const product = deferred(),
    seller = deferred(),
    flags = deferred(),
    reviews = deferred();
  const trace: Array<string> = [];
  const source = load(compiled.code, {
    data: {
      getProduct: () => {
        trace.push('product');
        return product.promise;
      },
      getFlags: () => {
        trace.push('flags');
        return flags.promise;
      },
      getSeller: () => {
        trace.push('seller');
        return seller.promise;
      },
      getReviews: () => {
        trace.push('reviews');
        return reviews.promise;
      },
    },
  });
  await runtime.runWithServerPreloads({maxConcurrent: 1}, async () => {
    const page = source['Page']({id: 'id'});
    product.resolve({sellerId: 'seller'});
    await tick();
    expect(trace).toEqual(['product', 'seller']);
    seller.resolve({reviewId: 'review'});
    await tick();
    // Reviews and flags are tied leaves; FIFO breaks that tie.
    expect(trace).toEqual(['product', 'seller', 'flags']);
    flags.resolve('flags');
    await page;
    await tick();
    expect(trace).toEqual(['product', 'seller', 'flags', 'reviews']);
    reviews.resolve('reviews');
    await tick();
  });
});

it('connects loop bodies and catch fallbacks to their prerequisite reads in the lens graph', () => {
  const {events} = compile(`${imports}
    export async function Page({id}) {
      try {const rows=await getRows(id); for (const row of rows) {const review=await getReviews(row.id);}}
      catch (error) {const fallback=await getFlags(id); return fallback;}
      return <div/>;
    }`);
  const event = events.find(event => event.kind === 'ServerPreloadGraph');
  if (event?.kind !== 'ServerPreloadGraph') {
    throw new Error('missing graph');
  }
  const id = (name: string) =>
    event.graph.nodes.find(
      node => node.kind === 'read' && node.label.includes(':' + name + ':'),
    )!.id;
  expect(
    event.graph.edges.some(
      edge => edge.from === id('getRows') && edge.to === id('getReviews'),
    ),
  ).toBe(true);
  expect(
    event.graph.edges.some(
      edge =>
        edge.from === id('getRows') &&
        edge.to === id('getFlags') &&
        edge.kind === 'control',
    ),
  ).toBe(true);
});

const deferredPage = `${imports}
  import {Suspense} from 'react';
  export async function Page({id, locale}) {
    'use defer to suspense';
    const reviews = await getReviews(id);
    return <><h1>shell</h1><Suspense fallback={<p>loading</p>}><Reviews reviews={reviews} locale={locale}/></Suspense></>;
  }
  function Reviews({reviews, locale}) {return <p>{reviews}{locale}</p>;}
`;
function findElement(node: any, predicate: (value: any) => boolean): any {
  if (predicate(node)) {
    return node;
  }
  for (const child of node?.children ?? []) {
    const found = findElement(child, predicate);
    if (found != null) {
      return found;
    }
  }
  return null;
}

it.each([true, false])(
  'preserves an opt-in deferred prop with the runtime switch set to %s',
  async deferAwait => {
    const {code} = compile(deferredPage, {
      serverPreloads: {
        resources,
        features: {deferAwait: true, preloading: false},
      },
    });
    expect(code).toContain('shouldDeferAwait');
    const value = deferred();
    const getReviews = jest.fn(() => value.promise);
    const api = load(code, {data: {getReviews}});
    await runtime.runWithServerPreloads({features: {deferAwait}}, async () => {
      let ready = false;
      const page = api['Page']({id: 'id', locale: 'en'}).then((tree: any) => {
        ready = true;
        return tree;
      });
      await tick();
      expect(ready).toBe(deferAwait);
      if (!deferAwait) {
        value.resolve('reviews');
      }
      const tree = await page;
      const child = findElement(tree, node => typeof node?.type === 'function');
      if (deferAwait) {
        const result = child.type(child.props);
        let childReady = false;
        result.then(() => {
          childReady = true;
        });
        await tick();
        expect(childReady).toBe(false);
        value.resolve('reviews');
        const resolved = await result;
        expect(resolved.props).toEqual({reviews: 'reviews', locale: 'en'});
      } else {
        expect(child.props).toEqual({reviews: 'reviews', locale: 'en'});
      }
    });
    expect(getReviews).toHaveBeenCalledTimes(1);
  },
);

it.each([
  `const reviews=await getReviews(id); return <Reviews reviews={reviews}/>;`,
  `const reviews=await getReviews(id); return <Suspense><Reviews reviews={reviews} extra={unknown()}/></Suspense>;`,
  `const reviews=await getReviews(id); return <Suspense>{id && <Reviews reviews={reviews}/>}</Suspense>;`,
  `const reviews=await getReviews(id); return <Suspense><Reviews reviews={reviews} key={id}/></Suspense>;`,
  `const reviews=await getReviews(id); return <Suspense fallback={<Reviews reviews={reviews}/>}>ready</Suspense>;`,
  `try {const reviews=await getReviews(id); return <Suspense><Reviews reviews={reviews}/></Suspense>;} catch(e) {return 'caught';}`,
  `const reviews=await getReviews(id); return <Suspense><Reviews reviews={reviews}/><Reviews reviews={reviews}/></Suspense>;`,
  `const reviews=await getReviews(id); return <Opaque><Suspense><Reviews reviews={reviews}/></Suspense></Opaque>;`,
])('retains unsupported deferred-consumption patterns: %s', body => {
  const {code} = compile(
    `${imports} import {Suspense} from 'react'; export async function Page({id}) {'use defer to suspense'; ${body}} function Reviews({reviews}) {return <p>{reviews}</p>;}`,
    {serverPreloads: {resources, features: {deferAwait: true}}},
  );
  expect(code.includes('shouldDeferAwait')).toBe(false);
});

it('keeps source unchanged when all compilation features are disabled, and analysis emits no deferred code', () => {
  const off = compile(deferredPage, {
    serverPreloads: {
      resources,
      features: {preloading: false, deferAwait: false},
    },
  });
  expect(off.code.includes('react-compiler-runtime/server')).toBe(false);
  const analysis = compile(deferredPage, {
    serverPreloads: {resources, mode: 'analyze', features: {deferAwait: true}},
  });
  expect(analysis.code.includes('shouldDeferAwait')).toBe(false);
});

it('does not snapshot live imported props earlier while a deferred read is pending', () => {
  const source = `${imports} import {Suspense} from 'react'; import {locale} from 'settings';
    export async function Page({id}) {'use defer to suspense'; const reviews=await getReviews(id); return <Suspense><Reviews reviews={reviews} locale={locale}/></Suspense>;}
    function Reviews({reviews, locale}) {return <p>{reviews}{locale}</p>;}`;
  const {code} = compile(source, {
    serverPreloads: {resources, features: {deferAwait: true}},
  });
  expect(code.includes('shouldDeferAwait')).toBe(false);
});

it('keeps the original typed binding in the disabled deferred continuation', () => {
  const source = `${imports} import {Suspense} from 'react';
    export async function Page({id}: {id: string}) {'use defer to suspense'; const reviews: string=await getReviews(id); return <Suspense><Reviews reviews={reviews}/></Suspense>;}
    function Reviews({reviews}: {reviews: string}) {return <p>{reviews}</p>;}`;
  const result = transformSync(source, {
    configFile: false,
    babelrc: false,
    filename: 'server.tsx',
    parserOpts: {plugins: ['typescript', 'jsx']},
    plugins: [
      [
        BabelPlugin,
        {
          outputMode: 'server',
          serverPreloads: {
            resources,
            features: {preloading: false, deferAwait: true},
          },
        },
      ],
    ],
  });
  expect(result!.code).toMatch(/const reviews: string = \(await /);
  expect(result!.code).toContain('shouldDeferAwait');
});

it('executes automatically discovered single-file reads in parallel without a resource list', async () => {
  const pending = deferred<string>();
  const started: Array<string> = [];
  const source = `import {createServerRead} from 'react-compiler-runtime/server'; import {backend} from 'backend'; const get=createServerRead(backend); export async function Page({id}) {const a=await get(id); const b=await get('b'); return <div>{a}{b}</div>;}`;
  const compiled = compile(source, {serverPreloads: {}});
  expect(compiled.code).toContain('use react server preloads');
  const module = load(compiled.code, {
    backend: {
      backend: (id: string) => {
        started.push(id);
        return pending.promise;
      },
    },
  });
  const owner = runtime.createServerPreloadRequest();
  try {
    await owner.run(async () => {
      const render = module['Page']({id: 'a'});
      await tick();
      expect(started).toEqual(['a', 'b']);
      pending.resolve('ok');
      await render;
      expect(started).toEqual(['a', 'b']);
    });
  } finally {
    owner.close();
  }
});

it.each(['use client', 'use server', 'use no memo'])(
  'leaves excluded source declarations alone: %s',
  directive => {
    const result = compile(
      `'${directive}'; import {createServerRead} from 'react-compiler-runtime/server'; const get=createServerRead(backend, dynamicOptions); export async function Page({id}) {return <div>{await get(id)}</div>;}`,
      {serverPreloads: {}},
    );
    expect(result.code).not.toContain('use react server preloads');
  },
);

it.each([{mode: 'analyze' as const}, {noEmit: true}])(
  'does not emit work for source declarations in analysis/noEmit mode: %s',
  option => {
    const result = compile(
      `import {createServerRead} from 'react-compiler-runtime/server'; const get=createServerRead(backend); export async function Page({id}) {const value=await get(id); return <div>{value}</div>;}`,
      'mode' in option
        ? {serverPreloads: {mode: option.mode}}
        : {serverPreloads: {}, noEmit: true},
    );
    expect(result.code).not.toContain('use react server preloads');
    expect(result.code).not.toContain('__reactPreload');
  },
);

it.each([true, false])(
  'batches unified reads through helpers and dependent loops after authorization, enabled=%s',
  async enabled => {
    const auth = deferred<void>();
    const batches: Array<Array<number>> = [];
    const source = `
    import {createServerRead} from 'react-compiler-runtime/server';
    import {authorize, ids, single, bulk} from 'backend';
    const getIds=createServerRead(ids, {result:'array'});
    const getUser=createServerRead(single, {result:'immutable-data', maxBatchSize: 10, async batch(keys) {return bulk(keys);}});
    async function loadUser(id) {const user=await getUser(id); return user;}
    export async function Page({enabled}) {
      await authorize();
      const values=await getIds();
      if(enabled) {for(const id of values) {const user=await loadUser(id);}}
      return <div/>;
    }`;
    const single = jest.fn(async (id: number) => ({id}));
    const bulk = jest.fn(async (keys: ReadonlyArray<readonly [number]>) => {
      batches.push(keys.map(([id]) => id));
      return keys.map(([id]) => ({status: 'fulfilled' as const, value: {id}}));
    });
    const ids = jest.fn(async () => [1, 2, 3, 4]);
    const compiled = compile(source, {serverPreloads: {}});
    const module = load(compiled.code, {
      backend: {authorize: () => auth.promise, ids, single, bulk},
    });
    const owner = runtime.createServerPreloadRequest({maxConcurrent: 1});
    try {
      await owner.run(async () => {
        const render = module['Page']({enabled});
        await tick();
        expect(ids).not.toHaveBeenCalled();
        expect(bulk).not.toHaveBeenCalled();
        auth.resolve();
        await render;
      });
      expect(ids).toHaveBeenCalledTimes(1);
      expect(single).not.toHaveBeenCalled();
      expect(batches).toEqual(enabled ? [[1, 2, 3, 4]] : []);
    } finally {
      owner.close();
    }
  },
);

it('preserves original error precedence and catches for unified batch reads', async () => {
  const first = new Error('first source await');
  const second = new Error('second source await');
  const bulk = jest.fn(async (keys: ReadonlyArray<readonly [number]>) =>
    keys.map(([id]) => ({
      status: 'rejected' as const,
      reason: id === 1 ? first : second,
    })),
  );
  const caught = jest.fn();
  const source = `
    import {createServerRead} from 'react-compiler-runtime/server';
    import {single, bulk, caught} from 'backend';
    const get=createServerRead(single, {batch:bulk});
    export async function Page() {
      try {const a=await get(1); const b=await get(2); return <div/>;}
      catch(error) {caught(error); return <p/>;}
    }`;
  const single = jest.fn(async (_id: number) => {
    throw new Error('unexpected single');
  });
  const compiled = compile(source, {serverPreloads: {}});
  const module = load(compiled.code, {backend: {single, bulk, caught}});
  const owner = runtime.createServerPreloadRequest();
  try {
    await owner.run(() => module['Page']({}));
    expect(caught.mock.calls.map(([error]) => error)).toEqual([first]);
    expect(single).not.toHaveBeenCalled();
    expect(bulk.mock.calls.flatMap(([keys]) => keys.map(([id]) => id))).toEqual(
      [1, 2],
    );
  } finally {
    owner.close();
  }
});
