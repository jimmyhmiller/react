
## Input

```javascript
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

```

## Code

```javascript
import { unstable_createBlockTemplate as _createBlockTemplate } from "react-dom";
import { c as _c } from "react/compiler-runtime";
const _BlockTemplate = _createBlockTemplate([
  "li",
  null,
  [["className", 0]],
  [["span", null, null, [{ s: 1 }]]],
]);
const _BlockTemplate2 = _createBlockTemplate([
  "section",
  null,
  null,
  [
    ["h2", null, null, [{ s: 0 }]],
    ["ul", null, null, [{ s: 1 }]],
  ],
]);
const _BlockTemplate3 = _createBlockTemplate([
  "main",
  null,
  null,
  [
    ["h1", null, null, ["Groups"]],
    { s: 0 },
    [
      "section",
      null,
      null,
      [
        ["h2", null, null, [{ s: 1 }]],
        ["ul", null, null, [{ s: 2 }]],
      ],
    ],
  ],
]);
const _BlockTemplate4 = _createBlockTemplate([
  "div",
  null,
  null,
  [["p", null, null, [{ s: 0 }]], { s: 1 }],
]); // @enableJsxBlocks @enableComponentInlining
// Leaf blocks are inlined into nested rendered callbacks, including a
// callback that is itself produced by inlining Group.
function Leaf(t0) {
  const $ = _c(5);
  const { leaf } = t0;
  let t1;
  if ($[0] !== leaf.className || $[1] !== leaf.text) {
    t1 = [leaf.className, leaf.text];
    $[0] = leaf.className;
    $[1] = leaf.text;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  let t2;
  if ($[3] !== t1) {
    t2 = <_BlockTemplate v={t1} />;
    $[3] = t1;
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  return t2;
}

function Group(t0) {
  const $ = _c(7);
  const { group } = t0;

  const t1 = group.title;
  let t2;
  if ($[0] !== group.leaves) {
    t2 = group.leaves.map(_temp);
    $[0] = group.leaves;
    $[1] = t2;
  } else {
    t2 = $[1];
  }
  let t3;
  if ($[2] !== group.title || $[3] !== t2) {
    t3 = [t1, t2];
    $[2] = group.title;
    $[3] = t2;
    $[4] = t3;
  } else {
    t3 = $[4];
  }
  let t4;
  if ($[5] !== t3) {
    t4 = <_BlockTemplate2 v={t3} />;
    $[5] = t3;
    $[6] = t4;
  } else {
    t4 = $[6];
  }
  return t4;
}
function _temp(leaf) {
  const leaf$0 = leaf;
  return <_BlockTemplate key={leaf.id} v={[leaf$0.className, leaf$0.text]} />;
}

function Groups(t0) {
  const $ = _c(10);
  const { groups } = t0;
  let t1;
  if ($[0] !== groups) {
    t1 = groups.map(_temp3);
    $[0] = groups;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const group = groups[0];
  const t2 = group.title;
  let t3;
  if ($[2] !== group.leaves) {
    t3 = group.leaves.map(_temp4);
    $[2] = group.leaves;
    $[3] = t3;
  } else {
    t3 = $[3];
  }
  let t4;
  if ($[4] !== group.title || $[5] !== t1 || $[6] !== t3) {
    t4 = [t1, t2, t3];
    $[4] = group.title;
    $[5] = t1;
    $[6] = t3;
    $[7] = t4;
  } else {
    t4 = $[7];
  }
  let t5;
  if ($[8] !== t4) {
    t5 = <_BlockTemplate3 v={t4} />;
    $[8] = t4;
    $[9] = t5;
  } else {
    t5 = $[9];
  }
  return t5;
}
function _temp4(leaf) {
  const leaf$0 = leaf;
  return <_BlockTemplate key={leaf.id} v={[leaf$0.className, leaf$0.text]} />;
}
function _temp3(group) {
  return (
    <_BlockTemplate4 key={group.id} v={[group.id, group.leaves.map(_temp2)]} />
  );
}
function _temp2(leaf) {
  const leaf$0 = leaf;
  return <_BlockTemplate key={leaf.id} v={[leaf$0.className, leaf$0.text]} />;
}

```
      