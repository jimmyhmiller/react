// @enableStateVariables
// The functions nested in a handler share its copy of the state, whether they
// are called by the handler (`forEach`) or later (`setTimeout`).
function Cart({items}) {
  let total = 0;
  let log = [];
  return (
    <button
      onClick={() => {
        items.forEach(item => {
          total += item.price;
        });
        console.log(total);
        setTimeout(() => {
          total = 0;
          log = [...log, total];
        }, 1000);
      }}>
      {total} {log.length}
    </button>
  );
}
