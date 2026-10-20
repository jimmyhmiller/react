/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {transformSync} from '@babel/core';
import {AsyncLocalStorage} from 'node:async_hooks';
import BabelPluginReactCompiler from '../Babel/BabelPlugin';
import type {LoggerEvent, PluginOptions} from '../Entrypoint/Options';

const resources = [
  'getProduct',
  'getReviews',
  'getUserId',
  'getPosts',
  'getFlags',
].map(importSpecifierName => ({source: 'data', importSpecifierName}));
const imports = `import {getProduct, getReviews, getUserId, getPosts, getFlags} from 'data';`;

function compile(source: string, options: PluginOptions = {}) {
  const events: Array<LoggerEvent> = [];
  const result = transformSync(source, {
    filename: 'server.jsx',
    configFile: false,
    babelrc: false,
    presets: [
      [require('@babel/preset-react'), {pragma: 'h', pragmaFrag: 'Fragment'}],
    ],
    plugins: [
      [
        BabelPluginReactCompiler,
        {
          outputMode: 'server',
          serverPreloads: {resources, runtime: null},
          logger: {
            logEvent(_filename: string | null, event: LoggerEvent) {
              events.push(event);
            },
          },
          ...options,
        },
      ],
      require('@babel/plugin-transform-modules-commonjs'),
    ],
  });
  expect(result?.code).toBeDefined();
  return {code: result!.code!, events};
}

function load(code: string, modules: Record<string, unknown>) {
  const exports: Record<string, any> = {};
  const h = (type: unknown, props: unknown, ...children: Array<unknown>) => ({
    type,
    props,
    children,
  });
  // Execute generated output, including the ordinary component await sites.
  new Function('require', 'exports', 'h', 'Fragment', code)(
    (name: string) => {
      if (!(name in modules)) {
        throw new Error(`Unexpected import ${name}`);
      }
      return modules[name];
    },
    exports,
    h,
    'fragment',
  );
  return exports;
}

function deferred<T = string>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return {promise, resolve, reject};
}

function cached<T>(fn: (id: string) => T) {
  const results = new Map<string, {value: T} | {error: unknown}>();
  return (id: string): T => {
    let entry = results.get(id);
    if (entry === undefined) {
      try {
        entry = {value: fn(id)};
      } catch (error) {
        entry = {error};
      }
      results.set(id, entry);
    }
    if ('error' in entry) {
      throw entry.error;
    }
    return entry.value;
  };
}

const page = `${imports}
export async function Page({id}) {
  const product = await getProduct(id);
  const reviews = await getReviews(id);
  return {product, reviews};
}`;

it('starts independent cached reads together and leaves their consumption ordered', async () => {
  const {code, events} = compile(page);
  const product = deferred();
  const reviews = deferred();
  const trace: Array<string> = [];
  const api = load(code, {
    data: {
      getProduct: cached(() => {
        trace.push('product');
        return product.promise;
      }),
      getReviews: cached(() => {
        trace.push('reviews');
        return reviews.promise;
      }),
    },
  });
  const result = api['Page']({id: 'a'});
  expect(trace).toEqual(['reviews', 'product']);
  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({kind: 'ServerPreload', action: 'preload'}),
    ]),
  );
  reviews.resolve('reviews');
  product.resolve('product');
  await expect(result).resolves.toEqual({
    product: 'product',
    reviews: 'reviews',
  });
  expect(trace).toHaveLength(2);
  expect(code).not.toContain('compiler-runtime');
});

it('observes an early rejection but delivers the first awaited error', async () => {
  const {code} = compile(page);
  const product = deferred();
  const reviews = deferred();
  const first = new Error('product failed');
  const second = new Error('reviews failed');
  const api = load(code, {
    data: {
      getProduct: cached(() => product.promise),
      getReviews: cached(() => reviews.promise),
    },
  });
  const result = api['Page']({id: 'a'});
  const assertion = expect(result).rejects.toBe(first);
  reviews.reject(second);
  // A full event-loop turn would expose an unobserved rejection to Jest/Node.
  await new Promise(resolve => setImmediate(resolve));
  product.reject(first);
  await assertion;
});

it('delivers a later synchronous cached throw only at its original read', async () => {
  const {code} = compile(page);
  const product = deferred();
  const error = new Error('synchronous resource failure');
  let calls = 0;
  const api = load(code, {
    data: {
      getProduct: cached(() => product.promise),
      getReviews: cached(() => {
        calls++;
        throw error;
      }),
    },
  });
  const result = api['Page']({id: 'a'});
  let settled = false;
  result.catch(() => {
    settled = true;
  });
  await Promise.resolve();
  expect(settled).toBe(false);
  expect(calls).toBe(1);
  product.resolve('product');
  await expect(result).rejects.toBe(error);
  expect(calls).toBe(1);
});

it('starts independent work without awaiting it before a dependent request', async () => {
  const {code} = compile(`${imports}
    export async function Page({id}) {
      const userId = await getUserId(id);
      const posts = await getPosts(userId);
      const flags = await getFlags(id);
      return {posts, flags};
    }`);
  const user = deferred();
  const posts = deferred();
  const flags = deferred();
  const trace: Array<string> = [];
  const api = load(code, {
    data: {
      getUserId: cached(() => {
        trace.push('user');
        return user.promise;
      }),
      getPosts: cached(id => {
        trace.push(`posts:${id}`);
        return posts.promise;
      }),
      getFlags: cached(() => {
        trace.push('flags');
        return flags.promise;
      }),
    },
  });
  const result = api['Page']({id: 'a'});
  expect(trace).toEqual(['flags', 'user']);
  user.resolve('u');
  await Promise.resolve();
  expect(trace).toEqual(['flags', 'user', 'posts:u']);
  posts.resolve('posts');
  flags.resolve('flags');
  await expect(result).resolves.toEqual({posts: 'posts', flags: 'flags'});
});

it.each([
  'await requireAccess(id);',
  'requireAccess(id);',
  'if (id) { await requireAccess(id); }',
  'try { await requireAccess(id); } catch {}',
  'for (const value of [id]) { requireAccess(value); }',
])('does not cross an authorization/effect barrier: %s', barrier => {
  const {events} = compile(`${imports}
    async function Page({id}) {
      const product = await getProduct(id);
      ${barrier}
      const reviews = await getReviews(id);
      return reviews;
    }`);
  expect(
    events.filter(e => e.kind === 'ServerPreload' && e.action === 'preload'),
  ).toHaveLength(0);
});

it('allows overlap after authorization completes', async () => {
  const {code} = compile(`${imports}
    export async function Page({id}) {
      await requireAccess(id);
      const product = await getProduct(id);
      const reviews = await getReviews(id);
      return {product, reviews};
    }`);
  expect(code.indexOf('await requireAccess')).toBeLessThan(
    code.indexOf('try {'),
  );
  expect(code).not.toContain('__reactPreload_Page');
});

it.each([
  'if (show) { const reviews = await getReviews(id); }',
  'const reviews = await getReviews(options.id);',
  'const reviews = await getReviews(makeId(id));',
  'const reviews = await getReviews(...ids);',
  'const reviews = await getReviews(id); id = "changed";',
])('retains guarded or unsafe arguments: %s', tail => {
  const {events} = compile(`${imports}
    async function Page({id, show, options, ids}) {
      const product = await getProduct(id);
      ${tail}
      return product;
    }`);
  expect(
    events.filter(e => e.kind === 'ServerPreload' && e.action === 'preload'),
  ).toHaveLength(0);
});

it('does not mistake a shadowed function for an eligible imported resource', () => {
  const {events} = compile(`${imports}
    async function Page({id, getReviews}) {
      const product = await getProduct(id);
      const reviews = await getReviews(id);
      return reviews;
    }`);
  expect(
    events.filter(e => e.kind === 'ServerPreload' && e.action === 'preload'),
  ).toHaveLength(0);
});

it('preloads a local child without executing the component', async () => {
  const {code} = compile(`${imports}
    export async function Page({id}) {
      const product = await getProduct(id);
      return <Reviews id={id} />;
    }
    async function Reviews({id}) {
      const reviews = await getReviews(id);
      recordRender();
      return <div>{reviews}</div>;
    }`);
  const trace: Array<string> = [];
  const product = deferred();
  const api = load(code, {
    data: {
      getProduct: cached(() => {
        trace.push('product');
        return product.promise;
      }),
      getReviews: cached(() => {
        trace.push('reviews');
        return Promise.resolve('reviews');
      }),
    },
  });
  const result = api['Page']({id: 'a'});
  expect(trace).toEqual(['reviews', 'product']);
  product.resolve('product');
  await expect(result).resolves.toEqual(
    expect.objectContaining({props: {id: 'a'}}),
  );
});

it('does not use a child resource name shadowed in the parent', () => {
  const {events} = compile(`${imports}
    async function Page({id, getReviews}) {
      const product = await getProduct(id);
      return <Reviews id={id} />;
    }
    async function Reviews({id}) {
      const reviews = await getReviews(id);
      return <div>{reviews}</div>;
    }`);
  expect(
    events.filter(e => e.kind === 'ServerPreload' && e.action === 'preload'),
  ).toHaveLength(0);
});

it.each([
  '<>{show && <Reviews id={id} />}</>',
  '<Reviews {...props} />',
  '<Wrapper><Reviews id={id} /></Wrapper>',
  '<Reviews id={makeId(id)} />',
])('does not speculate through opaque JSX: %s', jsx => {
  const {events} = compile(`${imports}
    async function Page({id, show, props}) {
      const product = await getProduct(id);
      return ${jsx};
    }
    async function Reviews({id}) {
      const reviews = await getReviews(id);
      return <div>{reviews}</div>;
    }`);
  expect(
    events.filter(e => e.kind === 'ServerPreload' && e.action === 'preload'),
  ).toHaveLength(0);
});

it('composes generated preload exports across modules using emitted metadata', async () => {
  const child = compile(`${imports}
    export default async function Reviews({id: reviewId}) {
      const reviews = await getReviews(reviewId);
      return <div>{reviews}</div>;
    }`);
  const summary = child.events.find(e => e.kind === 'ServerPreloadSummary');
  expect(summary).toMatchObject({
    component: 'default',
    preload: '__reactPreload_default',
    props: ['id'],
  });
  if (summary?.kind !== 'ServerPreloadSummary') {
    throw new Error('Missing summary');
  }
  const parent = compile(
    `${imports}
    import Reviews from './Reviews';
    export async function Page({id}) {
      const product = await getProduct(id);
      return <Reviews id={id} />;
    }`,
    {
      serverPreloads: {
        resources,
        runtime: null,
        mode: 'compile',
        components: [
          {
            source: './Reviews',
            importSpecifierName: summary.component,
            preload: summary.preload,
            props: summary.props,
          },
        ],
      },
    },
  );
  const trace: Array<string> = [];
  const product = deferred();
  const data = {
    getProduct: cached(() => {
      trace.push('product');
      return product.promise;
    }),
    getReviews: cached(() => {
      trace.push('reviews');
      return Promise.resolve('reviews');
    }),
  };
  const childApi = load(child.code, {data});
  const parentApi = load(parent.code, {
    data,
    './Reviews': {...childApi, __esModule: true},
  });
  const result = parentApi['Page']({id: 'a'});
  expect(trace).toEqual(['reviews', 'product']);
  product.resolve('product');
  await result;
  await childApi['default']({id: 'a'});
  expect(trace).toEqual(['reviews', 'product']);
});

it('does not export preloads that bypass defaults or an authorization prefix', () => {
  const {events} = compile(`${imports}
    export async function Defaults({id = requireAccess()}) {
      const reviews = await getReviews(id);
      return <div>{reviews}</div>;
    }
    export async function Authorized({id}) {
      await requireAccess(id);
      const reviews = await getReviews(id);
      return <div>{reviews}</div>;
    }`);
  expect(events.filter(e => e.kind === 'ServerPreloadSummary')).toHaveLength(0);
});

it('does not introduce a shared cache across requests', async () => {
  const {code} = compile(page);
  const storage = new AsyncLocalStorage<Map<string, Promise<string>>>();
  const trace: Array<string> = [];
  const requestRead = (name: string) => (id: string) => {
    const cache = storage.getStore();
    if (cache === undefined) {
      throw new Error('Outside request');
    }
    const key = `${name}:${id}`;
    let result = cache.get(key);
    if (result === undefined) {
      trace.push(key);
      result = Promise.resolve(key);
      cache.set(key, result);
    }
    return result;
  };
  const api = load(code, {
    data: {
      getProduct: requestRead('product'),
      getReviews: requestRead('reviews'),
    },
  });
  await Promise.all([
    storage.run(new Map(), () => api['Page']({id: 'a'})),
    storage.run(new Map(), () => api['Page']({id: 'a'})),
  ]);
  expect(trace.filter(x => x === 'reviews:a')).toHaveLength(2);
  expect(trace.filter(x => x === 'product:a')).toHaveLength(2);
});

it('analysis mode reports opportunities without changing execution', async () => {
  const {code, events} = compile(page, {
    serverPreloads: {resources, runtime: null, components: [], mode: 'analyze'},
  });
  expect(
    events.some(e => e.kind === 'ServerPreload' && e.action === 'preload'),
  ).toBe(true);
  expect(code).not.toContain('try {');
  expect(code).not.toContain('__reactPreload_Page');
  const trace: Array<string> = [];
  const product = deferred();
  const api = load(code, {
    data: {
      getProduct: cached(() => {
        trace.push('product');
        return product.promise;
      }),
      getReviews: cached(() => {
        trace.push('reviews');
        return Promise.resolve('reviews');
      }),
    },
  });
  const result = api['Page']({id: 'a'});
  expect(trace).toEqual(['product']);
  product.resolve('product');
  await result;
  expect(trace).toEqual(['product', 'reviews']);
});

it.each(['use client', 'use server', 'use no memo', 'use no forget'])(
  'honors module directive %s',
  directive => {
    const {events} = compile(`'${directive}'; ${page}`);
    expect(
      events.filter(e => e.kind === 'ServerPreload' && e.action === 'preload'),
    ).toHaveLength(0);
  },
);

it('requires a separate server build and validates resource configuration', () => {
  expect(() => compile(page, {outputMode: 'client'})).toThrow(
    'serverPreloads requires',
  );
  expect(() =>
    compile(page, {
      serverPreloads: {
        resources: [{source: '', importSpecifierName: 'getReviews'}],
      } as any,
    }),
  ).toThrow('Invalid serverPreloads');
});

it.each([
  '<>{requireAccess(id)}<Reviews id={id} /></>',
  '<><Reviews id={id} />{requireAccess(id)}</>',
  '<div title={requireAccess(id)}><Reviews id={id} /></div>',
  '<><Unknown {...getProps()} /><Reviews id={id} /></>',
])('does not bypass parent JSX evaluation: %s', jsx => {
  const {events} = compile(`${imports}
    async function Page({id}) {
      const product = await getProduct(id);
      return ${jsx};
    }
    async function Reviews({id}) {
      const reviews = await getReviews(id);
      return <div>{reviews}</div>;
    }`);
  expect(
    events.filter(e => e.kind === 'ServerPreload' && e.action === 'preload'),
  ).toHaveLength(0);
});

it('composes local plans through multiple component levels', async () => {
  const {code, events} = compile(`${imports}
    export async function Page({id}) {
      const product = await getProduct(id);
      return <Middle id={id} />;
    }
    function Middle({id}) { return <Reviews id={id} />; }
    async function Reviews({id}) {
      const reviews = await getReviews(id);
      return <div>{reviews}</div>;
    }`);
  expect(events).toContainEqual(
    expect.objectContaining({
      kind: 'ServerPreloadSummary',
      component: 'Page',
      props: ['id'],
    }),
  );
  const product = deferred();
  const getReviews = jest.fn(cached(() => Promise.resolve('reviews')));
  const api = load(code, {
    data: {
      getProduct: cached(() => product.promise),
      getReviews,
    },
  });
  const result = api['Page']({id: 'a'});
  expect(getReviews).toHaveBeenCalledWith('a');
  product.resolve('product');
  await result;
  api['__reactPreload_Page']('a');
  expect(getReviews).toHaveBeenCalledTimes(2);
});

it('handles recursive components without recursively executing preload plans', () => {
  const {code} = compile(`${imports}
    export async function Tree({id}) {
      const product = await getProduct(id);
      return <Tree id={id} />;
    }`);
  const getProduct = jest.fn(cached(() => Promise.resolve('product')));
  const api = load(code, {data: {getProduct}});
  expect(() => api['__reactPreload_Tree']('a')).not.toThrow();
  expect(getProduct).toHaveBeenCalledTimes(1);
});

it('supports imported resource aliases and exported component aliases', () => {
  const {code, events} = compile(`
    import {getReviews as readReviews} from 'data';
    async function Reviews({id}) {
      const reviews = await readReviews(id);
      return <div>{reviews}</div>;
    }
    export {Reviews as Comments};
  `);
  expect(events).toContainEqual(
    expect.objectContaining({
      kind: 'ServerPreloadSummary',
      component: 'Comments',
      preload: '__reactPreload_Comments',
    }),
  );
  expect(code).toContain('__reactPreload_Comments');
});

it('does not replace an existing preload export', () => {
  const {code, events} = compile(`${page}
    export const __reactPreload_Page = 'user-defined';`);
  expect(events).toContainEqual(
    expect.objectContaining({kind: 'ServerPreload', action: 'skip'}),
  );
  expect(code).toContain('user-defined');
  expect(events.filter(e => e.kind === 'ServerPreloadSummary')).toHaveLength(0);
});

it('preserves a pending child promise without awaiting it in the parent', async () => {
  const {code} = compile(`${imports}
    export async function Page({id}) {
      const product = await getProduct(id);
      return <Reviews id={id} />;
    }
    async function Reviews({id}) {
      const reviews = await getReviews(id);
      return <div>{reviews}</div>;
    }`);
  const pending = deferred();
  const api = load(code, {
    data: {
      getProduct: cached(() => Promise.resolve('product')),
      getReviews: cached(() => pending.promise),
    },
  });
  await expect(api['Page']({id: 'a'})).resolves.toEqual(
    expect.objectContaining({props: {id: 'a'}}),
  );
  pending.resolve('reviews');
});

it('emits the cached preload pattern without altering the original awaits', () => {
  expect(compile(page).code).toMatchSnapshot();
});

it.each([
  [
    "import {Suspense} from 'react';",
    '<Suspense fallback={<div>Loading</div>}><Reviews id={id} /></Suspense>',
  ],
  [
    "import {Fragment as Group} from 'react';",
    '<Group><Reviews id={id} /></Group>',
  ],
  [
    "import * as React from 'react';",
    '<React.Suspense fallback={<div>Loading</div>}><Reviews id={id} /></React.Suspense>',
  ],
])('preloads through known React boundaries: %s', (reactImport, jsx) => {
  const {events} = compile(`${imports} ${reactImport}
    async function Page({id}) {
      const product = await getProduct(id);
      return ${jsx};
    }
    async function Reviews({id}) {
      const reviews = await getReviews(id);
      return <div>{reviews}</div>;
    }`);
  expect(
    events.filter(e => e.kind === 'ServerPreload' && e.action === 'preload'),
  ).toHaveLength(1);
});

it('does not preload fallback data or trust shadowed React boundaries', () => {
  const {events} = compile(`${imports}
    import {Suspense} from 'react';
    async function Page({id}) {
      const product = await getProduct(id);
      return <Suspense fallback={<Reviews id={id} />}><div /></Suspense>;
    }
    async function Shadowed({id, Suspense}) {
      const product = await getProduct(id);
      return <Suspense><Reviews id={id} /></Suspense>;
    }
    async function Reviews({id}) {
      const reviews = await getReviews(id);
      return <div>{reviews}</div>;
    }`);
  expect(
    events.filter(e => e.kind === 'ServerPreload' && e.action === 'preload'),
  ).toHaveLength(0);
});

it('does not insert duplicate preloads when compiling generated output again', () => {
  const first = compile(page);
  const second = compile(first.code);
  expect(second.code).toBe(first.code);
  expect(second.events).toContainEqual(
    expect.objectContaining({
      kind: 'ServerPreload',
      action: 'skip',
      reason: 'Server preload plans are already compiled',
    }),
  );
});

it('honors function opt-outs, source filters and analysis-only noEmit', () => {
  const optedOut = compile(`${imports}
    async function Page({id}) {
      'use no memo';
      const product = await getProduct(id);
      const reviews = await getReviews(id);
      return reviews;
    }`);
  expect(
    optedOut.events.filter(
      e => e.kind === 'ServerPreload' && e.action === 'preload',
    ),
  ).toHaveLength(0);
  expect(compile(page, {sources: []}).events).toHaveLength(0);
  const noEmit = compile(page, {noEmit: true});
  expect(noEmit.code).not.toContain('try {');
  expect(
    noEmit.events.some(
      e => e.kind === 'ServerPreload' && e.action === 'preload',
    ),
  ).toBe(true);
  expect(compile(page, {compilationMode: 'annotation'}).events).toHaveLength(0);
});

it('treats unproven resource argument evaluation as an ordering barrier', () => {
  const {events} = compile(`${imports}
    export async function Page({id}) {
      const product = await getProduct(globalKey);
      const reviews = await getReviews(id);
      return reviews;
    }`);
  // A global identifier can invoke a getter. Eligibility of getProduct does not
  // establish that evaluating globalKey is safe to speculate across.
  expect(
    events.filter(e => e.kind === 'ServerPreload' && e.action === 'preload'),
  ).toHaveLength(0);
  expect(events.filter(e => e.kind === 'ServerPreloadSummary')).toHaveLength(0);
});
