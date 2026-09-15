
## Input

```javascript
// @enableStaticIslands
// A list of static items is part of its parent's island (the items are not
// wrapped again). The items of a list whose parent has a handler are wrapped
// with their key. Items with a hydration-sensitive tag (img) are not, and
// neither are their text-only children.
function Toc({sections, onSelect}) {
  return (
    <div>
      <ol>
        {sections.map(section => (
          <li key={section.id}>
            <a href={'#' + section.id}>{section.title}</a>
            <span className="depth">{section.depth}</span>
          </li>
        ))}
      </ol>
      <ul onClick={onSelect}>
        {sections.map(section => (
          <li key={section.id}>
            <a href={'#' + section.id}>{section.title}</a>
            <span className="depth">{section.depth}</span>
          </li>
        ))}
      </ul>
      <ul onClick={onSelect}>
        {sections.map(section => (
          <li key={section.id}>
            <img src={section.icon} />
            <span>{section.title}</span>
          </li>
        ))}
      </ul>
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
// A list of static items is part of its parent's island (the items are not
// wrapped again). The items of a list whose parent has a handler are wrapped
// with their key. Items with a hydration-sensitive tag (img) are not, and
// neither are their text-only children.
function Toc(t0) {
  const $ = _c(20);
  const { sections, onSelect } = t0;
  let t1;
  if ($[0] !== sections) {
    t1 = sections.map(_temp);
    $[0] = sections;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] !== t1) {
    t2 = <ol>{t1}</ol>;
    $[2] = t1;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  let t3;
  if ($[4] !== t2) {
    t3 = <StaticIsland>{t2}</StaticIsland>;
    $[4] = t2;
    $[5] = t3;
  } else {
    t3 = $[5];
  }
  let t4;
  if ($[6] !== sections) {
    t4 = sections.map(_temp2);
    $[6] = sections;
    $[7] = t4;
  } else {
    t4 = $[7];
  }
  let t5;
  if ($[8] !== onSelect || $[9] !== t4) {
    t5 = <ul onClick={onSelect}>{t4}</ul>;
    $[8] = onSelect;
    $[9] = t4;
    $[10] = t5;
  } else {
    t5 = $[10];
  }
  let t6;
  if ($[11] !== sections) {
    t6 = sections.map(_temp3);
    $[11] = sections;
    $[12] = t6;
  } else {
    t6 = $[12];
  }
  let t7;
  if ($[13] !== onSelect || $[14] !== t6) {
    t7 = <ul onClick={onSelect}>{t6}</ul>;
    $[13] = onSelect;
    $[14] = t6;
    $[15] = t7;
  } else {
    t7 = $[15];
  }
  let t8;
  if ($[16] !== t3 || $[17] !== t5 || $[18] !== t7) {
    t8 = (
      <div>
        {t3}
        {t5}
        {t7}
      </div>
    );
    $[16] = t3;
    $[17] = t5;
    $[18] = t7;
    $[19] = t8;
  } else {
    t8 = $[19];
  }
  return t8;
}
function _temp3(section_1) {
  return (
    <li key={section_1.id}>
      <img src={section_1.icon} />
      <span>{section_1.title}</span>
    </li>
  );
}
function _temp2(section_0) {
  return (
    <StaticIsland key={section_0.id}>
      <li key={section_0.id}>
        <a href={"#" + section_0.id}>{section_0.title}</a>
        <span className="depth">{section_0.depth}</span>
      </li>
    </StaticIsland>
  );
}
function _temp(section) {
  return (
    <li key={section.id}>
      <a href={"#" + section.id}>{section.title}</a>
      <span className="depth">{section.depth}</span>
    </li>
  );
}

```
      