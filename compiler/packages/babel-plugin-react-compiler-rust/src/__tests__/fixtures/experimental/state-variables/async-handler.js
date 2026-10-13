// @enableStateVariables
// An async function continues after the render that called it.
function Loader({load}) {
  let data = null;
  let loading = false;
  async function onLoad() {
    loading = true;
    data = await load();
    loading = false;
  }
  return <button onClick={onLoad}>{loading ? '...' : data}</button>;
}
