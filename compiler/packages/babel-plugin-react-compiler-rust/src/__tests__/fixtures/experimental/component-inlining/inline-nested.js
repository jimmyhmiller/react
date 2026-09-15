// @enableComponentInlining
function Icon({name}) {
  return <i className={'icon-' + name} />;
}

function Button({label, icon}) {
  return (
    <button>
      <Icon name={icon} />
      {label}
    </button>
  );
}

function Toolbar(props) {
  return (
    <div>
      <Button label="Save" icon="save" />
      <Button label={props.label} icon="edit" />
    </div>
  );
}

export const FIXTURE_ENTRYPOINT = {
  fn: Toolbar,
  params: [{label: 'Edit'}],
  sequentialRenders: [{label: 'Edit'}, {label: 'Change'}],
};
