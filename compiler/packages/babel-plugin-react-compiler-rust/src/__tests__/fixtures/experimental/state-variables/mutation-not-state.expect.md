
## Input

```javascript
// @enableStateVariables
import {useRef} from 'react';

// Not state: a ref (modified after render by design), a `const` (calling a
// method of what a hook returned is not an update of the component's state),
// and a `let` that is only modified during render.
function Form({onSubmit}) {
  let ref = useRef(null);
  const form = useForm();
  let fields = [];
  fields.push('name');
  return (
    <form
      onSubmit={() => {
        ref.current = true;
        form.reset();
        onSubmit(fields);
      }}
    />
  );
}

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime"; // @enableStateVariables
import { useRef } from "react";

// Not state: a ref (modified after render by design), a `const` (calling a
// method of what a hook returned is not an update of the component's state),
// and a `let` that is only modified during render.
function Form(t0) {
  const $ = _c(4);
  const { onSubmit } = t0;
  const ref = useRef(null);
  const form = useForm();
  let fields;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    fields = [];
    fields.push("name");
    $[0] = fields;
  } else {
    fields = $[0];
  }
  let t1;
  if ($[1] !== form || $[2] !== onSubmit) {
    t1 = (
      <form
        onSubmit={() => {
          ref.current = true;
          form.reset();
          onSubmit(fields);
        }}
      />
    );
    $[1] = form;
    $[2] = onSubmit;
    $[3] = t1;
  } else {
    t1 = $[3];
  }
  return t1;
}

```
