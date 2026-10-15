/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// Behavior tests for state variables (docs/experiments/0007-state-variables.md):
// compiles components with the Rust React Compiler, renders them with React DOM
// and checks what they do. The fixtures in
// packages/babel-plugin-react-compiler-rust/src/__tests__/fixtures/experimental/state-variables
// cover the compiled output; these cover its behavior.
//
//   node --test scripts/test-state-variables.mjs
//
// Requires the Rust plugin to be built: `yarn snap --rust` from compiler/.

import {createRequire} from 'node:module';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'package.json'));

const {JSDOM} = require('jsdom');
const dom = new JSDOM('<!doctype html><div id="root"></div>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const babel = require('@babel/core');
const React = require('react');
const h = React.createElement;
const ReactDOMClient = require('react-dom/client');
const plugin = require(
  path.join(ROOT, 'packages/babel-plugin-react-compiler-rust/dist/index.js')
).default;

function compile(source) {
  const {code} = babel.transformSync(source, {
    filename: '/test.js',
    babelrc: false,
    configFile: false,
    parserOpts: {plugins: ['jsx']},
    plugins: [
      [
        plugin,
        {
          // The runtime of this target is the react-compiler-runtime package
          // of this repository, which has the functions that state variables
          // need. `react/compiler-runtime` would be the published React.
          target: '18',
          compilationMode: 'infer',
          panicThreshold: 'none',
          environment: {enableStateVariables: true},
        },
      ],
      require.resolve('@babel/plugin-transform-modules-commonjs'),
    ],
    presets: [[require.resolve('@babel/preset-react'), {runtime: 'automatic'}]],
  });
  return code;
}

// Compiles `source` and returns its exports. `scope` provides free variables.
function load(source, scope = {}) {
  const code = compile(source);
  assert.match(code, /useState/, 'the state variables were compiled');
  const module = {exports: {}};
  const names = Object.keys(scope);
  new Function('require', 'module', 'exports', ...names, code)(
    require,
    module,
    module.exports,
    ...names.map(name => scope[name])
  );
  return module.exports;
}

async function render(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = ReactDOMClient.createRoot(container);
  await React.act(() => root.render(element));
  return container;
}

async function click(node) {
  await React.act(() => {
    node.dispatchEvent(new window.MouseEvent('click', {bubbles: true}));
  });
}

test('an assignment in a handler updates the component', async () => {
  const {Counter} = load(`
    export function Counter() {
      let count = 0;
      return <button onClick={() => count++}>{count}</button>;
    }
  `);
  const container = await render(h(Counter));
  const button = container.querySelector('button');
  assert.equal(button.textContent, '0');
  await click(button);
  await click(button);
  assert.equal(button.textContent, '2');
});

test('consecutive writes in a handler compose, and a read follows them', async () => {
  const seen = [];
  const {Counter} = load(
    `
    export function Counter({step}) {
      let count = 10;
      return (
        <button
          onClick={() => {
            count++;
            count += step;
            seen.push(count);
          }}>
          {count}
        </button>
      );
    }
  `,
    {seen}
  );
  const container = await render(h(Counter, {step: 5}));
  const button = container.querySelector('button');
  await click(button);
  assert.equal(button.textContent, '16');
  await click(button);
  assert.equal(button.textContent, '22');
  assert.deepEqual(seen, [16, 22]);
});

test('a handler that only writes does not change between renders', async () => {
  const handlers = new Set();
  function Child({onPress, label}) {
    handlers.add(onPress);
    return h('button', {onClick: onPress}, label);
  }
  const {Counter} = load(
    `
    export function Counter() {
      let count = 0;
      return <Child onPress={() => { count++; }} label={count} />;
    }
  `,
    {Child}
  );
  const container = await render(h(Counter));
  const button = container.querySelector('button');
  await click(button);
  await click(button);
  assert.equal(button.textContent, '2');
  assert.equal(handlers.size, 1);
});

test('calls of the same function before a render compose', async () => {
  let increment;
  function Child({onPress, label}) {
    increment = onPress;
    return h('span', null, label);
  }
  const {Counter} = load(
    `
    export function Counter() {
      let count = 0;
      return <Child onPress={() => { count++; }} label={count} />;
    }
  `,
    {Child}
  );
  const container = await render(h(Counter));
  await React.act(() => {
    increment();
    increment();
    increment();
  });
  assert.equal(container.textContent, '3');
});

test('a function created once by an effect keeps updating the state', async () => {
  let tick;
  const {Timer} = load(
    `
    import {useEffect} from 'react';
    export function Timer() {
      let seconds = 0;
      useEffect(() => {
        subscribe(() => { seconds++; });
      }, []);
      return <span>{seconds}</span>;
    }
  `,
    {
      subscribe(callback) {
        tick = callback;
      },
    }
  );
  const container = await render(h(Timer));
  await React.act(() => tick());
  await React.act(() => tick());
  await React.act(() => tick());
  assert.equal(container.textContent, '3');
});

test('a hook with a state variable that calls no other hook', async () => {
  const {Toggle} = load(`
    function useToggle(initial) {
      let on = initial;
      return [on, () => { on = !on; }];
    }
    export function Toggle() {
      const [on, toggle] = useToggle(false);
      return <button onClick={toggle}>{on ? 'on' : 'off'}</button>;
    }
  `);
  const container = await render(h(Toggle));
  const button = container.querySelector('button');
  assert.equal(button.textContent, 'off');
  await click(button);
  assert.equal(button.textContent, 'on');
  await click(button);
  assert.equal(button.textContent, 'off');
});

test('an async function writes before and after it awaits', async () => {
  let resolve;
  const {Loader} = load(
    `
    export function Loader() {
      let data = 'none';
      let loading = false;
      async function onLoad() {
        loading = true;
        data = await fetchData();
        loading = false;
      }
      return <button onClick={onLoad}>{loading ? 'loading' : data}</button>;
    }
  `,
    {fetchData: () => new Promise(r => (resolve = r))}
  );
  const container = await render(h(Loader));
  const button = container.querySelector('button');
  await click(button);
  assert.equal(button.textContent, 'loading');
  await React.act(async () => resolve('loaded'));
  assert.equal(button.textContent, 'loaded');
});

test('functions nested in a handler share its view of the state', async () => {
  const seen = [];
  let later;
  const {Cart} = load(
    `
    export function Cart({items}) {
      let total = 0;
      let log = [];
      return (
        <button
          onClick={() => {
            items.forEach(item => { total += item.price; });
            seen.push(total);
            defer(() => {
              log = [...log, total];
              total = 0;
            });
          }}>
          {total}/{log.join(',')}
        </button>
      );
    }
  `,
    {
      seen,
      defer(callback) {
        later = callback;
      },
    }
  );
  const container = await render(h(Cart, {items: [{price: 2}, {price: 3}]}));
  const button = container.querySelector('button');
  await click(button);
  assert.equal(button.textContent, '5/');
  assert.deepEqual(seen, [5]);
  await React.act(() => later());
  assert.equal(button.textContent, '0/5');
});

test('several state variables, and handlers in a rendered list', async () => {
  const {Todos} = load(`
    export function Todos() {
      let text = 'first';
      let todos = [];
      const add = () => {
        todos = [...todos, {id: todos.length, title: text}];
        text = 'next';
      };
      return (
        <>
          <button id="add" onClick={add}>{text}</button>
          <ul>
            {todos.map(todo => (
              <li
                key={todo.id}
                onClick={() => { todos = todos.filter(other => other !== todo); }}>
                {todo.title}
              </li>
            ))}
          </ul>
        </>
      );
    }
  `);
  const container = await render(h(Todos));
  const add = container.querySelector('#add');
  await click(add);
  await click(add);
  assert.equal(add.textContent, 'next');
  assert.deepEqual(
    [...container.querySelectorAll('li')].map(li => li.textContent),
    ['first', 'next']
  );
  await click(container.querySelector('li'));
  assert.deepEqual(
    [...container.querySelectorAll('li')].map(li => li.textContent),
    ['next']
  );
});

test('a destructuring assignment, and a variable without an initial value', async () => {
  const {Swap} = load(`
    export function Swap() {
      let a = 1, b = 2, c;
      return (
        <button onClick={() => { [a, b] = [b, a]; c = a; }}>
          {a},{b},{String(c)}
        </button>
      );
    }
  `);
  const container = await render(h(Swap));
  const button = container.querySelector('button');
  assert.equal(button.textContent, '1,2,undefined');
  await click(button);
  assert.equal(button.textContent, '2,1,2');
});

test('the value of an assignment that a component uses', async () => {
  const results = [];
  function Child({onNext, onBump, label}) {
    return h(
      React.Fragment,
      null,
      h('button', {id: 'next', onClick: () => results.push(onNext())}, label),
      h('button', {id: 'bump', onClick: () => results.push(onBump())})
    );
  }
  const {Pair} = load(
    `
    export function Pair() {
      let a = 1;
      let b = 10;
      return <Child onNext={() => a++} onBump={() => (a = a + b * 2)} label={a} />;
    }
  `,
    {Child}
  );
  const container = await render(h(Pair));
  await click(container.querySelector('#next'));
  assert.equal(container.querySelector('#next').textContent, '2');
  await click(container.querySelector('#bump'));
  assert.equal(container.querySelector('#next').textContent, '22');
  assert.deepEqual(results, [1, 22]);
});

test('updaters are pure: StrictMode does not change the result', async () => {
  const {Counter} = load(`
    export function Counter() {
      let items = [];
      return (
        <button onClick={() => { items = [...items, items.length]; }}>
          {items.join(',')}
        </button>
      );
    }
  `);
  const container = await render(h(React.StrictMode, null, h(Counter)));
  const button = container.querySelector('button');
  await click(button);
  await click(button);
  assert.equal(button.textContent, '0,1');
});

test('a mutation updates the state without modifying it', async () => {
  const states = [];
  const {Todos} = load(
    `
    export function Todos() {
      let todos = [{id: 0, title: 'one', tags: ['a']}];
      states.push(todos);
      return (
        <>
          <button id="add" onClick={() => { todos.push({id: todos.length, title: 'more', tags: []}); }} />
          <button id="rename" onClick={() => { todos[0].title = 'renamed'; }} />
          <button id="tag" onClick={() => { todos[0].tags.push('b'); }} />
          <button id="remove" onClick={() => { todos.splice(0, 1); }} />
          {todos.map(todo => <li key={todo.id}>{todo.title}:{todo.tags.join('')}</li>)}
        </>
      );
    }
  `,
    {states}
  );
  const container = await render(h(Todos));
  const items = () =>
    [...container.querySelectorAll('li')].map(li => li.textContent);
  await click(container.querySelector('#add'));
  assert.deepEqual(items(), ['one:a', 'more:']);
  await click(container.querySelector('#rename'));
  await click(container.querySelector('#tag'));
  assert.deepEqual(items(), ['renamed:ab', 'more:']);
  // Every state is a new value, and the previous ones are as they were.
  assert.equal(new Set(states).size, states.length);
  assert.deepEqual(states[0], [{id: 0, title: 'one', tags: ['a']}]);
  // Only the values on the path to the update are copied.
  const beforeTag = states[states.length - 2];
  const afterTag = states[states.length - 1];
  assert.notEqual(afterTag[0], beforeTag[0]);
  assert.equal(afterTag[1], beforeTag[1]);
  await click(container.querySelector('#remove'));
  assert.deepEqual(items(), ['more:']);
});

test('mutations of an object, a Map and a Set', async () => {
  const {Profile} = load(`
    export function Profile() {
      let user = {name: 'Ada', address: {city: 'London'}, tags: new Set(), meta: new Map()};
      return (
        <>
          <button id="move" onClick={() => { user.address.city = 'Paris'; }} />
          <button id="forget" onClick={() => { delete user.name; }} />
          <button id="tag" onClick={() => { user.tags.add('x'); user.meta.set('k', 'v'); }} />
          <p>{String(user.name)},{user.address.city},{[...user.tags].join('')},{user.meta.get('k')}</p>
        </>
      );
    }
  `);
  const container = await render(h(Profile));
  await click(container.querySelector('#move'));
  await click(container.querySelector('#tag'));
  await click(container.querySelector('#forget'));
  assert.equal(container.querySelector('p').textContent, 'undefined,Paris,x,v');
});

test('an alias of a part of the state, read after it is updated', async () => {
  const seen = [];
  const {Counters} = load(
    `
    export function Counters({index}) {
      let counters = [{count: 0}, {count: 10}];
      return (
        <button
          onClick={() => {
            const counter = counters[index];
            counter.count++;
            counter.count++;
            seen.push(counter.count);
          }}>
          {counters.map(counter => counter.count).join(',')}
        </button>
      );
    }
  `,
    {seen}
  );
  const container = await render(h(Counters, {index: 1}));
  const button = container.querySelector('button');
  await click(button);
  assert.equal(button.textContent, '0,12');
  assert.deepEqual(seen, [12]);
});

test('mutations by calls of the same function before a render compose', async () => {
  let add;
  function Child({onAdd, label}) {
    add = onAdd;
    return h('span', null, label);
  }
  const {List} = load(
    `
    export function List() {
      let items = [];
      return <Child onAdd={item => { items.push(item); }} label={items.join(',')} />;
    }
  `,
    {Child}
  );
  const container = await render(h(List));
  await React.act(() => {
    add('a');
    add('b');
  });
  assert.equal(container.textContent, 'a,b');
});

test('a value that cannot be copied is not updated in place', async () => {
  class Point {
    x = 0;
  }
  const {Shape} = load(
    `
    export function Shape() {
      let point = new Point();
      return <button onClick={() => { point.x = 1; }}>{point.x}</button>;
    }
  `,
    {Point}
  );
  const container = await render(h(Shape));
  await assert.rejects(
    click(container.querySelector('button')),
    /cannot be copied/
  );
});

test('in development, a modification that is not an update throws', async () => {
  const {Todos} = load(`
    export function Todos() {
      let todos = [{id: 0, done: false}];
      return (
        <button
          onClick={() => {
            todos.push({id: 1, done: false});
            todos.find(todo => todo.id === 0).done = true;
          }}>
          {todos.length}
        </button>
      );
    }
  `);
  const container = await render(h(Todos));
  // React reports what an event handler throws to the window.
  const errors = [];
  const onError = event => {
    errors.push(event.error);
    event.preventDefault();
  };
  window.addEventListener('error', onError);
  await click(container.querySelector('button'));
  window.removeEventListener('error', onError);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /read only property 'done'/);
});

test('an assignment inside an expression', async () => {
  const results = [];
  function Child({onDouble, label}) {
    return h(
      'button',
      {id: 'double', onClick: () => results.push(onDouble())},
      label
    );
  }
  const {Counter} = load(
    `
    export function Counter({enabled}) {
      let count = 1;
      return (
        <>
          <button id="set" onClick={() => { enabled && (count = 5); }} />
          <button id="step" onClick={() => { enabled ? count++ : count--; }} />
          <Child onDouble={() => (count = count * 2)} label={count} />
        </>
      );
    }
  `,
    {Child}
  );
  const container = await render(h(Counter, {enabled: true}));
  const label = () => container.querySelector('#double').textContent;
  await click(container.querySelector('#set'));
  assert.equal(label(), '5');
  await click(container.querySelector('#step'));
  assert.equal(label(), '6');
  await click(container.querySelector('#double'));
  assert.equal(label(), '12');
  assert.deepEqual(results, [12]);
});

test('updates in loops, branches and a try block', async () => {
  const {Counter} = load(
    `
    export function Counter({items}) {
      let count = 0;
      let list = [];
      return (
        <>
          <button id="all" onClick={() => { for (const item of items) { list.push(item); count += item; } }} />
          <button id="try" onClick={() => { try { count++; fail(); } catch (e) { count = -1; } }} />
          <button id="while" onClick={() => { let n = 3; while (n--) { if (n % 2) { count++; } else { list.pop(); } } }} />
          <p>{count}:{list.join(',')}</p>
        </>
      );
    }
  `,
    {
      fail() {
        throw new Error('fail');
      },
    }
  );
  const container = await render(h(Counter, {items: [1, 2, 3]}));
  const text = () => container.querySelector('p').textContent;
  await click(container.querySelector('#all'));
  assert.equal(text(), '6:1,2,3');
  await click(container.querySelector('#while'));
  assert.equal(text(), '7:1');
  await click(container.querySelector('#try'));
  assert.equal(text(), '-1:1');
});

test('a mutation inside an expression whose value nothing uses', async () => {
  const {Selection} = load(`
    export function Selection({enabled}) {
      let selected = new Set(['b']);
      const toggle = id => { selected.has(id) ? selected.delete(id) : selected.add(id); };
      return (
        <>
          <button id="a" onClick={() => toggle('a')} />
          <button id="b" onClick={() => toggle('b')} />
          <button id="clear" onClick={() => { enabled && selected.clear(); }} />
          <p>{[...selected].sort().join(',')}</p>
        </>
      );
    }
  `);
  const container = await render(h(Selection, {enabled: true}));
  const text = () => container.querySelector('p').textContent;
  await click(container.querySelector('#a'));
  assert.equal(text(), 'a,b');
  await click(container.querySelector('#b'));
  assert.equal(text(), 'a');
  await click(container.querySelector('#clear'));
  assert.equal(text(), '');
});

test('a mutation through an optional chain', async () => {
  let setUser;
  function Reset({onReset}) {
    setUser = onReset;
    return null;
  }
  const {Profile} = load(
    `
    export function Profile() {
      let user = {tags: ['a'], address: null};
      return (
        <>
          <button id="tag" onClick={() => { user?.tags.push('b'); }} />
          <button id="line" onClick={() => { user?.address?.lines.push('x'); }} />
          <Reset onReset={value => { user = value; }} />
          <p>{user ? user.tags.join(',') + '|' + String(user.address?.lines) : 'none'}</p>
        </>
      );
    }
  `,
    {Reset}
  );
  const container = await render(h(Profile));
  const text = () => container.querySelector('p').textContent;
  await click(container.querySelector('#tag'));
  assert.equal(text(), 'a,b|undefined');
  // `address` is null: nothing happens, and nothing throws.
  await click(container.querySelector('#line'));
  assert.equal(text(), 'a,b|undefined');
  await React.act(() => setUser({tags: [], address: {lines: []}}));
  await click(container.querySelector('#line'));
  assert.equal(text(), '|x');
  await React.act(() => setUser(null));
  await click(container.querySelector('#tag'));
  assert.equal(text(), 'none');
});

test('an optional chain inside another expression', async () => {
  const {List} = load(`
    export function List({enabled}) {
      let items = ['a'];
      return (
        <>
          <button id="add" onClick={() => { enabled && items?.push('b'); }} />
          <button id="undo" onClick={() => { enabled ? items?.pop() : items?.reverse(); }} />
          <p>{items.join(',')}</p>
        </>
      );
    }
  `);
  const container = await render(h(List, {enabled: true}));
  const text = () => container.querySelector('p').textContent;
  await click(container.querySelector('#add'));
  await click(container.querySelector('#add'));
  assert.equal(text(), 'a,b,b');
  await click(container.querySelector('#undo'));
  assert.equal(text(), 'a,b');
});

test('a function with state variables is never left uncompiled', () => {
  // `panicThreshold: 'none'` skips a function that fails to compile. That
  // would leave `count` as a variable that is never updated.
  assert.throws(
    () =>
      compile(`
        export function Counter({show}) {
          if (!show) return null;
          let count = 0;
          return <button onClick={() => count++}>{count}</button>;
        }
      `),
    /Cannot declare a state variable conditionally/
  );
  assert.throws(
    () =>
      compile(`
        export function Counter() {
          'use no memo';
          let count = 0;
          return <button onClick={() => count++}>{count}</button>;
        }
      `),
    /Cannot skip the compilation of a function with state variables/
  );
});

test('the compatibility runtime copies own __proto__ and symbol properties safely', () => {
  const {
    unstable_copyForUpdate: copyForUpdate,
  } = require('react-compiler-runtime');
  const key = Symbol('value');
  const original = JSON.parse('{"__proto__":{"injected":true}}');
  original[key] = 1;
  Object.freeze(original);
  const copy = copyForUpdate(original);
  assert.equal(Object.getPrototypeOf(copy), Object.prototype);
  assert.equal(Object.hasOwn(copy, '__proto__'), true);
  assert.equal(copy.injected, undefined);
  assert.equal(copy[key], 1);
  copy[key] = 2;
  assert.equal(original[key], 1);
});

test('function-valued state is stored without invoking it', async () => {
  let calls = 0;
  const first = () => {
    calls++;
    return 'first';
  };
  const second = () => {
    calls++;
    return 'second';
  };
  const {FunctionState} = load(`
    export function FunctionState({initial, next}) {
      let value = initial;
      return <button onClick={() => { value = next; }}>{typeof value}</button>;
    }
  `);
  const container = await render(
    h(FunctionState, {initial: first, next: second})
  );
  const button = container.querySelector('button');
  assert.equal(button.textContent, 'function');
  assert.equal(calls, 0);
  await click(button);
  assert.equal(button.textContent, 'function');
  assert.equal(calls, 0);
});

test('function assignments capture the value before a later local reassignment', async () => {
  const first = () => 'first';
  const second = () => 'second';
  const {FunctionState} = load(`
    export function FunctionState({first, second}) {
      let value = null;
      return <button onClick={() => {
        let next = first;
        value = next;
        next = second;
      }}>{value === first ? 'first' : 'other'}</button>;
    }
  `);
  const container = await render(h(FunctionState, {first, second}));
  const button = container.querySelector('button');
  await click(button);
  assert.equal(button.textContent, 'first');
});
