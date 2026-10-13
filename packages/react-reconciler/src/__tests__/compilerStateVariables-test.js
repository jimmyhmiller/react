/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 * @jest-environment node
 */

'use strict';

let React;
let ReactNoop;
let act;
let copyForUpdate;
let freezeState;

// The code in these tests is written the way React Compiler emits it with
// enableStateVariables: see compiler/docs/experiments/0007-state-variables.md.
describe('state variables', () => {
  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ReactNoop = require('react-noop-renderer');
    ({act} = require('internal-test-utils'));
    const runtime = require('react/compiler-runtime');
    copyForUpdate = runtime.unstable_copyForUpdate;
    freezeState = runtime.unstable_freezeState;
  });

  describe('unstable_copyForUpdate()', () => {
    it('copies an array, and not its items', () => {
      const item = {id: 0};
      const array = [item];
      const copy = copyForUpdate(array);
      expect(copy).toEqual(array);
      expect(copy).not.toBe(array);
      expect(copy[0]).toBe(item);
      expect(Array.isArray(copy)).toBe(true);
    });

    it('copies a plain object, and not its properties', () => {
      const address = {city: 'London'};
      const object = {name: 'Ada', address};
      const copy = copyForUpdate(object);
      expect(copy).toEqual(object);
      expect(copy).not.toBe(object);
      expect(copy.address).toBe(address);
      expect(Object.getPrototypeOf(copy)).toBe(Object.prototype);
    });

    it('copies an object without a prototype', () => {
      const object = Object.create(null);
      object.key = 'value';
      const copy = copyForUpdate(object);
      expect(copy).not.toBe(object);
      expect(copy.key).toBe('value');
      expect(Object.getPrototypeOf(copy)).toBe(null);
    });

    it('copies a Map and a Set', () => {
      const map = new Map([['key', 'value']]);
      const mapCopy = copyForUpdate(map);
      expect(mapCopy).not.toBe(map);
      expect(mapCopy).toBeInstanceOf(Map);
      expect(Array.from(mapCopy)).toEqual([['key', 'value']]);

      const set = new Set(['value']);
      const setCopy = copyForUpdate(set);
      expect(setCopy).not.toBe(set);
      expect(setCopy).toBeInstanceOf(Set);
      expect(Array.from(setCopy)).toEqual(['value']);
    });

    it('copies a frozen value into one that can be modified', () => {
      const copy = copyForUpdate(Object.freeze([1]));
      copy.push(2);
      expect(copy).toEqual([1, 2]);
    });

    // Returning the value itself would modify the state in place, and the
    // update would be lost.
    it('throws for a value without a well defined copy', () => {
      class Point {}
      expect(() => copyForUpdate(new Point())).toThrow('cannot be copied');
      expect(() => copyForUpdate(1)).toThrow('cannot be copied');
      expect(() => copyForUpdate(null)).toThrow('cannot be copied');
      expect(() => copyForUpdate(undefined)).toThrow('cannot be copied');
      expect(() => copyForUpdate(() => {})).toThrow('cannot be copied');
    });
  });

  describe('unstable_freezeState()', () => {
    // @gate __DEV__
    it('freezes arrays and plain objects, deeply', () => {
      const state = [{tags: ['a'], address: {city: 'London'}}];
      freezeState(state);
      expect(Object.isFrozen(state)).toBe(true);
      expect(Object.isFrozen(state[0])).toBe(true);
      expect(Object.isFrozen(state[0].tags)).toBe(true);
      expect(Object.isFrozen(state[0].address)).toBe(true);
    });

    // @gate __DEV__
    it('does not freeze what is not the component’s to copy', () => {
      class Point {}
      const point = new Point();
      const map = new Map();
      const state = {point, map};
      freezeState(state);
      expect(Object.isFrozen(state)).toBe(true);
      expect(Object.isFrozen(point)).toBe(false);
      expect(Object.isFrozen(map)).toBe(false);
    });

    // @gate __DEV__
    it('accepts cycles and values that are not objects', () => {
      const state = {};
      state.self = state;
      freezeState(state);
      expect(Object.isFrozen(state)).toBe(true);
      freezeState(1);
      freezeState(null);
      freezeState(undefined);
    });

    // @gate !__DEV__
    it('does nothing in production', () => {
      const state = [{}];
      freezeState(state);
      expect(Object.isFrozen(state)).toBe(false);
    });
  });

  // Original code:
  //
  //   function Todos() {
  //     let todos = [{title: 'one', done: false}];
  //     toggle = () => { todos[0].done = !todos[0].done; };
  //     add = title => { todos.push({title, done: false}); };
  //     return todos.map(todo => todo.title + ':' + todo.done).join(',');
  //   }
  it('updates the state with the updaters that the compiler emits', async () => {
    let toggle;
    let add;
    const states = [];
    function Todos() {
      const [todos, setTodos] = React.useState([{title: 'one', done: false}]);
      freezeState(todos);
      states.push(todos);
      toggle = () => {
        const t0 = !todos[0].done;
        setTodos(todos$0 => {
          const t1 = copyForUpdate(todos$0);
          const t2 = copyForUpdate(t1[0]);
          t1[0] = t2;
          t2.done = t0;
          return t1;
        });
      };
      add = title => {
        const t0 = {title, done: false};
        setTodos(todos$0 => {
          const t1 = copyForUpdate(todos$0);
          t1.push(t0);
          return t1;
        });
      };
      return todos.map(todo => todo.title + ':' + todo.done).join(',');
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<Todos />));
    expect(root).toMatchRenderedOutput('one:false');

    await act(() => {
      add('two');
      add('three');
    });
    expect(root).toMatchRenderedOutput('one:false,two:false,three:false');

    await act(() => toggle());
    expect(root).toMatchRenderedOutput('one:true,two:false,three:false');

    // The previous states are as they were, and what was not updated is shared.
    const before = states[states.length - 2];
    const after = states[states.length - 1];
    expect(before[0].done).toBe(false);
    expect(after[0]).not.toBe(before[0]);
    expect(after[1]).toBe(before[1]);
  });
});
