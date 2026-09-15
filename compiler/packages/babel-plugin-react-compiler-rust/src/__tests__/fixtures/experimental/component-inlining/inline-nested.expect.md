
## Input

```javascript
// @enableComponentInlining
function Icon({name}) {
  return <i className={'icon-' + name} />;
}

function Button({label, icon}) {
  return (
    <button>
      <Icon name={icon} />
      {label}
    </button>
  );
}

function Toolbar(props) {
  return (
    <div>
      <Button label="Save" icon="save" />
      <Button label={props.label} icon="edit" />
    </div>
  );
}

export const FIXTURE_ENTRYPOINT = {
  fn: Toolbar,
  params: [{label: 'Edit'}],
  sequentialRenders: [{label: 'Edit'}, {label: 'Change'}],
};

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime"; // @enableComponentInlining
function Icon(t0) {
  const $ = _c(2);
  const { name } = t0;
  const t1 = "icon-" + name;
  let t2;
  if ($[0] !== t1) {
    t2 = <i className={t1} />;
    $[0] = t1;
    $[1] = t2;
  } else {
    t2 = $[1];
  }
  return t2;
}

function Button(t0) {
  const $ = _c(5);
  const { label, icon } = t0;

  const name = icon;
  const t1 = "icon-" + name;
  let t2;
  if ($[0] !== t1) {
    t2 = <i className={t1} />;
    $[0] = t1;
    $[1] = t2;
  } else {
    t2 = $[1];
  }
  const t3 = t2;
  let t4;
  if ($[2] !== label || $[3] !== t3) {
    t4 = (
      <button>
        {t3}
        {label}
      </button>
    );
    $[2] = label;
    $[3] = t3;
    $[4] = t4;
  } else {
    t4 = $[4];
  }
  return t4;
}

function Toolbar(props) {
  const $ = _c(4);

  let label;
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = (
      <button>
        <i className="icon-save" />
        {"Save"}
      </button>
    );
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  const label$0 = props.label;
  let t1;
  if ($[1] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = <i className="icon-edit" />;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] !== label$0) {
    t2 = (
      <div>
        {t0}
        <button>
          {t1}
          {label$0}
        </button>
      </div>
    );
    $[2] = label$0;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  return t2;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Toolbar,
  params: [{ label: "Edit" }],
  sequentialRenders: [{ label: "Edit" }, { label: "Change" }],
};

```
      
### Eval output
(kind: ok) <div><button><i class="icon-save"></i>Save</button><button><i class="icon-edit"></i>Edit</button></div>
<div><button><i class="icon-save"></i>Save</button><button><i class="icon-edit"></i>Change</button></div>