
## Input

```javascript
// @enableStaticIslands @enableJsxBlocks
// The content of an island is compiled into a block.
function Card({title, body}) {
  const [liked, setLiked] = useState(false);
  return (
    <div className="card">
      <button onClick={() => setLiked(!liked)}>{liked ? 'Liked' : 'Like'}</button>
      <section className="body">
        <h3>{title}</h3>
        <p>{body}</p>
      </section>
    </div>
  );
}

```

## Code

```javascript
import { unstable_createBlockTemplate as _createBlockTemplate } from "react-dom";
import {
  c as _c,
  unstable_StaticIsland as StaticIsland,
} from "react/compiler-runtime";
const _BlockTemplate = _createBlockTemplate([
  "section",
  { className: "body" },
  null,
  [
    ["h3", null, null, [{ s: 0 }]],
    ["p", null, null, [{ s: 1 }]],
  ],
]);
const _BlockTemplate2 = _createBlockTemplate([
  "div",
  { className: "card" },
  null,
  [["button", null, [["onClick", 0]], [{ s: 1 }]], { s: 2 }],
]); // @enableStaticIslands @enableJsxBlocks
// The content of an island is compiled into a block.
function Card(t0) {
  const $ = _c(15);
  const { title, body } = t0;
  const [liked, setLiked] = useState(false);
  let t1;
  if ($[0] !== liked) {
    t1 = () => setLiked(!liked);
    $[0] = liked;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const t2 = liked ? "Liked" : "Like";
  let t3;
  if ($[2] !== body || $[3] !== title) {
    t3 = [title, body];
    $[2] = body;
    $[3] = title;
    $[4] = t3;
  } else {
    t3 = $[4];
  }
  let t4;
  if ($[5] !== t3) {
    t4 = <_BlockTemplate v={t3} />;
    $[5] = t3;
    $[6] = t4;
  } else {
    t4 = $[6];
  }
  let t5;
  if ($[7] !== t4) {
    t5 = <StaticIsland>{t4}</StaticIsland>;
    $[7] = t4;
    $[8] = t5;
  } else {
    t5 = $[8];
  }
  let t6;
  if ($[9] !== t1 || $[10] !== t2 || $[11] !== t5) {
    t6 = [t1, t2, t5];
    $[9] = t1;
    $[10] = t2;
    $[11] = t5;
    $[12] = t6;
  } else {
    t6 = $[12];
  }
  let t7;
  if ($[13] !== t6) {
    t7 = <_BlockTemplate2 v={t6} />;
    $[13] = t6;
    $[14] = t7;
  } else {
    t7 = $[14];
  }
  return t7;
}

```
      