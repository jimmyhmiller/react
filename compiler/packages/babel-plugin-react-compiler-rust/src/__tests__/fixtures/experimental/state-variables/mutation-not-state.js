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
