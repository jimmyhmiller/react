// @enableStaticIslands
// An element of a static component weighs what the component renders: <Links />
// renders a list and is wrapped, <Label /> renders one element and is not.
function Links({links}) {
  return (
    <nav>
      <h3>Links</h3>
      <ul>
        {links.map(link => (
          <li key={link.href}>
            <a href={link.href}>{link.title}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Label({text}) {
  return <span className="label">{text}</span>;
}

function Page({links, title, onClose}) {
  return (
    <div>
      <button onClick={onClose}>close</button>
      <Label text={title} />
      <Links links={links} />
    </div>
  );
}
