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
let useContextWithSelector;

describe('ReactDOM unstable_useContextWithSelector', () => {
  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ReactDOMClient = require('react-dom/client');
    ReactDOMServer = require('react-dom/server');
    Scheduler = require('scheduler');
    ({act, assertLog} = require('internal-test-utils'));
    useContextWithSelector =
      require('react/compiler-runtime').unstable_useContextWithSelector;
  });

  // @gate enableContextSelectors
  it('renders on the server and hydrates', async () => {
    const Theme = React.createContext(null);
    let setTheme;
    function App() {
      const [theme, set] = React.useState({color: 'red', counter: 0});
      setTheme = set;
      return (
        <Theme.Provider value={theme}>
          <Swatch />
        </Theme.Provider>
      );
    }
    const Swatch = React.memo(function Swatch() {
      const theme = useContextWithSelector(Theme, value => [value.color]);
      Scheduler.log('swatch ' + theme.color);
      return <span className={theme.color}>{theme.color}</span>;
    });

    const html = ReactDOMServer.renderToString(<App />);
    assertLog(['swatch red']);
    expect(html).toBe('<span class="red">red</span>');

    const container = document.createElement('div');
    container.innerHTML = html;
    const span = container.firstChild;
    await act(() => ReactDOMClient.hydrateRoot(container, <App />));
    assertLog(['swatch red']);
    expect(container.firstChild).toBe(span);

    await act(() => setTheme(t => ({...t, counter: t.counter + 1})));
    assertLog([]);
    await act(() => setTheme(t => ({...t, color: 'blue'})));
    assertLog(['swatch blue']);
    expect(container.innerHTML).toBe('<span class="blue">blue</span>');
    expect(container.firstChild).toBe(span);
  });
});
