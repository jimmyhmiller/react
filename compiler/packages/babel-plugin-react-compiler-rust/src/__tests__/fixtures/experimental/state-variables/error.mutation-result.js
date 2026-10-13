// @enableStateVariables
function Stack() {
  let stack = [1, 2, 3];
  return (
    <button
      onClick={() => {
        const last = stack.pop();
        console.log(last);
      }}>
      {stack.length}
    </button>
  );
}
