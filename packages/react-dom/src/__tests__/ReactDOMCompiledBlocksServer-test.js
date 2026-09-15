/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

let React;
let ReactDOM;
let ReactDOMServer;
let ReactDOMClient;
let act;

// Server rendering of compiled blocks: a block renders the same HTML as the
// host elements its template describes.
describe('ReactDOMCompiledBlocks server rendering', () => {
  beforeEach(() => {
    jest.resetModules();
    // The Node server renderer schedules work with setImmediate, which the
    // DOM test environment does not define.
    global.setImmediate = require('timers').setImmediate;
    React = require('react');
    ReactDOM = require('react-dom');
    ReactDOMServer = require('react-dom/server');
    ReactDOMClient = require('react-dom/client');
    ({act} = require('internal-test-utils'));
  });

  function block(template, values, key) {
    return React.createElement(template, {v: values, key});
  }

  function expectSameHTML(blockElement, jsxElement) {
    const html = ReactDOMServer.renderToString(blockElement);
    expect(html).toBe(ReactDOMServer.renderToString(jsxElement));
    return html;
  }

  // @gate enableCompiledBlocks
  it('renders static structure, props and text holes', () => {
    // <li className={c}><div className="view"><label>{title}</label>
    // <button className="destroy" onClick={onClick} /></div></li>
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
            ['button', {className: 'destroy'}, [['onClick', 2]], []],
          ],
        ],
      ],
    ]);
    const onClick = () => {};
    const html = expectSameHTML(
      block(template, ['completed', 'Buy milk', onClick]),
      <li className="completed">
        <div className="view">
          <label>Buy milk</label>
          <button className="destroy" onClick={onClick} />
        </div>
      </li>,
    );
    expect(html).toBe(
      '<li class="completed"><div class="view"><label>Buy milk</label>' +
        '<button class="destroy"></button></div></li>',
    );
  });

  // @gate enableCompiledBlocks
  it('separates adjacent text like host elements', () => {
    // <p>Hello {name}{suffix}<b>x</b>{count}</p>
    const template = ReactDOM.unstable_createBlockTemplate([
      'p',
      null,
      null,
      ['Hello ', {t: 0}, {t: 1}, ['b', null, null, ['x']], {t: 2}],
    ]);
    const cases = [
      ['Ada', '!', 3],
      ['', '', 0],
      ['Bob', '', ''],
    ];
    for (let i = 0; i < cases.length; i++) {
      const [name, suffix, count] = cases[i];
      expectSameHTML(
        block(template, [name, suffix, count]),
        <p>
          Hello {name}
          {suffix}
          <b>x</b>
          {count}
        </p>,
      );
    }
  });

  // @gate enableCompiledBlocks
  it('renders slots with components, arrays, elements and nothing', () => {
    // <section><h2>{title}</h2>{a}<ul>{b}</ul></section>
    const template = ReactDOM.unstable_createBlockTemplate([
      'section',
      null,
      null,
      [['h2', null, null, [{t: 0}]], {s: 1}, ['ul', null, null, [{s: 2}]]],
    ]);
    function Item({label}) {
      return <li>{label}</li>;
    }
    const cases = [
      [null, [<Item key="a" label="a" />, <Item key="b" label="b" />]],
      [<Item label="single" />, 'text'],
      [false, []],
      [['x', <span key="s">y</span>], <Item label="z" />],
    ];
    for (let i = 0; i < cases.length; i++) {
      const [a, b] = cases[i];
      expectSameHTML(
        block(template, ['Title', a, b]),
        <section>
          <h2>Title</h2>
          {a}
          <ul>{b}</ul>
        </section>,
      );
    }
  });

  // @gate enableCompiledBlocks
  it('renders nested blocks in lists', () => {
    const row = ReactDOM.unstable_createBlockTemplate([
      'tr',
      null,
      [['className', 0]],
      [
        ['td', null, null, [{t: 1}]],
        ['td', null, null, [['a', null, [['onClick', 2]], [{t: 3}]]]],
      ],
    ]);
    const table = ReactDOM.unstable_createBlockTemplate([
      'table',
      null,
      null,
      [['tbody', null, null, [{s: 0}]]],
    ]);
    const rows = [
      {id: 1, label: 'one'},
      {id: 2, label: 'two'},
    ];
    const onClick = () => {};
    expectSameHTML(
      block(table, [
        rows.map(r =>
          block(
            row,
            [r.id === 2 ? 'danger' : '', r.id, onClick, r.label],
            r.id,
          ),
        ),
      ]),
      <table>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className={r.id === 2 ? 'danger' : ''}>
              <td>{r.id}</td>
              <td>
                <a onClick={onClick}>{r.label}</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>,
    );
  });

  // @gate enableCompiledBlocks
  it('renders inputs like host inputs', () => {
    const template = ReactDOM.unstable_createBlockTemplate([
      'div',
      null,
      null,
      [
        [
          'input',
          {className: 'toggle', type: 'checkbox'},
          [
            ['checked', 0],
            ['onChange', 2],
          ],
          [],
        ],
        [
          'input',
          {className: 'edit'},
          [
            ['value', 1],
            ['onChange', 2],
          ],
          [],
        ],
      ],
    ]);
    const onChange = () => {};
    expectSameHTML(
      block(template, [true, 'draft', onChange]),
      <div>
        <input
          className="toggle"
          type="checkbox"
          checked={true}
          onChange={onChange}
        />
        <input className="edit" value="draft" onChange={onChange} />
      </div>,
    );
  });

  // @gate enableCompiledBlocks
  it('gives components in slots the tree positions of host elements', () => {
    const template = ReactDOM.unstable_createBlockTemplate([
      'div',
      null,
      null,
      [
        ['label', null, null, ['Name ', {s: 0}]],
        {s: 1},
        ['p', null, null, [{s: 2}]],
      ],
    ]);
    function Field() {
      const id = React.useId();
      return <input id={id} />;
    }
    expectSameHTML(
      block(template, [<Field />, <Field />, [<Field key="a" />, 'x']]),
      <div>
        <label>
          Name <Field />
        </label>
        <Field />
        <p>{[<Field key="a" />, 'x']}</p>
      </div>,
    );
  });

  // @gate enableCompiledBlocks
  it('streams suspended content in slots', async () => {
    const template = ReactDOM.unstable_createBlockTemplate([
      'article',
      null,
      null,
      [['h1', null, null, ['Post']], {s: 0}],
    ]);
    let resolve;
    const promise = new Promise(r => {
      resolve = r;
    });
    function Body() {
      React.use(promise);
      return <p>body</p>;
    }
    const {Writable} = require('stream');
    function render(element) {
      return new Promise((resolveHTML, reject) => {
        let html = '';
        const writable = new Writable({
          write(chunk, encoding, callback) {
            html += chunk.toString();
            callback();
          },
        });
        writable.on('finish', () => resolveHTML(html));
        const {pipe} = ReactDOMServer.renderToPipeableStream(element, {
          onShellReady() {
            pipe(writable);
          },
          onShellError: reject,
        });
      });
    }
    const blockHTML = render(
      block(template, [
        <React.Suspense fallback={<span>loading</span>}>
          <Body />
        </React.Suspense>,
      ]),
    );
    const jsxHTML = render(
      <article>
        <h1>Post</h1>
        <React.Suspense fallback={<span>loading</span>}>
          <Body />
        </React.Suspense>
      </article>,
    );
    resolve();
    expect(await blockHTML).toBe(await jsxHTML);
  });

  // @gate enableCompiledBlocks
  it('cannot be rendered inside svg', () => {
    const template = ReactDOM.unstable_createBlockTemplate([
      'div',
      null,
      null,
      [['span', null, null, []]],
    ]);
    expect(() =>
      ReactDOMServer.renderToString(<svg>{block(template, [])}</svg>),
    ).toThrow(
      'Compiled blocks can only be rendered inside HTML content, not inside <svg> or <math>.',
    );
  });
  describe('hydration', () => {
    // Renders `element` on the server, hydrates it, and returns the container
    // and the recoverable errors.
    async function hydrate(element, serverElement = element) {
      const html = ReactDOMServer.renderToString(serverElement);
      const container = document.createElement('div');
      document.body.appendChild(container);
      container.innerHTML = html;
      const errors = [];
      let root;
      await act(() => {
        root = ReactDOMClient.hydrateRoot(container, element, {
          onRecoverableError(error) {
            errors.push(error.message);
          },
        });
      });
      return {container, root, errors, html};
    }

    // The DOM that the client renders for `element` without hydration.
    async function clientHTML(element) {
      const container = document.createElement('div');
      const root = ReactDOMClient.createRoot(container);
      await act(() => root.render(element));
      return container.innerHTML;
    }

    const todo = () =>
      ReactDOM.unstable_createBlockTemplate([
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
              ['button', {className: 'destroy'}, [['onClick', 2]], []],
            ],
          ],
        ],
      ]);

    // @gate enableCompiledBlocks
    it('keeps the server DOM, handles events and updates', async () => {
      const template = todo();
      const clicks = [];
      let setTitle;
      function Todo() {
        const [title, set] = React.useState('Buy milk');
        setTitle = set;
        return block(template, [
          title === '' ? '' : 'active',
          title,
          () => clicks.push(title),
        ]);
      }
      const {container, errors} = await hydrate(<Todo />);
      expect(errors).toEqual([]);
      const li = container.firstChild;
      const button = container.querySelector('button');
      await act(() => button.click());
      expect(clicks).toEqual(['Buy milk']);

      await act(() => setTitle('Walk dog'));
      expect(container.firstChild).toBe(li);
      expect(container.querySelector('button')).toBe(button);
      expect(container.innerHTML).toBe(
        await clientHTML(
          <li className="active">
            <div className="view">
              <label>Walk dog</label>
              <button className="destroy" />
            </div>
          </li>,
        ),
      );
      await act(() => button.click());
      expect(clicks).toEqual(['Buy milk', 'Walk dog']);

      // An empty text renders nothing on the server and gets a text node.
      await act(() => setTitle(''));
      expect(container.querySelector('label').textContent).toBe('');
      await act(() => setTitle('Again'));
      expect(container.querySelector('label').textContent).toBe('Again');
    });

    // @gate enableCompiledBlocks
    it('hydrates empty text holes', async () => {
      // <p>Hello {name}{suffix}<b>x</b>{count}</p>
      const template = ReactDOM.unstable_createBlockTemplate([
        'p',
        null,
        null,
        ['Hello ', {t: 0}, {t: 1}, ['b', null, null, ['x']], {t: 2}],
      ]);
      let setValues;
      function App() {
        const [values, set] = React.useState(['', '', '']);
        setValues = set;
        return block(template, values);
      }
      const {container, errors} = await hydrate(<App />);
      expect(errors).toEqual([]);
      expect(container.textContent).toBe('Hello x');
      await act(() => setValues(['Ada', '!', 3]));
      expect(container.textContent).toBe('Hello Ada!x3');
      expect(container.innerHTML).toBe(
        await clientHTML(
          <p>
            Hello {'Ada'}
            {'!'}
            <b>x</b>
            {3}
          </p>,
        ),
      );
    });

    // @gate enableCompiledBlocks
    it('hydrates slots with components, arrays, text and nothing', async () => {
      // <section><h2>{title}</h2>{a}<ul>{b}</ul>{c}</section>
      const template = ReactDOM.unstable_createBlockTemplate([
        'section',
        null,
        null,
        [
          ['h2', null, null, [{t: 0}]],
          {s: 1},
          ['ul', null, null, [{s: 2}]],
          {s: 3},
        ],
      ]);
      let increment;
      function Counter() {
        const [count, setCount] = React.useState(0);
        increment = () => setCount(c => c + 1);
        return <span>count {count}</span>;
      }
      function Item({label}) {
        return <li>{label}</li>;
      }
      let setShow;
      function App() {
        const [show, set] = React.useState(true);
        setShow = set;
        return block(template, [
          'Title',
          <Counter />,
          show
            ? [<Item key="a" label="a" />, <Item key="b" label="b" />]
            : null,
          show ? 'tail' : null,
        ]);
      }
      const {container, errors} = await hydrate(<App />);
      expect(errors).toEqual([]);
      const span = container.querySelector('span');
      await act(() => increment());
      expect(container.querySelector('span')).toBe(span);
      expect(span.textContent).toBe('count 1');
      await act(() => setShow(false));
      // Hydrated text keeps the server's text separators, so compare the
      // content rather than the HTML.
      expect(container.textContent).toBe('Titlecount 1');
      expect(container.querySelector('ul').childNodes.length).toBe(0);
      expect(container.querySelector('section').lastChild).toBe(
        container.querySelector('ul'),
      );
      await act(() => setShow(true));
      expect(container.querySelectorAll('li').length).toBe(2);
      expect(container.textContent).toBe('Titlecount 1abtail');
    });

    // @gate enableCompiledBlocks
    it('hydrates useId in slots', async () => {
      const template = ReactDOM.unstable_createBlockTemplate([
        'div',
        null,
        null,
        [
          ['label', null, null, ['Name ', {s: 0}]],
          {s: 1},
          ['p', null, null, [{s: 2}]],
        ],
      ]);
      function Field() {
        const id = React.useId();
        return <input id={id} readOnly={true} value={id} />;
      }
      const {container, errors, html} = await hydrate(
        block(template, [<Field />, <Field />, [<Field key="a" />, 'x']]),
      );
      expect(errors).toEqual([]);
      const ids = Array.from(container.querySelectorAll('input')).map(
        input => input.id,
      );
      expect(new Set(ids).size).toBe(3);
      const serverIds = Array.from(
        html.matchAll(/id="([^"]*)"/g),
        match => match[1],
      );
      expect(ids).toEqual(serverIds);
    });

    // @gate enableCompiledBlocks
    it('hydrates useId from the HTML of host elements with children that render nothing', async () => {
      // <div>{null}<label>{false}<Field /></label><Field /></div>
      const template = ReactDOM.unstable_createBlockTemplate([
        'div',
        null,
        null,
        [null, ['label', null, null, [null, {s: 0}]], {s: 1}],
      ]);
      function Field() {
        const id = React.useId();
        return <input id={id} readOnly={true} value={id} />;
      }
      const {container, errors, html} = await hydrate(
        block(template, [<Field />, <Field />]),
        <div>
          {null}
          <label>
            {false}
            <Field />
          </label>
          <Field />
        </div>,
      );
      expect(errors).toEqual([]);
      expect(html).toBe(
        ReactDOMServer.renderToString(block(template, [<Field />, <Field />])),
      );
      const ids = Array.from(container.querySelectorAll('input')).map(
        input => input.id,
      );
      expect(ids).toEqual(
        Array.from(html.matchAll(/id="([^"]*)"/g), match => match[1]),
      );
    });

    // @gate enableCompiledBlocks
    it('hydrates lists of blocks and updates them', async () => {
      const row = ReactDOM.unstable_createBlockTemplate([
        'tr',
        null,
        [['className', 0]],
        [
          ['td', null, null, [{t: 1}]],
          ['td', null, null, [['a', null, [['onClick', 2]], [{t: 3}]]]],
        ],
      ]);
      const table = ReactDOM.unstable_createBlockTemplate([
        'table',
        null,
        null,
        [['tbody', null, null, [{s: 0}]]],
      ]);
      let setRows;
      const selected = [];
      function App() {
        const [rows, set] = React.useState([
          {id: 1, label: 'one'},
          {id: 2, label: 'two'},
          {id: 3, label: 'three'},
        ]);
        setRows = set;
        return block(table, [
          rows.map(r =>
            block(
              row,
              ['', r.id, () => selected.push(r.id), r.label],
              String(r.id),
            ),
          ),
        ]);
      }
      const {container, errors} = await hydrate(<App />);
      expect(errors).toEqual([]);
      const trs = Array.from(container.querySelectorAll('tr'));
      await act(() => container.querySelectorAll('a')[1].click());
      expect(selected).toEqual([2]);
      await act(() =>
        setRows(rows => [rows[2], rows[1], rows[0], {id: 4, label: 'four'}]),
      );
      const updated = Array.from(container.querySelectorAll('tr'));
      expect(updated.slice(0, 3)).toEqual([trs[2], trs[1], trs[0]]);
      expect(container.textContent).toBe('3three2two1one4four');
    });

    // @gate enableCompiledBlocks
    it('hydrates controlled inputs', async () => {
      const template = ReactDOM.unstable_createBlockTemplate([
        'div',
        null,
        null,
        [
          [
            'input',
            {className: 'edit'},
            [
              ['value', 0],
              ['onChange', 1],
            ],
            [],
          ],
          ['span', null, null, [{t: 2}]],
        ],
      ]);
      function App() {
        const [text, setText] = React.useState('draft');
        return block(template, [text, e => setText(e.target.value), text]);
      }
      const {container, errors} = await hydrate(<App />);
      expect(errors).toEqual([]);
      const input = container.querySelector('input');
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      ).set;
      await act(() => {
        setter.call(input, 'final');
        input.dispatchEvent(new Event('input', {bubbles: true}));
      });
      expect(container.querySelector('span').textContent).toBe('final');
      expect(input.value).toBe('final');
    });

    // @gate enableCompiledBlocks
    it('hydrates the HTML of the equivalent host elements', async () => {
      const template = todo();
      const onClick = () => {};
      const {errors, container} = await hydrate(
        block(template, ['done', 'Title', onClick]),
        <li className="done">
          <div className="view">
            <label>Title</label>
            <button className="destroy" />
          </div>
        </li>,
      );
      expect(errors).toEqual([]);
      expect(container.textContent).toBe('Title');
    });

    // @gate enableCompiledBlocks
    it('renders on the client when the server text does not match', async () => {
      const template = todo();
      const onClick = () => {};
      const {errors, container} = await hydrate(
        block(template, ['done', 'Client', onClick]),
        block(template, ['done', 'Server', onClick]),
      );
      expect(errors.length).toBe(1);
      expect(errors[0]).toContain(
        "Hydration failed because the server rendered text didn't match the client.",
      );
      expect(container.textContent).toBe('Client');
    });

    // @gate enableCompiledBlocks
    it('renders on the client when the server structure does not match', async () => {
      const template = todo();
      const onClick = () => {};
      const {errors, container} = await hydrate(
        block(template, ['done', 'Title', onClick]),
        <li className="done">
          <div className="view">
            <span>Title</span>
          </div>
        </li>,
      );
      expect(errors.length).toBe(1);
      expect(errors[0]).toContain(
        "Hydration failed because the server rendered HTML didn't match the client.",
      );
      expect(container.querySelector('label').textContent).toBe('Title');
    });

    // @gate enableCompiledBlocks
    it('hydrates suspense boundaries in slots', async () => {
      const template = ReactDOM.unstable_createBlockTemplate([
        'article',
        null,
        null,
        [['h1', null, null, [{t: 0}]], {s: 1}, ['footer', null, null, ['end']]],
      ]);
      let resolve;
      let resolved = false;
      const promise = new Promise(r => {
        resolve = () => {
          resolved = true;
          r();
        };
      });
      function Body() {
        if (!resolved) {
          throw promise;
        }
        return <p>body</p>;
      }
      const serverElement = block(template, [
        'Post',
        <React.Suspense fallback={<span>loading</span>}>
          <p>body</p>
        </React.Suspense>,
      ]);
      const clientElement = block(template, [
        'Post',
        <React.Suspense fallback={<span>loading</span>}>
          <Body />
        </React.Suspense>,
      ]);
      const {container, errors} = await hydrate(clientElement, serverElement);
      expect(errors).toEqual([]);
      const p = container.querySelector('p');
      expect(container.textContent).toBe('Postbodyend');
      await act(() => resolve());
      expect(container.querySelector('p')).toBe(p);
      expect(container.textContent).toBe('Postbodyend');
    });
  });
});
