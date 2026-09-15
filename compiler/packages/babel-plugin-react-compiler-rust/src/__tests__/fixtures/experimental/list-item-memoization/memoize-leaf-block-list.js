// @enableJsxBlocks @enableComponentInlining @enableListItemMemoization
// Each row of the list is memoized separately: the callback's body moves to a
// module-level function whose memo cache is provided per item by
// unstable_useListItemMemoCache.
function Row({item, selected, onSelect}) {
  return (
    <tr className={selected ? 'danger' : ''}>
      <td className="col-md-1">{item.id}</td>
      <td className="col-md-4">
        <a onClick={() => onSelect(item.id)}>{item.label}</a>
      </td>
    </tr>
  );
}

function Table({items, selectedId, onSelect}) {
  return (
    <table>
      <tbody>
        {items.map(item => (
          <Row
            key={item.id}
            item={item}
            selected={item.id === selectedId}
            onSelect={onSelect}
          />
        ))}
      </tbody>
    </table>
  );
}
