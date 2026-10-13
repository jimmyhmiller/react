// @enableStateVariables
// Writes in loops, branches, a switch and a try block. A `try` block ends at
// every call, so the read and the write of `count++` are in different blocks
// there and the write sets the value.
function Counter({items, mode}) {
  let count = 0;
  let list = [];
  return (
    <>
      <button
        onClick={() => {
          for (const item of items) {
            list.push(item);
            count += item;
          }
        }}>
        all
      </button>
      <button
        onClick={() => {
          if (mode) {
            count++;
          } else {
            count = 0;
          }
          console.log(count);
        }}>
        branch
      </button>
      <button
        onClick={() => {
          switch (mode) {
            case 1:
              count++;
              break;
            default:
              list.pop();
          }
        }}>
        switch
      </button>
      <button
        onClick={() => {
          try {
            count++;
            risky();
          } catch (e) {
            count = -1;
          }
        }}>
        try
      </button>
      {count} {list.length}
    </>
  );
}
