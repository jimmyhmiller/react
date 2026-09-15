/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// The keyed React hooks implementation from js-framework-benchmark
// (https://github.com/krausest/js-framework-benchmark), with two changes:
// `Row` is a plain component (the compiler memoizes it, so `memo` is not
// needed), and labels use a seeded random number generator so that every
// variant renders identical data.

import {useReducer} from 'react';

const adjectives = [
  'pretty', 'large', 'big', 'small', 'tall', 'short', 'long', 'handsome',
  'plain', 'quaint', 'clean', 'elegant', 'easy', 'angry', 'crazy', 'helpful',
  'mushy', 'odd', 'unsightly', 'adorable', 'important', 'inexpensive',
  'cheap', 'expensive', 'fancy',
];
const colours = [
  'red', 'yellow', 'blue', 'green', 'pink', 'brown', 'purple', 'brown',
  'white', 'black', 'orange',
];
const nouns = [
  'table', 'chair', 'house', 'bbq', 'desk', 'car', 'pony', 'cookie',
  'sandwich', 'burger', 'pizza', 'mouse', 'keyboard',
];

let seed = 1;
function random(max) {
  // Park-Miller LCG.
  seed = (seed * 48271) % 2147483647;
  return seed % max;
}

let nextId = 1;
function buildData(count) {
  const data = new Array(count);
  for (let i = 0; i < count; i++) {
    data[i] = {
      id: nextId++,
      label: `${adjectives[random(adjectives.length)]} ${
        colours[random(colours.length)]
      } ${nouns[random(nouns.length)]}`,
    };
  }
  return data;
}

const initialState = {data: [], selected: 0};

function listReducer(state, action) {
  const {data, selected} = state;
  switch (action.type) {
    case 'RUN':
      return {data: buildData(1000), selected: 0};
    case 'RUN_LOTS':
      return {data: buildData(10000), selected: 0};
    case 'ADD':
      return {data: data.concat(buildData(1000)), selected};
    case 'UPDATE': {
      const newData = data.slice(0);
      for (let i = 0; i < newData.length; i += 10) {
        const r = newData[i];
        newData[i] = {id: r.id, label: r.label + ' !!!'};
      }
      return {data: newData, selected};
    }
    case 'CLEAR':
      return {data: [], selected: 0};
    case 'SWAP_ROWS': {
      const newData = data.slice(0);
      if (newData.length > 998) {
        const d1 = newData[1];
        newData[1] = newData[998];
        newData[998] = d1;
      }
      return {data: newData, selected};
    }
    case 'REMOVE': {
      const idx = data.findIndex(d => d.id === action.id);
      return {
        data: [...data.slice(0, idx), ...data.slice(idx + 1)],
        selected,
      };
    }
    case 'SELECT':
      return {data, selected: action.id};
    default:
      return state;
  }
}

function Row({selected, item, dispatch}) {
  return (
    <tr className={selected ? 'danger' : ''}>
      <td className="col-md-1">{item.id}</td>
      <td className="col-md-4">
        <a onClick={() => dispatch({type: 'SELECT', id: item.id})}>
          {item.label}
        </a>
      </td>
      <td className="col-md-1">
        <a onClick={() => dispatch({type: 'REMOVE', id: item.id})}>
          <span className="glyphicon glyphicon-remove" aria-hidden="true" />
        </a>
      </td>
      <td className="col-md-6" />
    </tr>
  );
}

function Button({id, cb, title}) {
  return (
    <div className="col-sm-6 smallpad">
      <button
        type="button"
        className="btn btn-primary btn-block"
        id={id}
        onClick={cb}>
        {title}
      </button>
    </div>
  );
}

export default function RowsApp() {
  const [{data, selected}, dispatch] = useReducer(listReducer, initialState);

  return (
    <div className="container">
      <div className="jumbotron">
        <div className="row">
          <div className="col-md-6">
            <h1>React Hooks keyed</h1>
          </div>
          <div className="col-md-6">
            <div className="row">
              <Button
                id="run"
                title="Create 1,000 rows"
                cb={() => dispatch({type: 'RUN'})}
              />
              <Button
                id="runlots"
                title="Create 10,000 rows"
                cb={() => dispatch({type: 'RUN_LOTS'})}
              />
              <Button
                id="add"
                title="Append 1,000 rows"
                cb={() => dispatch({type: 'ADD'})}
              />
              <Button
                id="update"
                title="Update every 10th row"
                cb={() => dispatch({type: 'UPDATE'})}
              />
              <Button
                id="clear"
                title="Clear"
                cb={() => dispatch({type: 'CLEAR'})}
              />
              <Button
                id="swaprows"
                title="Swap Rows"
                cb={() => dispatch({type: 'SWAP_ROWS'})}
              />
            </div>
          </div>
        </div>
      </div>
      <table className="table table-hover table-striped test-data">
        <tbody>
          {data.map(item => (
            <Row
              key={item.id}
              item={item}
              selected={selected === item.id}
              dispatch={dispatch}
            />
          ))}
        </tbody>
      </table>
      <span className="preloadicon glyphicon glyphicon-remove" aria-hidden="true" />
    </div>
  );
}
