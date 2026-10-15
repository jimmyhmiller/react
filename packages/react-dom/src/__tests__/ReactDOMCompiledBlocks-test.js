/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails reactcore
 */

'use strict';

let React;
let ReactDOM;
let ReactDOMClient;
let act;
let assertLog;
let assertConsoleErrorDev;
let Scheduler;

// Most tests render the same UI twice: once as ordinary host elements and once
// as a compiled block, and assert that the DOM is identical after every step.
describe('ReactDOMCompiledBlocks', () => {
  let blockContainer;
  let jsxContainer;
  let blockRoot;
  let jsxRoot;

  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ReactDOM = require('react-dom');
    ReactDOMClient = require('react-dom/client');
    Scheduler = require('scheduler');
    ({act, assertLog, assertConsoleErrorDev} = require('internal-test-utils'));

    document.body.innerHTML = '';
    blockContainer = document.createElement('div');
    jsxContainer = document.createElement('div');
    document.body.appendChild(blockContainer);
    document.body.appendChild(jsxContainer);
    blockRoot = ReactDOMClient.createRoot(blockContainer);
    jsxRoot = ReactDOMClient.createRoot(jsxContainer);
  });

  function block(template, values, key) {
    return React.createElement(template, {v: values, key});
  }

  async function renderBoth(blockElement, jsxElement) {
    await act(() => {
      blockRoot.render(blockElement);
      jsxRoot.render(jsxElement);
    });
    expect(blockContainer.innerHTML).toBe(jsxContainer.innerHTML);
  }

  // @gate enableCompiledBlocks
  it('renders static structure, dynamic props and text', async () => {
    // <li className={c}><div className="view"><label>{title}</label>
    // <button className="destroy" /></div></li>
    const template = ReactDOM.unstable_createBlockTemplate([
      'li',
      null,
      [['className', 0]],
      [
        [
          'div',
          {className: 'view'},
          null,
          [
            ['label', null, null, [{t: 1}]],
            ['button', {className: 'destroy'}, null, []],
          ],
        ],
      ],
    ]);
    function Jsx({className, title}) {
      return (
        <li className={className}>
          <div className="view">
            <label>{title}</label>
            <button className="destroy" />
          </div>
        </li>
      );
    }
    await renderBoth(
      block(template, ['completed', 'Buy milk']),
      <Jsx className="completed" title="Buy milk" />,
    );
    const li = blockContainer.firstChild;
    const label = li.querySelector('label');
    await renderBoth(
      block(template, [null, 42]),
      <Jsx className={null} title={42} />,
    );
    // Updates patch the existing nodes.
    expect(blockContainer.firstChild).toBe(li);
    expect(li.querySelector('label')).toBe(label);
    expect(label.textContent).toBe('42');
  });

  // @gate enableCompiledBlocks
  it('renders slots at their positions and reconciles their children', async () => {
    // <section><h1>title</h1>{a}<p>middle</p>{b}{c}<footer>end</footer>{d}</section>
    const template = ReactDOM.unstable_createBlockTemplate([
      'section',
      null,
      null,
      [
        ['h1', null, null, ['title']],
        {s: 0},
        ['p', null, null, ['middle']],
        {s: 1},
        {s: 2},
        ['footer', null, null, ['end']],
        {s: 3},
      ],
    ]);
    function Jsx({a, b, c, d}) {
      return (
        <section>
          <h1>title</h1>
          {a}
          <p>middle</p>
          {b}
          {c}
          <footer>end</footer>
          {d}
        </section>
      );
    }
    const steps = [
      [null, null, null, null],
      ['text', <i key="i">i</i>, <b key="b">b</b>, [1, 2]],
      [null, [<span key="x">x</span>, <span key="y">y</span>], null, 'tail'],
      [
        <em key="e">e</em>,
        [<span key="y">y</span>, <span key="x">x</span>],
        <b key="b">b</b>,
        null,
      ],
      [null, null, <b key="b">b2</b>, [<u key="u">u</u>]],
    ];
    for (let i = 0; i < steps.length; i++) {
      const [a, b, c, d] = steps[i];
      await renderBoth(
        block(template, [a, b, c, d]),
        <Jsx a={a} b={b} c={c} d={d} />,
      );
    }
  });

  // @gate enableCompiledBlocks
  it('mounts slot content inside a newly created block in order', async () => {
    const template = ReactDOM.unstable_createBlockTemplate([
      'div',
      null,
      null,
      [{s: 0}, {s: 1}, ['hr', null, null, []], {s: 2}],
    ]);
    function Child({label}) {
      return <span>{label}</span>;
    }
    await renderBoth(
      <main>
        {block(template, [
          <Child label="a" />,
          'b',
          [<Child key="c" label="c" />, 'd'],
        ])}
      </main>,
      <main>
        <div>
          <Child label="a" />
          {'b'}
          <hr />
          {[<Child key="c" label="c" />, 'd']}
        </div>
      </main>,
    );
  });

  // @gate enableCompiledBlocks
  it('dispatches events from block nodes, slots and portals in order', async () => {
    const log = [];
    const portalContainer = document.createElement('div');
    document.body.appendChild(portalContainer);
    // <div onClick={outer}><button onClick={inner}>{slot}</button></div>
    const template = ReactDOM.unstable_createBlockTemplate([
      'div',
      {className: 'outer'},
      [
        ['onClick', 0],
        ['onClickCapture', 1],
      ],
      [['button', null, [['onClick', 2]], [{s: 3}]]],
    ]);
    function App({stopAtInner}) {
      return (
        <section
          onClick={e => {
            log.push('section:' + e.currentTarget.tagName);
          }}>
          {block(template, [
            e => log.push('outer:' + e.currentTarget.className),
            () => log.push('outer-capture'),
            e => {
              log.push('inner:' + e.currentTarget.tagName);
              if (stopAtInner) {
                e.stopPropagation();
              }
            },
            <>
              <span id="slot-child" onClick={() => log.push('slot-child')}>
                child
              </span>
              {ReactDOM.createPortal(
                <em id="portaled" onClick={() => log.push('portaled')}>
                  portal
                </em>,
                portalContainer,
              )}
            </>,
          ])}
        </section>
      );
    }
    await act(() => blockRoot.render(<App stopAtInner={false} />));

    blockContainer.querySelector('button').click();
    expect(log).toEqual([
      'outer-capture',
      'inner:BUTTON',
      'outer:outer',
      'section:SECTION',
    ]);
    log.length = 0;

    blockContainer.querySelector('#slot-child').click();
    expect(log).toEqual([
      'outer-capture',
      'slot-child',
      'inner:BUTTON',
      'outer:outer',
      'section:SECTION',
    ]);
    log.length = 0;

    // Events from a portal bubble through the React tree, i.e. through the
    // block nodes that contain the slot.
    portalContainer.querySelector('#portaled').click();
    expect(log).toEqual([
      'outer-capture',
      'portaled',
      'inner:BUTTON',
      'outer:outer',
      'section:SECTION',
    ]);
    log.length = 0;

    await act(() => blockRoot.render(<App stopAtInner={true} />));
    blockContainer.querySelector('#slot-child').click();
    expect(log).toEqual(['outer-capture', 'slot-child', 'inner:BUTTON']);
  });

  // @gate enableCompiledBlocks
  it('updates event listeners', async () => {
    const log = [];
    const template = ReactDOM.unstable_createBlockTemplate([
      'button',
      null,
      [['onClick', 0]],
      ['go'],
    ]);
    await act(() =>
      blockRoot.render(block(template, [() => log.push('first')])),
    );
    blockContainer.firstChild.click();
    await act(() =>
      blockRoot.render(block(template, [() => log.push('second')])),
    );
    blockContainer.firstChild.click();
    await act(() => blockRoot.render(block(template, [null])));
    blockContainer.firstChild.click();
    expect(log).toEqual(['first', 'second']);
  });

  // @gate enableCompiledBlocks
  it('reorders, inserts and deletes keyed blocks', async () => {
    const template = ReactDOM.unstable_createBlockTemplate([
      'li',
      null,
      [['data-id', 0]],
      [{t: 1}, ['b', null, null, [{s: 2}]]],
    ]);
    function List({items, asBlocks}) {
      return (
        <ul>
          {items.map(item =>
            asBlocks ? (
              block(template, [item.id, item.label, item.extra], item.id)
            ) : (
              <li key={item.id} data-id={item.id}>
                {item.label}
                <b>{item.extra}</b>
              </li>
            ),
          )}
        </ul>
      );
    }
    const sequences = [
      [
        {id: 'a', label: 'A', extra: null},
        {id: 'b', label: 'B', extra: 'x'},
      ],
      [
        {id: 'c', label: 'C', extra: <i>c</i>},
        {id: 'b', label: 'B2', extra: 'x'},
        {id: 'a', label: 'A', extra: null},
      ],
      [{id: 'a', label: 'A', extra: 'y'}],
      [],
      [
        {id: 'd', label: 'D', extra: null},
        {id: 'a', label: 'A', extra: 'z'},
      ],
    ];
    for (let i = 0; i < sequences.length; i++) {
      const items = sequences[i];
      await renderBoth(
        <List items={items} asBlocks={true} />,
        <List items={items} asBlocks={false} />,
      );
    }
  });

  // @gate enableCompiledBlocks
  it('runs effects in slots and cleans them up when the block is deleted', async () => {
    const template = ReactDOM.unstable_createBlockTemplate([
      'div',
      null,
      null,
      [{s: 0}],
    ]);
    function Effectful() {
      React.useEffect(() => {
        Scheduler.log('mount');
        return () => Scheduler.log('unmount');
      }, []);
      return <span>effect</span>;
    }
    await act(() => blockRoot.render(block(template, [<Effectful />])));
    assertLog(['mount']);
    expect(blockContainer.innerHTML).toBe('<div><span>effect</span></div>');
    await act(() => blockRoot.render(null));
    assertLog(['unmount']);
    expect(blockContainer.innerHTML).toBe('');
  });

  // @gate enableCompiledBlocks
  it('nests blocks inside slots', async () => {
    const inner = ReactDOM.unstable_createBlockTemplate([
      'span',
      null,
      [['title', 0]],
      [{t: 1}],
    ]);
    const outer = ReactDOM.unstable_createBlockTemplate([
      'div',
      null,
      null,
      [['p', null, null, ['before']], {s: 0}, ['p', null, null, ['after']]],
    ]);
    function Jsx({items}) {
      return (
        <div>
          <p>before</p>
          {items.map(item => (
            <span key={item} title={item}>
              {item}
            </span>
          ))}
          <p>after</p>
        </div>
      );
    }
    const sequence = [['a'], ['b', 'a'], [], ['c']];
    for (let i = 0; i < sequence.length; i++) {
      const items = sequence[i];
      await renderBoth(
        block(outer, [items.map(item => block(inner, [item, item], item))]),
        <Jsx items={items} />,
      );
    }
  });

  // @gate enableCompiledBlocks
  it('hides and reveals a block inside a suspended boundary', async () => {
    const template = ReactDOM.unstable_createBlockTemplate([
      'div',
      {id: 'block'},
      null,
      [{s: 0}],
    ]);
    let resolve;
    const promise = new Promise(r => {
      resolve = r;
    });
    let resolved = false;
    promise.then(() => {
      resolved = true;
    });
    function Suspender({shouldSuspend}) {
      if (shouldSuspend && !resolved) {
        throw promise;
      }
      return 'content';
    }
    function App({shouldSuspend}) {
      return (
        <React.Suspense fallback={<span>loading</span>}>
          {block(template, [<Suspender shouldSuspend={shouldSuspend} />])}
        </React.Suspense>
      );
    }
    await act(() => blockRoot.render(<App shouldSuspend={false} />));
    expect(blockContainer.innerHTML).toBe('<div id="block">content</div>');
    await act(() =>
      React.startTransition(() =>
        blockRoot.render(<App shouldSuspend={false} />),
      ),
    );
    // A non-transition update that suspends shows the fallback and hides the
    // existing content.
    await act(() => blockRoot.render(<App shouldSuspend={true} />));
    expect(blockContainer.innerHTML).toBe(
      '<div id="block" style="display: none;">content</div><span>loading</span>',
    );
    await act(() => resolve());
    expect(blockContainer.innerHTML).toBe(
      '<div id="block" style="">content</div>',
    );
  });

  // @gate enableCompiledBlocks
  it('restores the root style of a block when revealing it', async () => {
    // <div style={style}>{children}</div>, and the same with a static style.
    const dynamicTemplate = ReactDOM.unstable_createBlockTemplate([
      'div',
      null,
      [['style', 0]],
      [{s: 1}],
    ]);
    const staticTemplate = ReactDOM.unstable_createBlockTemplate([
      'section',
      {style: {display: 'grid'}},
      null,
      [{s: 0}],
    ]);
    let resolve;
    const promise = new Promise(r => {
      resolve = r;
    });
    let resolved = false;
    promise.then(() => {
      resolved = true;
    });
    function Suspender({shouldSuspend}) {
      if (shouldSuspend && !resolved) {
        throw promise;
      }
      return 'content';
    }
    const style = {display: 'flex', color: 'red'};
    function BlockApp({shouldSuspend}) {
      return (
        <React.Suspense fallback={<span>loading</span>}>
          {block(dynamicTemplate, [
            style,
            <Suspender shouldSuspend={shouldSuspend} />,
          ])}
          {block(staticTemplate, [<Suspender shouldSuspend={shouldSuspend} />])}
        </React.Suspense>
      );
    }
    function JsxApp({shouldSuspend}) {
      return (
        <React.Suspense fallback={<span>loading</span>}>
          <div style={style}>
            <Suspender shouldSuspend={shouldSuspend} />
          </div>
          <section style={{display: 'grid'}}>
            <Suspender shouldSuspend={shouldSuspend} />
          </section>
        </React.Suspense>
      );
    }
    await renderBoth(
      <BlockApp shouldSuspend={false} />,
      <JsxApp shouldSuspend={false} />,
    );
    await renderBoth(
      <BlockApp shouldSuspend={true} />,
      <JsxApp shouldSuspend={true} />,
    );
    expect(blockContainer.innerHTML).toContain('display: none');
    await act(() => resolve());
    expect(blockContainer.innerHTML).toBe(jsxContainer.innerHTML);
    expect(blockContainer.innerHTML).toBe(
      '<div style="display: flex; color: red;">content</div>' +
        '<section style="display: grid;">content</section>',
    );
  });

  function countFibers(container) {
    const key = Object.keys(container).find(k =>
      k.startsWith('__reactContainer$'),
    );
    let count = 0;
    (function walk(fiber) {
      while (fiber !== null) {
        count++;
        walk(fiber.child);
        fiber = fiber.sibling;
      }
    })(container[key].stateNode.current.child);
    return count;
  }

  // @gate enableCompiledBlocks
  it('renders text and empty slots without fibers', async () => {
    // <p>{a}<b>x</b>{b}{c}</p>
    const template = ReactDOM.unstable_createBlockTemplate([
      'p',
      null,
      null,
      [{s: 0}, ['b', null, null, ['x']], {s: 1}, {s: 2}],
    ]);
    function Jsx({a, b, c}) {
      return (
        <p>
          {a}
          <b>x</b>
          {b}
          {c}
        </p>
      );
    }
    await renderBoth(
      block(template, ['one', 2, null]),
      <Jsx a="one" b={2} c={null} />,
    );
    // Only the block fiber itself.
    expect(countFibers(blockContainer)).toBe(1);
    const steps = [
      ['one', 3, 'three'],
      [null, <i key="i">i</i>, 'three'],
      ['back', 'text', <u key="u">u</u>],
      [false, '', 0],
      [<em key="e">e</em>, [<s key="s">s</s>, 'arr'], 'tail'],
      ['a', 'b', 'c'],
    ];
    for (let i = 0; i < steps.length; i++) {
      const [a, b, c] = steps[i];
      await renderBoth(block(template, [a, b, c]), <Jsx a={a} b={b} c={c} />);
    }
    expect(countFibers(blockContainer)).toBe(1);
  });

  // @gate enableCompiledBlocks
  it('renders controlled checkboxes and dispatches onChange', async () => {
    const log = [];
    // <label onChange={outer}><input type="checkbox" checked={c} onChange={h} /></label>
    const template = ReactDOM.unstable_createBlockTemplate([
      'div',
      null,
      [['onChange', 0]],
      [
        [
          'input',
          {type: 'checkbox', className: 'toggle'},
          [
            ['checked', 1],
            ['onChange', 2],
          ],
          [],
        ],
        ['span', null, null, [{s: 3}]],
      ],
    ]);
    let setChecked;
    function App({ignoreChanges}) {
      const [checked, _setChecked] = React.useState(false);
      setChecked = _setChecked;
      return block(template, [
        e => log.push('outer:' + e.target.checked),
        checked,
        e => {
          log.push('input:' + e.target.checked);
          if (!ignoreChanges) {
            _setChecked(e.target.checked);
          }
        },
        checked ? 'on' : 'off',
      ]);
    }
    await act(() => blockRoot.render(<App ignoreChanges={false} />));
    const input = blockContainer.querySelector('input');
    expect(input.checked).toBe(false);
    await act(() => input.click());
    expect(log).toEqual(['input:true', 'outer:true']);
    expect(input.checked).toBe(true);
    expect(blockContainer.querySelector('span').textContent).toBe('on');
    log.length = 0;

    // A controlled checkbox whose change is ignored reverts after the event.
    await act(() => blockRoot.render(<App ignoreChanges={true} />));
    await act(() => input.click());
    expect(log).toEqual(['input:false', 'outer:false']);
    expect(input.checked).toBe(true);
    await act(() => setChecked(false));
    expect(input.checked).toBe(false);
  });

  // @gate enableCompiledBlocks
  it('renders controlled text inputs', async () => {
    const template = ReactDOM.unstable_createBlockTemplate([
      'div',
      null,
      null,
      [
        [
          'input',
          {className: 'new-todo'},
          [
            ['value', 0],
            ['onChange', 1],
          ],
          [],
        ],
        ['output', null, null, [{s: 2}]],
      ],
    ]);
    function App({uppercase}) {
      const [text, setText] = React.useState('');
      return block(template, [
        text,
        e => {
          const value = e.target.value;
          setText(uppercase ? value.toUpperCase() : value);
        },
        text.length,
      ]);
    }
    await act(() => blockRoot.render(<App uppercase={true} />));
    const input = blockContainer.querySelector('input');
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    ).set;
    await act(() => {
      setter.call(input, 'abc');
      input.dispatchEvent(new Event('input', {bubbles: true}));
    });
    expect(input.value).toBe('ABC');
    expect(blockContainer.querySelector('output').textContent).toBe('3');
  });

  // @gate enableCompiledBlocks
  it('restores controlled radio groups spanning blocks', async () => {
    const template = ReactDOM.unstable_createBlockTemplate([
      'label',
      null,
      null,
      [
        [
          'input',
          {type: 'radio', name: 'choice'},
          [
            ['checked', 0],
            ['onChange', 1],
          ],
          [],
        ],
        {s: 2},
      ],
    ]);
    function App() {
      const [selected, setSelected] = React.useState('a');
      return (
        <form>
          {['a', 'b'].map(value =>
            block(
              template,
              [
                selected === value,
                // Ignore changes to 'b' so that it must be restored.
                () => value === 'a' && setSelected(value),
                value,
              ],
              value,
            ),
          )}
        </form>
      );
    }
    await act(() => blockRoot.render(<App />));
    const [a, b] = blockContainer.querySelectorAll('input');
    expect(a.checked).toBe(true);
    await act(() => b.click());
    expect(a.checked).toBe(true);
    expect(b.checked).toBe(false);
  });

  // @gate enableCompiledBlocks
  it('dispatches enter and leave events across block boundaries', async () => {
    const log = [];
    const template = ReactDOM.unstable_createBlockTemplate([
      'div',
      {id: 'block'},
      null,
      [['span', {id: 'inner'}, null, ['inner']], {s: 0}],
    ]);
    function App() {
      return (
        <section
          id="outer"
          onMouseEnter={e => log.push('outer enter ' + e.target.id)}
          onMouseLeave={e => log.push('outer leave ' + e.target.id)}>
          <p id="sibling">sibling</p>
          {block(template, [
            <b
              id="slotted"
              onMouseEnter={e => log.push('slotted enter ' + e.target.id)}
              onMouseLeave={e =>
                log.push('slotted leave ' + e.relatedTarget.id)
              }>
              slotted
            </b>,
          ])}
        </section>
      );
    }
    await act(() => blockRoot.render(<App />));
    const byId = id => document.getElementById(id);
    function move(from, to) {
      from.dispatchEvent(
        new MouseEvent('mouseout', {bubbles: true, relatedTarget: to}),
      );
      to.dispatchEvent(
        new MouseEvent('mouseover', {bubbles: true, relatedTarget: from}),
      );
    }
    // Moving within <section> must not leave or re-enter it.
    move(byId('sibling'), byId('inner'));
    expect(log).toEqual([]);
    move(byId('inner'), byId('slotted'));
    expect(log).toEqual(['slotted enter slotted']);
    log.length = 0;
    move(byId('slotted'), byId('inner'));
    expect(log).toEqual(['slotted leave inner']);
  });

  describe('inline lists', () => {
    // <tr className={0}><td>{1}</td><td><a onClick={2}>{3}</a></td></tr>
    function createRowTemplate() {
      return ReactDOM.unstable_createBlockTemplate([
        'tr',
        null,
        [['className', 0]],
        [
          ['td', {className: 'id'}, null, [{s: 1}]],
          ['td', null, null, [['a', null, [['onClick', 2]], [{s: 3}]]]],
        ],
      ]);
    }

    function rowBlock(template, row, selected, onSelect) {
      return block(
        template,
        [
          selected === row.id ? 'danger' : '',
          row.id,
          onSelect === undefined ? null : () => onSelect(row.id),
          row.label,
        ],
        String(row.id),
      );
    }

    function RowJsx({row, selected}) {
      return (
        <tr className={selected === row.id ? 'danger' : ''}>
          <td className="id">{row.id}</td>
          <td>
            <a>{row.label}</a>
          </td>
        </tr>
      );
    }

    // <table><tbody>{0}</tbody></table>
    function createTableTemplate() {
      return ReactDOM.unstable_createBlockTemplate([
        'table',
        null,
        null,
        [['tbody', null, null, [{s: 0}]]],
      ]);
    }

    function TableJsx({rows, selected}) {
      return (
        <table>
          <tbody>
            {rows.map(row => (
              <RowJsx key={row.id} row={row} selected={selected} />
            ))}
          </tbody>
        </table>
      );
    }

    // @gate enableCompiledBlocks
    it('renders a list of keyed blocks without fibers', async () => {
      const rowTemplate = createRowTemplate();
      const tableTemplate = createTableTemplate();
      const rows = [];
      for (let i = 1; i <= 50; i++) {
        rows.push({id: i, label: 'row ' + i});
      }
      await renderBoth(
        block(tableTemplate, [rows.map(row => rowBlock(rowTemplate, row, 3))]),
        <TableJsx rows={rows} selected={3} />,
      );
      expect(countFibers(blockContainer)).toBe(1);
    });

    // @gate enableCompiledBlocks
    it('reconciles random list changes like host components', async () => {
      const rowTemplate = createRowTemplate();
      const tableTemplate = createTableTemplate();
      let seed = 7;
      function random(max) {
        seed = (seed * 48271) % 2147483647;
        return seed % max;
      }
      let nextId = 1;
      let rows = [];
      let selected = 0;
      const nodesById = new Map();
      for (let step = 0; step < 300; step++) {
        const next = rows.slice();
        switch (random(9)) {
          case 0: {
            // Insert a few rows at random positions.
            const count = 1 + random(4);
            for (let i = 0; i < count; i++) {
              next.splice(random(next.length + 1), 0, {
                id: nextId,
                label: 'row ' + nextId,
              });
              nextId++;
            }
            break;
          }
          case 1: {
            // Remove a few rows.
            const count = random(4);
            for (let i = 0; i < count && next.length > 0; i++) {
              next.splice(random(next.length), 1);
            }
            break;
          }
          case 2: {
            // Move a row.
            if (next.length > 1) {
              const [row] = next.splice(random(next.length), 1);
              next.splice(random(next.length + 1), 0, row);
            }
            break;
          }
          case 3: {
            // Swap two rows.
            if (next.length > 1) {
              const a = random(next.length);
              const b = random(next.length);
              const row = next[a];
              next[a] = next[b];
              next[b] = row;
            }
            break;
          }
          case 4: {
            // Shuffle.
            for (let i = next.length - 1; i > 0; i--) {
              const j = random(i + 1);
              const row = next[i];
              next[i] = next[j];
              next[j] = row;
            }
            break;
          }
          case 5: {
            // Update labels.
            for (let i = 0; i < next.length; i += 3) {
              next[i] = {id: next[i].id, label: next[i].label + '!'};
            }
            break;
          }
          case 6: {
            // Replace everything.
            next.length = 0;
            const count = random(8);
            for (let i = 0; i < count; i++) {
              next.push({id: nextId, label: 'row ' + nextId});
              nextId++;
            }
            break;
          }
          case 7: {
            if (next.length > 0) {
              selected = next[random(next.length)].id;
            }
            break;
          }
          case 8: {
            // Reverse, and occasionally clear.
            if (random(4) === 0) {
              next.length = 0;
            } else {
              next.reverse();
            }
            break;
          }
        }
        rows = next;
        await renderBoth(
          block(tableTemplate, [
            rows.map(row => rowBlock(rowTemplate, row, selected)),
          ]),
          <TableJsx rows={rows} selected={selected} />,
        );
        // Rows that stay in the list keep their DOM nodes.
        const trs = blockContainer.querySelectorAll('tr');
        const seen = new Map();
        for (let i = 0; i < rows.length; i++) {
          const previous = nodesById.get(rows[i].id);
          if (previous !== undefined) {
            expect(trs[i]).toBe(previous);
          }
          seen.set(rows[i].id, trs[i]);
        }
        nodesById.clear();
        seen.forEach((node, id) => nodesById.set(id, node));
      }
      expect(countFibers(blockContainer)).toBe(1);
    });

    // @gate enableCompiledBlocks
    it('moves only the items that changed position', async () => {
      const rowTemplate = createRowTemplate();
      const tableTemplate = createTableTemplate();
      const rows = [];
      for (let i = 1; i <= 1000; i++) {
        rows.push({id: i, label: 'row ' + i});
      }
      const render = list =>
        act(() =>
          blockRoot.render(
            block(tableTemplate, [
              list.map(row => rowBlock(rowTemplate, row, 0)),
            ]),
          ),
        );
      await render(rows);
      const swapped = rows.slice();
      swapped[1] = rows[998];
      swapped[998] = rows[1];
      const tbody = blockContainer.querySelector('tbody');
      const insertBefore = jest.spyOn(tbody, 'insertBefore');
      await render(swapped);
      expect(insertBefore).toHaveBeenCalledTimes(2);
      insertBefore.mockRestore();
      expect(
        Array.from(tbody.querySelectorAll('td.id')).map(td => td.textContent),
      ).toEqual(swapped.map(row => String(row.id)));
    });

    // @gate enableCompiledBlocks
    it('places lists among slots and static siblings at the same position', async () => {
      const item = ReactDOM.unstable_createBlockTemplate([
        'li',
        null,
        [['title', 0]],
        [{s: 1}],
      ]);
      // <ul><li>first</li>{0}{1}{2}<li>last</li>{3}</ul>
      const outer = ReactDOM.unstable_createBlockTemplate([
        'ul',
        null,
        null,
        [
          ['li', null, null, ['first']],
          {s: 0},
          {s: 1},
          {s: 2},
          ['li', null, null, ['last']],
          {s: 3},
        ],
      ]);
      const toBlocks = ids =>
        ids.map(id => block(item, [id, 'item ' + id], id));
      const toJsx = ids =>
        ids.map(id => (
          <li key={id} title={id}>
            {'item ' + id}
          </li>
        ));
      function Jsx({a, b, c, d}) {
        return (
          <ul>
            <li>first</li>
            {a}
            {b}
            {c}
            <li>last</li>
            {d}
          </ul>
        );
      }
      // Each step: [a, b, c, d]; arrays of ids are lists.
      const steps = [
        [['x'], 'text', ['y', 'z'], []],
        [[], 'text', ['z', 'y', 'w'], ['p']],
        [['x', 'v'], null, [], ['q', 'p']],
        ['a', ['m'], 'c', null],
        [['x'], <b key="b">fiber</b>, ['y'], ['p']],
        [[<i key="i">not a block</i>], ['m', 'n'], ['y'], 'd'],
        [['x'], ['n', 'm'], null, ['p']],
        [null, null, null, null],
        [['x', 'y'], ['m'], ['z'], ['p', 'q']],
      ];
      const convert = (value, forBlock) =>
        Array.isArray(value) && value.every(v => typeof v === 'string')
          ? forBlock
            ? toBlocks(value)
            : toJsx(value)
          : value;
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        await renderBoth(
          block(
            outer,
            step.map(value => convert(value, true)),
          ),
          <Jsx
            a={convert(step[0], false)}
            b={convert(step[1], false)}
            c={convert(step[2], false)}
            d={convert(step[3], false)}
          />,
        );
      }
    });

    // @gate enableCompiledBlocks
    it('renders nested lists and text slots inside items', async () => {
      // <li>{0}<ul>{1}</ul></li>
      const group = ReactDOM.unstable_createBlockTemplate([
        'li',
        null,
        null,
        [{s: 0}, ['ul', null, null, [{s: 1}]]],
      ]);
      const leaf = ReactDOM.unstable_createBlockTemplate([
        'li',
        null,
        [['className', 0]],
        [{s: 1}, ['span', null, null, [{t: 2}]]],
      ]);
      const outer = ReactDOM.unstable_createBlockTemplate([
        'section',
        null,
        null,
        [['ol', null, null, [{s: 0}]]],
      ]);
      function Jsx({groups}) {
        return (
          <section>
            <ol>
              {groups.map(g => (
                <li key={g.name}>
                  {g.title}
                  <ul>
                    {g.leaves.map(l => (
                      <li key={l.id} className={l.className}>
                        {l.text}
                        <span>{l.count}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </section>
        );
      }
      const toBlocks = groups =>
        block(outer, [
          groups.map(g =>
            block(
              group,
              [
                g.title,
                g.leaves.map(l =>
                  block(leaf, [l.className, l.text, l.count], l.id),
                ),
              ],
              g.name,
            ),
          ),
        ]);
      const steps = [
        [
          {
            name: 'a',
            title: 'A',
            leaves: [{id: '1', className: 'x', text: 'one', count: 1}],
          },
        ],
        [
          {name: 'b', title: null, leaves: []},
          {
            name: 'a',
            title: 42,
            leaves: [
              {id: '2', className: null, text: '', count: 2},
              {id: '1', className: 'y', text: 'uno', count: 3},
            ],
          },
        ],
        [
          {
            name: 'a',
            title: 'A',
            leaves: [{id: '1', className: 'y', text: false, count: 4}],
          },
          {
            name: 'b',
            title: 'B',
            leaves: [{id: '3', className: 'z', text: 'three', count: 5}],
          },
        ],
        [],
      ];
      for (let i = 0; i < steps.length; i++) {
        const groups = steps[i];
        await renderBoth(toBlocks(groups), <Jsx groups={groups} />);
      }
    });

    // @gate enableCompiledBlocks
    it('dispatches events from list items with the latest listeners', async () => {
      const rowTemplate = createRowTemplate();
      const tableTemplate = createTableTemplate();
      const log = [];
      function App({rows, prefix, stop}) {
        return (
          <div onClick={() => log.push('div')}>
            {block(tableTemplate, [
              rows.map(row =>
                rowBlock(rowTemplate, row, 0, id => {
                  log.push(prefix + id);
                }),
              ),
            ])}
          </div>
        );
      }
      const rows = [
        {id: 1, label: 'one'},
        {id: 2, label: 'two'},
      ];
      await act(() => blockRoot.render(<App rows={rows} prefix="a" />));
      const clickRow = id =>
        blockContainer.querySelectorAll('a')[
          rows.findIndex(row => row.id === id)
        ];
      clickRow(2).click();
      expect(log).toEqual(['a2', 'div']);
      log.length = 0;
      // Only the listeners change; they are read from the committed values.
      await act(() => blockRoot.render(<App rows={rows} prefix="b" />));
      clickRow(1).click();
      expect(log).toEqual(['b1', 'div']);
    });

    // @gate enableCompiledBlocks
    it('renders controlled checkboxes inside list items', async () => {
      // <li><input type="checkbox" checked={0} onChange={1} />{2}</li>
      const item = ReactDOM.unstable_createBlockTemplate([
        'li',
        null,
        null,
        [
          [
            'input',
            {type: 'checkbox'},
            [
              ['checked', 0],
              ['onChange', 1],
            ],
            [],
          ],
          {s: 2},
        ],
      ]);
      const list = ReactDOM.unstable_createBlockTemplate([
        'ul',
        null,
        null,
        [{s: 0}],
      ]);
      let setTodos;
      function App({ignoreChanges}) {
        const [todos, _setTodos] = React.useState([
          {id: 'a', done: false},
          {id: 'b', done: true},
        ]);
        setTodos = _setTodos;
        return block(list, [
          todos.map(todo =>
            block(
              item,
              [
                todo.done,
                e => {
                  if (!ignoreChanges) {
                    const checked = e.target.checked;
                    _setTodos(current =>
                      current.map(t =>
                        t.id === todo.id ? {id: t.id, done: checked} : t,
                      ),
                    );
                  }
                },
                todo.id,
              ],
              todo.id,
            ),
          ),
        ]);
      }
      await act(() => blockRoot.render(<App ignoreChanges={false} />));
      expect(countFibers(blockContainer)).toBe(2);
      const [a, b] = blockContainer.querySelectorAll('input');
      expect(a.checked).toBe(false);
      expect(b.checked).toBe(true);
      await act(() => a.click());
      expect(a.checked).toBe(true);
      // Reordering keeps the inputs and their state.
      await act(() => setTodos(current => current.slice().reverse()));
      expect(blockContainer.querySelectorAll('input')[1]).toBe(a);
      // A change that is ignored is reverted.
      await act(() => blockRoot.render(<App ignoreChanges={true} />));
      await act(() => b.click());
      expect(b.checked).toBe(true);
    });

    // @gate enableCompiledBlocks
    it('keeps the DOM of list items when lists switch between inline and fibers', async () => {
      // <li data-key={0} className={1}><b>{2}</b><ul>{3}</ul></li>
      const itemTemplate = ReactDOM.unstable_createBlockTemplate([
        'li',
        null,
        [
          ['data-key', 0],
          ['className', 1],
        ],
        [
          ['b', null, null, [{s: 2}]],
          ['ul', null, null, [{s: 3}]],
        ],
      ]);
      // <li data-key={0}><i>{1}</i></li>
      const leafTemplate = ReactDOM.unstable_createBlockTemplate([
        'li',
        null,
        [['data-key', 0]],
        [['i', null, null, [{s: 1}]]],
      ]);
      const listTemplate = ReactDOM.unstable_createBlockTemplate([
        'section',
        null,
        null,
        [
          ['h1', null, null, ['list']],
          ['ol', null, null, [{s: 0}]],
        ],
      ]);
      function Label({text}) {
        return <em>{text}</em>;
      }
      let seed = 0;
      function random(max) {
        seed = (seed * 48271) % 2147483647;
        return seed % max;
      }
      // An entry is a keyed block, a keyed host element, a keyed component or
      // a string. A block's label is text or, sometimes, a component element,
      // and it may hold a nested list of blocks or host elements.
      function randomEntries(count, depth) {
        const entries = [];
        const used = new Set();
        for (let i = 0; i < count; i++) {
          // Keys identify an element together with its type, so each kind of
          // entry uses its own keys (a block and a host <li> with the same key
          // are different elements to React as well).
          const kind = random(10);
          const prefix = kind < 7 ? 'b' : kind < 8 ? 'h' : kind < 9 ? 'c' : 't';
          let key;
          do {
            key = prefix + random(8);
          } while (used.has(key));
          used.add(key);
          if (kind < 7) {
            entries.push({
              kind: 'block',
              key,
              className: random(2) === 0 ? 'on' : '',
              label:
                random(5) === 0
                  ? {component: 'L' + random(3)}
                  : 'b' + random(3),
              nested: depth === 0 ? randomEntries(random(4), 1) : null,
            });
          } else if (kind < 8) {
            entries.push({kind: 'host', key, label: 'h' + random(3)});
          } else if (kind < 9) {
            entries.push({kind: 'component', key, label: 'c' + random(3)});
          } else {
            entries.push({kind: 'text', key, label: 't' + random(3)});
          }
        }
        return entries;
      }
      function renderLabel(label) {
        return typeof label === 'string' ? (
          label
        ) : (
          <Label text={label.component} />
        );
      }
      function renderNested(entries, asBlocks) {
        return entries.map(entry => {
          if (entry.kind === 'text') {
            return entry.label;
          }
          if (entry.kind === 'component') {
            return <Label key={entry.key} text={entry.label} />;
          }
          if (entry.kind === 'host' || entry.nested === null) {
            if (entry.kind === 'block' && asBlocks) {
              return block(
                leafTemplate,
                [entry.key, renderLabel(entry.label)],
                entry.key,
              );
            }
            return (
              <li key={entry.key} data-key={entry.key}>
                <i>{renderLabel(entry.label)}</i>
              </li>
            );
          }
          if (asBlocks) {
            return block(
              itemTemplate,
              [
                entry.key,
                entry.className,
                renderLabel(entry.label),
                renderNested(entry.nested, true),
              ],
              entry.key,
            );
          }
          return (
            <li
              key={entry.key}
              data-key={entry.key}
              className={entry.className}>
              <b>{renderLabel(entry.label)}</b>
              <ul>{renderNested(entry.nested, false)}</ul>
            </li>
          );
        });
      }
      function nodesByKey(container) {
        const map = new Map();
        container.querySelectorAll('[data-key]').forEach(node => {
          // Keys can repeat across nesting levels; include the parent chain.
          let path = node.getAttribute('data-key');
          for (
            let p = node.parentElement;
            p !== container;
            p = p.parentElement
          ) {
            if (p.hasAttribute('data-key')) {
              path = p.getAttribute('data-key') + '/' + path;
            }
          }
          map.set(path, node);
        });
        return map;
      }
      const seeds = [11, 23, 97];
      for (let run = 0; run < seeds.length; run++) {
        seed = seeds[run];
        await renderBoth(null, null);
        let previousBlock = new Map();
        let previousJsx = new Map();
        let previousEntries = [];
        for (let step = 0; step < 150; step++) {
          const entries = random(6) === 0 ? [] : randomEntries(random(8), 0);
          await renderBoth(
            block(listTemplate, [renderNested(entries, true)]),
            <section>
              <h1>list</h1>
              <ol>{renderNested(entries, false)}</ol>
            </section>,
          );
          const blockNodes = nodesByKey(blockContainer);
          const jsxNodes = nodesByKey(jsxContainer);
          const kept = (nodes, previous) =>
            Array.from(nodes.entries())
              .filter(([path, node]) => previous.get(path) === node)
              .map(([path]) => path)
              .sort();
          const keptBlock = kept(blockNodes, previousBlock);
          const keptJsx = kept(jsxNodes, previousJsx);
          if (JSON.stringify(keptBlock) !== JSON.stringify(keptJsx)) {
            throw new Error(
              `DOM identity differs at step ${step}: blocks kept ${JSON.stringify(keptBlock)}, ` +
                `JSX kept ${JSON.stringify(keptJsx)}\nprevious: ${JSON.stringify(previousEntries)}\n` +
                `current: ${JSON.stringify(entries)}`,
            );
          }
          previousBlock = blockNodes;
          previousJsx = jsxNodes;
          previousEntries = entries;
        }
      }
    });

    // @gate enableCompiledBlocks
    it('gives fibers only to the list items that need them', async () => {
      // <li data-key={0} onClick={1}><b>{2}</b></li>
      const itemTemplate = ReactDOM.unstable_createBlockTemplate([
        'li',
        null,
        [
          ['data-key', 0],
          ['onClick', 1],
        ],
        [['b', null, null, [{s: 2}]]],
      ]);
      const listTemplate = ReactDOM.unstable_createBlockTemplate([
        'div',
        null,
        [['onClick', 1]],
        [
          ['h1', null, null, ['list']],
          ['ul', null, null, [{s: 0}]],
        ],
      ]);
      const log = [];
      function Label({text}) {
        React.useEffect(() => {
          Scheduler.log('mount ' + text);
          return () => Scheduler.log('unmount ' + text);
        }, [text]);
        return <em onClick={() => log.push('em ' + text)}>{text}</em>;
      }
      function renderList(ids, special, asBlocks) {
        const items = ids.map(id => {
          const label =
            id === special ? <Label text={'L' + id} /> : 'item ' + id;
          return asBlocks ? (
            block(
              itemTemplate,
              [String(id), () => log.push('li ' + id), label],
              String(id),
            )
          ) : (
            <li
              key={id}
              data-key={String(id)}
              onClick={() => log.push('li ' + id)}>
              <b>{label}</b>
            </li>
          );
        });
        return asBlocks ? (
          block(listTemplate, [items, () => log.push('div')])
        ) : (
          <div onClick={() => log.push('div')}>
            <h1>list</h1>
            <ul>{items}</ul>
          </div>
        );
      }
      const ids = Array.from({length: 100}, (_, i) => i);
      const step = async (list, special) => {
        await renderBoth(
          renderList(list, special, true),
          renderList(list, special, false),
        );
      };
      await step(ids, -1);
      expect(countFibers(blockContainer)).toBe(1);
      const nodes = Array.from(blockContainer.querySelectorAll('li'));

      // One item needs a fiber for its label.
      await step(ids, 50);
      assertLog(['mount L50', 'mount L50']);
      // The list block, its slot fiber, the item's block and slot fibers, the
      // component and its <em>.
      expect(countFibers(blockContainer)).toBe(6);
      expect(Array.from(blockContainer.querySelectorAll('li'))).toEqual(nodes);

      blockContainer.querySelector('em').click();
      expect(log).toEqual(['em L50', 'li 50', 'div']);
      log.length = 0;

      // Reordering keeps every item's DOM and the component's state.
      const reversed = ids.slice().reverse();
      await step(reversed, 50);
      assertLog([]);
      expect(Array.from(blockContainer.querySelectorAll('li'))).toEqual(
        nodes.slice().reverse(),
      );

      // The label becomes text again; the item keeps its fiber.
      await step(reversed, -1);
      assertLog(['unmount L50', 'unmount L50']);
      expect(Array.from(blockContainer.querySelectorAll('li'))).toEqual(
        nodes.slice().reverse(),
      );

      // Removing the item removes its fiber and DOM.
      await step(
        reversed.filter(id => id !== 50),
        -1,
      );
      expect(countFibers(blockContainer)).toBe(1);
      expect(blockContainer.querySelectorAll('li').length).toBe(99);
    });

    // @gate enableCompiledBlocks
    it('dispatches events and controls inputs of adopted list items', async () => {
      // <li><input type="checkbox" checked={0} onChange={1} /><a onClick={2}>{3}</a></li>
      const itemTemplate = ReactDOM.unstable_createBlockTemplate([
        'li',
        null,
        null,
        [
          [
            'input',
            {type: 'checkbox'},
            [
              ['checked', 0],
              ['onChange', 1],
            ],
            [],
          ],
          ['a', null, [['onClick', 2]], [{s: 3}]],
        ],
      ]);
      const listTemplate = ReactDOM.unstable_createBlockTemplate([
        'div',
        null,
        null,
        [
          ['h1', null, null, ['todos']],
          ['ul', null, null, [{s: 0}]],
        ],
      ]);
      const log = [];
      function Extra() {
        return <li>extra</li>;
      }
      let setState;
      function App() {
        const [state, _setState] = React.useState({
          done: {a: false, b: true},
          extra: false,
          version: 1,
        });
        setState = _setState;
        const items = ['a', 'b'].map(id =>
          block(
            itemTemplate,
            [
              state.done[id],
              e => {
                const checked = e.target.checked;
                _setState(current => ({
                  ...current,
                  done: {...current.done, [id]: checked},
                }));
              },
              () => log.push(`click ${id} v${state.version}`),
              id,
            ],
            id,
          ),
        );
        return block(listTemplate, [
          state.extra ? [...items, <Extra key="extra" />] : items,
        ]);
      }
      await act(() => blockRoot.render(<App />));
      const [inputA, inputB] = blockContainer.querySelectorAll('input');
      const [linkA] = blockContainer.querySelectorAll('a');
      // Switch the list to fibers; the items keep their DOM.
      await act(() =>
        setState(current => ({...current, extra: true, version: 2})),
      );
      expect(blockContainer.querySelectorAll('input')[0]).toBe(inputA);
      expect(blockContainer.querySelectorAll('li').length).toBe(3);
      await act(() => linkA.click());
      expect(log).toEqual(['click a v2']);
      await act(() => inputA.click());
      expect(inputA.checked).toBe(true);
      // Clicking b's checkbox unchecks it through React state.
      await act(() => inputB.click());
      expect(inputB.checked).toBe(false);
      await act(() => setState(current => ({...current, version: 3})));
      await act(() => linkA.click());
      expect(log).toEqual(['click a v2', 'click a v3']);
    });

    // @gate enableCompiledBlocks
    it('warns about duplicate keys exactly like fiber reconciliation', async () => {
      const item = ReactDOM.unstable_createBlockTemplate([
        'li',
        null,
        null,
        [['b', null, null, [{t: 0}]]],
      ]);
      const list = ReactDOM.unstable_createBlockTemplate([
        'ul',
        null,
        null,
        [{s: 0}],
      ]);
      const internals =
        React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
      // Records console.error arguments and the component stack at the time of
      // the call.
      async function collectErrors(renderSteps) {
        const errors = [];
        const originalError = console.error;
        console.error = (...args) => {
          errors.push({
            args,
            stack: __DEV__ ? internals.getCurrentStack() : null,
          });
        };
        try {
          await renderSteps();
        } finally {
          console.error = originalError;
        }
        return errors;
      }
      const items = labels => labels.map(label => block(item, [label], 'same'));
      // In a block slot (inline list, or fibers in development).
      function InSlot({labels}) {
        return block(list, [items(labels)]);
      }
      // As children of a host element: always reconciled by fibers.
      function InHost({labels}) {
        return <ul>{items(labels)}</ul>;
      }
      const steps = [['a', 'b'], ['c', 'd', 'e'], ['f']];
      const slotErrors = await collectErrors(async () => {
        for (let i = 0; i < steps.length; i++) {
          await act(() => blockRoot.render(<InSlot labels={steps[i]} />));
          expect(blockContainer.textContent).toBe(steps[i].join(''));
        }
      });
      const hostErrors = await collectErrors(async () => {
        for (let i = 0; i < steps.length; i++) {
          await act(() => jsxRoot.render(<InHost labels={steps[i]} />));
          expect(jsxContainer.textContent).toBe(steps[i].join(''));
        }
      });
      if (__DEV__) {
        expect(slotErrors.length).toBe(3);
        expect(slotErrors[0].args[0]).toContain(
          'Encountered two children with the same key',
        );
        // The component stacks name the function that created the elements,
        // at the same call sites; only the function name differs.
        expect(
          slotErrors.map(e => ({
            args: e.args,
            stack: e.stack
              .replace(/InSlot/g, 'Component')
              .replace(/:\d+:\d+/g, ''),
          })),
        ).toEqual(
          hostErrors.map(e => ({
            args: e.args,
            stack: e.stack
              .replace(/InHost/g, 'Component')
              .replace(/:\d+:\d+/g, ''),
          })),
        );
      } else {
        expect(slotErrors).toEqual([]);
        expect(hostErrors).toEqual([]);
      }
    });

    // @gate enableCompiledBlocks
    it('updates only the replaced items of a list that records its changes', async () => {
      // unstable_useListItemMemoCache's `map` returns a copy of its previous
      // result with some items replaced, and records them.
      const LIST_CHANGES = Symbol.for('react.list_changes');
      const listIdentity = require('shared/ReactListIdentity').default;
      function replaceItems(base, replacements) {
        const list = base.slice();
        const indices = [];
        for (let i = 0; i < replacements.length; i++) {
          const [index, item] = replacements[i];
          list[index] = item;
          indices.push(index);
        }
        list[LIST_CHANGES] = {base: listIdentity(base), indices};
        return list;
      }
      // Counts the items a renderer reads.
      let itemReads = 0;
      function countingItemReads(list) {
        return new Proxy(list, {
          get(target, property, receiver) {
            if (typeof property === 'string' && /^\d+$/.test(property)) {
              itemReads++;
            }
            return Reflect.get(target, property, receiver);
          },
        });
      }

      const rowTemplate = createRowTemplate();
      const otherRowTemplate = ReactDOM.unstable_createBlockTemplate([
        'tr',
        null,
        [['className', 0]],
        [
          ['td', {className: 'id'}, null, [{s: 1}]],
          ['td', null, null, [['a', null, [['onClick', 2]], [{s: 3}]]]],
        ],
      ]);
      const tableTemplate = createTableTemplate();
      const rows = [];
      for (let i = 1; i <= 200; i++) {
        rows.push({id: i, label: 'row ' + i});
      }
      const nodes = () => Array.from(blockContainer.querySelectorAll('tr'));

      const first = rows.map(row => rowBlock(rowTemplate, row, 3));
      await renderBoth(
        block(tableTemplate, [first]),
        <TableJsx rows={rows} selected={3} />,
      );
      const initialNodes = nodes();

      // Selecting row 150 replaces rows 3 and 150.
      const second = countingItemReads(
        replaceItems(first, [
          [2, rowBlock(rowTemplate, rows[2], 150)],
          [149, rowBlock(rowTemplate, rows[149], 150)],
        ]),
      );
      itemReads = 0;
      await renderBoth(
        block(tableTemplate, [second]),
        <TableJsx rows={rows} selected={150} />,
      );
      if (!__DEV__) {
        // A few reads of each replaced item, instead of reads of all 200
        // items. (Development checks every item against the recorded
        // changes.)
        expect(itemReads).toBeLessThan(50);
      }
      expect(nodes()).toEqual(initialNodes);
      expect(countFibers(blockContainer)).toBe(1);

      // Changes recorded against a list that is not the committed one are
      // ignored.
      const unrelated = replaceItems(
        rows.map(row => rowBlock(rowTemplate, row, 1)),
        [[0, rowBlock(rowTemplate, rows[0], 1)]],
      );
      await renderBoth(
        block(tableTemplate, [unrelated]),
        <TableJsx rows={rows} selected={1} />,
      );
      expect(nodes()).toEqual(initialNodes);

      // A replaced item with another template is not the same item: the list
      // is reconciled, and only that row is recreated.
      const third = replaceItems(unrelated, [
        [0, rowBlock(otherRowTemplate, rows[0], 6)],
        [5, rowBlock(rowTemplate, rows[5], 6)],
      ]);
      await renderBoth(
        block(tableTemplate, [third]),
        <TableJsx rows={rows} selected={6} />,
      );
      const thirdNodes = nodes();
      expect(thirdNodes[0]).not.toBe(initialNodes[0]);
      expect(thirdNodes.slice(1)).toEqual(initialNodes.slice(1));

      if (__DEV__) {
        // An item that differs without being recorded is a bug in the
        // producer of the changes: the list is reconciled as a whole.
        const inconsistent = replaceItems(third, [
          [5, rowBlock(rowTemplate, rows[5], 7)],
        ]);
        inconsistent[6] = rowBlock(rowTemplate, rows[6], 7);
        await renderBoth(
          block(tableTemplate, [inconsistent]),
          <TableJsx rows={rows} selected={7} />,
        );
        // Reported when the block renders and when its list is committed.
        const message =
          'React Compiler list changes are inconsistent: item 6 differs from ' +
          'the previous list but is not recorded as changed. This is a bug ' +
          'in React.';
        assertConsoleErrorDev([message, message]);
      }
    });

    // @gate enableCompiledBlocks
    it('gives a fiber to a replaced item that needs one', async () => {
      const LIST_CHANGES = Symbol.for('react.list_changes');
      const listIdentity = require('shared/ReactListIdentity').default;
      // <li data-key={0}><b>{1}</b></li>
      const itemTemplate = ReactDOM.unstable_createBlockTemplate([
        'li',
        null,
        [['data-key', 0]],
        [['b', null, null, [{s: 1}]]],
      ]);
      const listTemplate = ReactDOM.unstable_createBlockTemplate([
        'ul',
        null,
        null,
        [{s: 0}],
      ]);
      function Editor({id}) {
        React.useEffect(() => {
          Scheduler.log('mount ' + id);
          return () => Scheduler.log('unmount ' + id);
        }, [id]);
        return <em>{'editing ' + id}</em>;
      }
      function item(id, editing, asBlock) {
        const content = editing ? <Editor id={id} /> : 'item ' + id;
        return asBlock ? (
          block(itemTemplate, [String(id), content], String(id))
        ) : (
          <li key={id} data-key={String(id)}>
            <b>{content}</b>
          </li>
        );
      }
      const ids = [1, 2, 3, 4, 5];
      const first = ids.map(id => item(id, false, true));
      await renderBoth(
        block(listTemplate, [first]),
        <ul>{ids.map(id => item(id, false, false))}</ul>,
      );
      const initialNodes = Array.from(blockContainer.querySelectorAll('li'));

      const second = first.slice();
      second[3] = item(4, true, true);
      second[LIST_CHANGES] = {base: listIdentity(first), indices: [3]};
      await renderBoth(
        block(listTemplate, [second]),
        <ul>{ids.map(id => item(id, id === 4, false))}</ul>,
      );
      assertLog(['mount 4', 'mount 4']);
      expect(Array.from(blockContainer.querySelectorAll('li'))).toEqual(
        initialNodes,
      );

      const third = second.slice();
      third[1] = item(2, true, true);
      third[3] = item(4, false, true);
      third[LIST_CHANGES] = {base: listIdentity(second), indices: [1, 3]};
      await renderBoth(
        block(listTemplate, [third]),
        <ul>{ids.map(id => item(id, id === 2, false))}</ul>,
      );
      assertLog(['unmount 4', 'mount 2', 'unmount 4', 'mount 2']);
      expect(Array.from(blockContainer.querySelectorAll('li'))).toEqual(
        initialNodes,
      );
    });
  });

  // @gate enableCompiledBlocks
  it('throws when rendered inside SVG content', async () => {
    const template = ReactDOM.unstable_createBlockTemplate([
      'g',
      null,
      null,
      [],
    ]);
    await expect(
      act(() => blockRoot.render(<svg>{block(template, [])}</svg>)),
    ).rejects.toThrow(
      'Compiled blocks can only be rendered inside HTML content, not inside <svg> or <math>.',
    );
  });
});
