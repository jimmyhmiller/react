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
let ReactDOMClient;
let ReactDOMServer;
let Scheduler;
let act;
let assertLog;
let waitForAll;
let StaticIsland;

describe('ReactDOM static islands', () => {
  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ReactDOMClient = require('react-dom/client');
    ReactDOMServer = require('react-dom/server');
    Scheduler = require('scheduler');
    ({act, assertLog, waitForAll} = require('internal-test-utils'));
    StaticIsland = require('react/compiler-runtime').unstable_StaticIsland;
  });

  // A component without state, effects, refs, context or handlers.
  function Article({title, paragraphs}) {
    Scheduler.log('Article ' + title);
    return (
      <article>
        <h2>{title}</h2>
        {paragraphs.map(text => (
          <p key={text}>{text}</p>
        ))}
      </article>
    );
  }

  // Whether React owns a DOM node (it was hydrated or rendered by React).
  function hasFiber(node) {
    return Object.keys(node).some(key => key.startsWith('__reactFiber$'));
  }

  // Renders `element` on the server and hydrates it. In development, a static
  // island is verified by hydrating a copy of it in a separate root, which
  // renders its components: the log of that is cleared.
  async function serverRenderAndHydrate(element) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = ReactDOMServer.renderToString(element);
    Scheduler.unstable_clearLog();
    const errors = [];
    let root;
    await act(() => {
      root = ReactDOMClient.hydrateRoot(container, element, {
        onRecoverableError(error) {
          errors.push(error.message);
        },
      });
    });
    Scheduler.unstable_clearLog();
    return {container, root, errors};
  }

  // @gate enableStaticIslands
  it('delimits static content on the server and renders it on the client', async () => {
    const island = (
      <StaticIsland>
        <Article title="A" paragraphs={['one', 'two']} />
      </StaticIsland>
    );
    const html = ReactDOMServer.renderToString(<div>{island}</div>);
    expect(html).toBe(
      '<div><!--~--><article><h2>A</h2><p>one</p><p>two</p></article><!--/~--></div>',
    );
    assertLog(['Article A']);

    const container = document.createElement('div');
    const root = ReactDOMClient.createRoot(container);
    await act(() => root.render(<div>{island}</div>));
    assertLog(['Article A']);
    expect(container.innerHTML).toBe(
      '<div><article><h2>A</h2><p>one</p><p>two</p></article></div>',
    );
  });

  // @gate enableStaticIslands
  it('is not hydrated', async () => {
    const {container, errors} = await serverRenderAndHydrate(
      <div>
        <StaticIsland>
          <Article title="A" paragraphs={['one', 'two']} />
        </StaticIsland>
      </div>,
    );
    expect(errors).toEqual([]);
    const article = container.querySelector('article');
    expect(hasFiber(container.firstChild)).toBe(true);
    expect(hasFiber(article)).toBe(false);
    // It is not hydrated later either.
    await waitForAll([]);
    await act(() => Scheduler.unstable_advanceTime(10000));
    assertLog([]);
    expect(hasFiber(article)).toBe(false);
    expect(container.querySelector('article')).toBe(article);
  });

  // @gate enableStaticIslands
  it('dispatches events inside it to ancestors without hydrating it', async () => {
    const clicks = [];
    function App() {
      return (
        <section onClick={event => clicks.push(event.target.textContent)}>
          <StaticIsland>
            <Article title="A" paragraphs={['one', 'two']} />
          </StaticIsland>
        </section>
      );
    }
    const {container} = await serverRenderAndHydrate(<App />);
    const paragraph = container.querySelectorAll('p')[1];
    await act(() => paragraph.click());
    expect(clicks).toEqual(['two']);
    assertLog([]);
    await act(() => {
      paragraph.dispatchEvent(new MouseEvent('mouseover', {bubbles: true}));
    });
    assertLog([]);
    expect(hasFiber(paragraph)).toBe(false);
  });

  // @gate enableStaticIslands
  it('hydrates when it receives new props, then updates', async () => {
    let setTitle;
    function App() {
      const [title, set] = React.useState('A');
      setTitle = set;
      return (
        <div>
          <StaticIsland>
            <Article title={title} paragraphs={['one']} />
          </StaticIsland>
        </div>
      );
    }
    const {container, errors} = await serverRenderAndHydrate(<App />);
    expect(errors).toEqual([]);
    const paragraph = container.querySelector('p');
    expect(hasFiber(paragraph)).toBe(false);
    await act(() => setTitle('B'));
    // Hydrated with the old props, then rendered with the new ones.
    assertLog(['Article A', 'Article B']);
    expect(errors).toEqual([]);
    expect(container.querySelector('h2').textContent).toBe('B');
    expect(container.querySelector('p')).toBe(paragraph);
    expect(hasFiber(paragraph)).toBe(true);
  });

  // @gate enableStaticIslands
  it('removes its server DOM when it unmounts', async () => {
    let setShow;
    function App() {
      const [show, set] = React.useState(true);
      setShow = set;
      return (
        <div>
          <span>before</span>
          {show ? (
            <StaticIsland>
              <Article title="A" paragraphs={['one']} />
            </StaticIsland>
          ) : null}
          <span>after</span>
        </div>
      );
    }
    const {container} = await serverRenderAndHydrate(<App />);
    await act(() => setShow(false));
    assertLog([]);
    expect(container.innerHTML).toBe(
      '<div><span>before</span><span>after</span></div>',
    );
  });

  // @gate enableStaticIslands
  it('keeps its position when content is inserted around it', async () => {
    // Memoized, like the compiler memoizes an element without reactive inputs.
    const staticArticle = (
      <StaticIsland>
        <Article title="A" paragraphs={['one']} />
      </StaticIsland>
    );
    let setItems;
    function App() {
      const [items, set] = React.useState([]);
      setItems = set;
      return (
        <div>
          {items.includes('first') ? <span>first</span> : null}
          {staticArticle}
          {items.includes('last') ? <span>last</span> : null}
        </div>
      );
    }
    const {container} = await serverRenderAndHydrate(<App />);
    await act(() => setItems(['first', 'last']));
    assertLog([]);
    expect(container.textContent).toBe('firstAonelast');
    const div = container.firstChild;
    expect(div.firstChild.textContent).toBe('first');
    expect(div.lastChild.textContent).toBe('last');
  });

  // @gate enableStaticIslands
  it('renders on the client when it is moved', async () => {
    let setOrder;
    function App() {
      const [order, set] = React.useState(['A', 'B']);
      setOrder = set;
      return (
        <div>
          {order.map(title => (
            <StaticIsland key={title}>
              <Article title={title} paragraphs={['text']} />
            </StaticIsland>
          ))}
        </div>
      );
    }
    const {container, errors} = await serverRenderAndHydrate(<App />);
    expect(errors).toEqual([]);
    await act(() => setOrder(['B', 'A']));
    expect(
      Array.from(container.querySelectorAll('h2')).map(h2 => h2.textContent),
    ).toEqual(['B', 'A']);
    Scheduler.unstable_clearLog();
    await act(() => setOrder(['A', 'B']));
    expect(
      Array.from(container.querySelectorAll('h2')).map(h2 => h2.textContent),
    ).toEqual(['A', 'B']);
    Scheduler.unstable_clearLog();
  });

  // @gate enableStaticIslands
  it('is hidden with its Suspense boundary', async () => {
    const staticArticle = (
      <StaticIsland>
        <Article title="A" paragraphs={['one']} />
      </StaticIsland>
    );
    let suspend = false;
    const never = new Promise(() => {});
    function Suspender() {
      if (suspend) {
        React.use(never);
      }
      return null;
    }
    let rerender;
    function App() {
      const [, set] = React.useState(0);
      rerender = () => set(n => n + 1);
      return (
        <React.Suspense fallback={<span>loading</span>}>
          <div>{staticArticle}</div>
          <Suspender />
        </React.Suspense>
      );
    }
    const {container, errors} = await serverRenderAndHydrate(<App />);
    expect(errors).toEqual([]);
    const article = container.querySelector('article');
    suspend = true;
    await act(() => rerender());
    expect(container.querySelector('div').style.display).toBe('none');
    expect(container.textContent).toContain('loading');
    suspend = false;
    await act(() => rerender());
    expect(container.querySelector('div').style.display).toBe('');
    expect(container.querySelector('article')).toBe(article);
    assertLog([]);
  });

  // @gate enableStaticIslands
  it('renders content that needs hydration without delimiting it', async () => {
    const clicks = [];
    function Counter() {
      const [count] = React.useState(0);
      return <b>{count}</b>;
    }
    class Legacy extends React.Component {
      render() {
        return <i>legacy</i>;
      }
    }
    function Page() {
      return (
        <div>
          text
          <StaticIsland>
            <button onClick={() => clicks.push('button')}>press</button>
          </StaticIsland>
          <StaticIsland>
            <Counter />
          </StaticIsland>
          <StaticIsland>
            <Legacy />
          </StaticIsland>
          <StaticIsland>
            <span>static</span>
            <StaticIsland>
              <Counter />
            </StaticIsland>
          </StaticIsland>
          <StaticIsland>
            <em>static</em>
          </StaticIsland>
        </div>
      );
    }
    const html = ReactDOMServer.renderToString(<Page />);
    expect(html).toBe(
      '<div>text<!-- --><button>press</button><b>0</b><i>legacy</i>' +
        '<span>static</span><b>0</b><!--~--><em>static</em><!--/~--></div>',
    );
    const {container, errors} = await serverRenderAndHydrate(<Page />);
    expect(errors).toEqual([]);
    expect(hasFiber(container.querySelector('button'))).toBe(true);
    expect(hasFiber(container.querySelector('b'))).toBe(true);
    expect(hasFiber(container.querySelector('span'))).toBe(true);
    expect(hasFiber(container.querySelector('em'))).toBe(false);
    await act(() => container.querySelector('button').click());
    expect(clicks).toEqual(['button']);
  });

  // @gate enableStaticIslands
  it('is hidden with a Suspense boundary it is a direct child of', async () => {
    const staticArticle = (
      <StaticIsland>
        <Article title="A" paragraphs={['one']} />
      </StaticIsland>
    );
    let suspend = false;
    const never = new Promise(() => {});
    function Suspender() {
      if (suspend) {
        React.use(never);
      }
      return <span>after</span>;
    }
    let rerender;
    function App() {
      const [, set] = React.useState(0);
      rerender = () => set(n => n + 1);
      return (
        <section>
          <React.Suspense fallback={<span>loading</span>}>
            {staticArticle}
            <Suspender />
          </React.Suspense>
        </section>
      );
    }
    const {container, errors} = await serverRenderAndHydrate(<App />);
    expect(errors).toEqual([]);
    const article = container.querySelector('article');
    const after = container.querySelector('span');
    suspend = true;
    await act(() => rerender());
    expect(article.style.display).toBe('none');
    expect(after.style.display).toBe('none');
    suspend = false;
    await act(() => rerender());
    expect(article.style.display).toBe('');
    expect(after.style.display).toBe('');
    expect(container.querySelector('article')).toBe(article);
    assertLog([]);
  });

  // @gate enableStaticIslands
  it('reports a mismatch with the server HTML in development only', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = ReactDOMServer.renderToString(
      <div>
        <StaticIsland>
          <Article title="Server" paragraphs={['one']} />
        </StaticIsland>
      </div>,
    );
    Scheduler.unstable_clearLog();
    const errors = [];
    const consoleErrors = [];
    const originalError = console.error;
    console.error = (...args) => consoleErrors.push(args.join(' '));
    try {
      await act(() => {
        ReactDOMClient.hydrateRoot(
          container,
          <div>
            <StaticIsland>
              <Article title="Client" paragraphs={['one']} />
            </StaticIsland>
          </div>,
          {
            onRecoverableError(error) {
              errors.push(error.message);
            },
          },
        );
      });
      Scheduler.unstable_clearLog();
      await waitForAll([]);
    } finally {
      console.error = originalError;
    }
    // The island is not hydrated: the root has no errors and keeps the server
    // HTML.
    expect(errors).toEqual([]);
    expect(container.querySelector('h2').textContent).toBe('Server');
    const reported = consoleErrors.filter(message =>
      message.includes("A static island's server-rendered HTML"),
    );
    if (__DEV__) {
      expect(reported.length).toBe(1);
    } else {
      expect(reported.length).toBe(0);
      Scheduler.unstable_clearLog();
    }
    Scheduler.unstable_clearLog();
  });
});
