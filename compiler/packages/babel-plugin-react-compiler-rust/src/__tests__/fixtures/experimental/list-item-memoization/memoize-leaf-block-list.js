// @enableJsxBlocks @enableComponentInlining @enableListItemMemoization
// Each row of the list is memoized separately, in a memo cache per item
// provided by unstable_useListItemMemoCache. `selectedId` is only compared with
// `===`, so it is a selection: the callback reads it through
// `listItemCache.is` and the list is mapped by `listItemCache.map`.
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
