/**
 * A function expression that only appears as a child of a JSX *fragment* is
 * not assumed to be invoked during render (unlike one passed to a JSX element
 * as a prop or child), so the property loads in its body must not be treated
 * as hoistable non-null paths. The dependency here should be `a`, not `a.b.c`.
 */
function Component({a}) {
  const cb = () => a.b.c;
  return <>{cb}</>;
}
