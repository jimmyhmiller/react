// @enableComponentInlining
function Pill({active, label}) {
  return <span className={active ? 'on' : 'off'}>{label}</span>;
}

function Filters({show, active}) {
  return <div>{show === true && <Pill active={active} label="all" />}</div>;
}

export const FIXTURE_ENTRYPOINT = {
  fn: Filters,
  params: [{show: false, active: false}],
  sequentialRenders: [
    {show: false, active: false},
    {show: true, active: false},
    {show: true, active: true},
  ],
};
