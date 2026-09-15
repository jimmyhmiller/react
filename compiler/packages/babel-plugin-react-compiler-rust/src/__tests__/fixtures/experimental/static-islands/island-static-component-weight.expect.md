
## Input

```javascript
// @enableStaticIslands
// An element of a static component weighs what the component renders: <Links />
// renders a list and is wrapped, <Label /> renders one element and is not.
function Links({links}) {
  return (
    <nav>
      <h3>Links</h3>
      <ul>
        {links.map(link => (
          <li key={link.href}>
            <a href={link.href}>{link.title}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Label({text}) {
  return <span className="label">{text}</span>;
}

function Page({links, title, onClose}) {
  return (
    <div>
      <button onClick={onClose}>close</button>
      <Label text={title} />
      <Links links={links} />
    </div>
  );
}

```

## Code

```javascript
import {
  c as _c,
  unstable_StaticIsland as StaticIsland,
} from "react/compiler-runtime"; // @enableStaticIslands
// An element of a static component weighs what the component renders: <Links />
// renders a list and is wrapped, <Label /> renders one element and is not.
function Links(t0) {
  const $ = _c(5);
  const { links } = t0;
  let t1;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = <h3>Links</h3>;
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  let t2;
  if ($[1] !== links) {
    t2 = links.map(_temp);
    $[1] = links;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  let t3;
  if ($[3] !== t2) {
    t3 = (
      <nav>
        {t1}
        <ul>{t2}</ul>
      </nav>
    );
    $[3] = t2;
    $[4] = t3;
  } else {
    t3 = $[4];
  }
  return t3;
}
function _temp(link) {
  return (
    <li key={link.href}>
      <a href={link.href}>{link.title}</a>
    </li>
  );
}

function Label(t0) {
  const $ = _c(2);
  const { text } = t0;
  let t1;
  if ($[0] !== text) {
    t1 = <span className="label">{text}</span>;
    $[0] = text;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  return t1;
}

function Page(t0) {
  const $ = _c(12);
  const { links, title, onClose } = t0;
  let t1;
  if ($[0] !== onClose) {
    t1 = <button onClick={onClose}>close</button>;
    $[0] = onClose;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] !== title) {
    t2 = <Label text={title} />;
    $[2] = title;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  let t3;
  if ($[4] !== links) {
    t3 = <Links links={links} />;
    $[4] = links;
    $[5] = t3;
  } else {
    t3 = $[5];
  }
  let t4;
  if ($[6] !== t3) {
    t4 = <StaticIsland>{t3}</StaticIsland>;
    $[6] = t3;
    $[7] = t4;
  } else {
    t4 = $[7];
  }
  let t5;
  if ($[8] !== t1 || $[9] !== t2 || $[10] !== t4) {
    t5 = (
      <div>
        {t1}
        {t2}
        {t4}
      </div>
    );
    $[8] = t1;
    $[9] = t2;
    $[10] = t4;
    $[11] = t5;
  } else {
    t5 = $[11];
  }
  return t5;
}

```
      