// @enableStaticIslands
// A list of static items is part of its parent's island (the items are not
// wrapped again). The items of a list whose parent has a handler are wrapped
// with their key. Items with a hydration-sensitive tag (img) are not, and
// neither are their text-only children.
function Toc({sections, onSelect}) {
  return (
    <div>
      <ol>
        {sections.map(section => (
          <li key={section.id}>
            <a href={'#' + section.id}>{section.title}</a>
            <span className="depth">{section.depth}</span>
          </li>
        ))}
      </ol>
      <ul onClick={onSelect}>
        {sections.map(section => (
          <li key={section.id}>
            <a href={'#' + section.id}>{section.title}</a>
            <span className="depth">{section.depth}</span>
          </li>
        ))}
      </ul>
      <ul onClick={onSelect}>
        {sections.map(section => (
          <li key={section.id}>
            <img src={section.icon} />
            <span>{section.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
