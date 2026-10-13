// @enableStateVariables
// A function named like a hook whose nested function reassigns its variable is
// a hook, although it calls no hook: it calls `useState` once compiled.
function useToggle(initial) {
  let on = initial;
  return [on, () => { on = !on; }];
}

function Toggle() {
  const [on, toggle] = useToggle(false);
  return <button onClick={toggle}>{on ? 'on' : 'off'}</button>;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Toggle,
  params: [{}],
};
