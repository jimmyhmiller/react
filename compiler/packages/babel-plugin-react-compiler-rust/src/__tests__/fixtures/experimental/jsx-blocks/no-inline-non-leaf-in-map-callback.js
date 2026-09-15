// @enableJsxBlocks @enableComponentInlining
// Badge calls a hook, so it cannot be inlined into Item. Item's block then has
// a slot holding Badge's element: Item is not a leaf block and stays the
// per-item memoization boundary of the callback.
import {useState} from 'react';

function Badge({count}) {
  const [highlighted] = useState(false);
  return <b className={highlighted ? 'on' : 'off'}>{count}</b>;
}

function Item({item}) {
  return (
    <li>
      <span>{item.label}</span>
      <Badge count={item.count} />
    </li>
  );
}

function List({items}) {
  return (
    <ul>
      <li>header</li>
      {items.map(item => (
        <Item key={item.id} item={item} />
      ))}
    </ul>
  );
}
