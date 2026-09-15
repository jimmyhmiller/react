// @enableJsxBlocks @enableListItemMemoization
// Two selections, one compared twice and one compared only when the first
// matches. Each comparison is recorded for the item that makes it.
function Tree({nodes, openGroup, activeId}) {
  return (
    <ul>
      {nodes.map(node => {
        const open = node.group === openGroup;
        const active = open && node.id === activeId;
        const alias = node.alias === activeId;
        return (
          <li key={node.id} className={active || alias ? 'active' : ''}>
            <b>{open ? node.label : '...'}</b>
          </li>
        );
      })}
    </ul>
  );
}
