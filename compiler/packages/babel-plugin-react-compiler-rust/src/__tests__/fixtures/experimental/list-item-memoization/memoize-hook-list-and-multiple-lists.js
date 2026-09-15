// @enableJsxBlocks @enableListItemMemoization
// Each list gets its own cache; the hooks are called at the start of the
// component, before any other code.
import {useState} from 'react';

function Lists({left, right}) {
  const [selected, setSelected] = useState(null);
  return (
    <main>
      <ul>
        {left.map(item => (
          <li key={item.id} className={item.id === selected ? 'on' : ''}>
            <a onClick={() => setSelected(item.id)}>{item.label}</a>
          </li>
        ))}
      </ul>
      <ol>
        {right.map(item => (
          <li key={item.id}>
            <span>{`${item.label} (${item.count})`}</span>
          </li>
        ))}
      </ol>
    </main>
  );
}
