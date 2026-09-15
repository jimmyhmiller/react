// @enableJsxBlocks @enableComponentInlining
// Leaf blocks are inlined into nested rendered callbacks, including a
// callback that is itself produced by inlining Group.
function Leaf({leaf}) {
  return (
    <li className={leaf.className}>
      <span>{leaf.text}</span>
    </li>
  );
}

function Group({group}) {
  return (
    <section>
      <h2>{group.title}</h2>
      <ul>
        {group.leaves.map(leaf => (
          <Leaf key={leaf.id} leaf={leaf} />
        ))}
      </ul>
    </section>
  );
}

function Groups({groups}) {
  return (
    <main>
      <h1>Groups</h1>
      {groups.map(group => (
        <div key={group.id}>
          <p>{group.id}</p>
          {group.leaves.map(leaf => (
            <Leaf key={leaf.id} leaf={leaf} />
          ))}
        </div>
      ))}
      <Group group={groups[0]} />
    </main>
  );
}
