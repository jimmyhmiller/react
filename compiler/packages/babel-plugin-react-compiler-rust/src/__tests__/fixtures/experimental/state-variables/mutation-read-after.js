// @enableStateVariables
// A read that follows a mutation reads the updated value: the handler applies
// the same updater to its own copy of the state.
function Stack() {
  let stack = [1, 2, 3];
  return (
    <button
      onClick={() => {
        stack.push(stack.length + 1);
        console.log(stack.length);
      }}>
      {stack.join(',')}
    </button>
  );
}
