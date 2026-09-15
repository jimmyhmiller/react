/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// A documentation page: mostly static content (a long article, a sidebar of
// pages and a table of contents) with a few interactive parts (search, a theme
// toggle, copy buttons on code blocks and a feedback widget). Rendered on the
// server and hydrated, it measures the cost of hydrating static content.

import {useState} from 'react';
import {createDocsContent} from './content.js';

const content = createDocsContent();

function InlineParts({parts}) {
  return parts.map((part, i) => {
    switch (part.type) {
      case 'code':
        return <code key={i}>{part.text}</code>;
      case 'link':
        return (
          <a key={i} href={part.href}>
            <code>{part.text}</code>
          </a>
        );
      case 'strong':
        return <strong key={i}>{part.text}</strong>;
      default:
        return <span key={i}>{part.text}</span>;
    }
  });
}

function CopyButton({lines}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className={copied ? 'copy copied' : 'copy'}
      onClick={() => setCopied(true)}>
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function CodeBlock({lines}) {
  return (
    <div className="code-block">
      <CopyButton lines={lines} />
      <pre>
        <code>
          {lines.map((tokens, i) => (
            <span key={i} className="line">
              {tokens.map((token, j) => (
                <span key={j} className={'token ' + token.kind}>
                  {token.text}
                </span>
              ))}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}

function Table({rows}) {
  return (
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Type</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.id}>
            <td>
              <code>{row.name}</code>
            </td>
            <td>{row.type}</td>
            <td>{row.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Block({block}) {
  switch (block.type) {
    case 'paragraph':
      return (
        <p>
          <InlineParts parts={block.parts} />
        </p>
      );
    case 'code':
      return <CodeBlock lines={block.lines} />;
    case 'list':
      return (
        <ul>
          {block.items.map(item => (
            <li key={item.id}>
              <InlineParts parts={item.parts} />
            </li>
          ))}
        </ul>
      );
    case 'table':
      return <Table rows={block.rows} />;
    default:
      return (
        <aside className={'callout ' + block.tone}>
          <h4>{block.title}</h4>
          <p>
            <InlineParts parts={block.parts} />
          </p>
        </aside>
      );
  }
}

function Section({section}) {
  return (
    <section id={section.id}>
      <h2>
        <a href={'#' + section.id}>{section.title}</a>
      </h2>
      {section.blocks.map(block => (
        <Block key={block.id} block={block} />
      ))}
    </section>
  );
}

function Feedback() {
  const [answer, setAnswer] = useState(null);
  if (answer !== null) {
    return <p className="feedback">Thanks for your feedback!</p>;
  }
  return (
    <div className="feedback">
      <span>Was this page helpful?</span>
      <button className="yes" onClick={() => setAnswer('yes')}>
        Yes
      </button>
      <button className="no" onClick={() => setAnswer('no')}>
        No
      </button>
    </div>
  );
}

function Sidebar({query}) {
  const normalized = query.toLowerCase();
  return (
    <nav className="sidebar">
      {content.groups.map(group => {
        const pages = group.pages.filter(page =>
          page.title.toLowerCase().includes(normalized),
        );
        if (pages.length === 0) {
          return null;
        }
        return (
          <div key={group.id} className="group">
            <h3>{group.title}</h3>
            <ul>
              {pages.map(page => (
                <li key={page.id}>
                  <a
                    href={page.href}
                    className={
                      page.id === content.currentPageId ? 'active' : undefined
                    }>
                    {page.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function TableOfContents() {
  return (
    <nav className="toc">
      <h3>On this page</h3>
      <ul>
        {content.sections.map(section => (
          <li key={section.id}>
            <a href={'#' + section.id}>{section.title}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default function DocsApp() {
  const [query, setQuery] = useState('');
  const [theme, setTheme] = useState('light');
  return (
    <div className={'docs-app theme-' + theme}>
      <header className="docs-header">
        <a className="logo" href="/">
          React
        </a>
        <input
          className="search"
          placeholder="Search pages"
          value={query}
          onChange={event => setQuery(event.target.value)}
        />
        <button
          className="theme-toggle"
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
          {theme === 'light' ? 'Dark' : 'Light'} theme
        </button>
      </header>
      <div className="docs-body">
        <Sidebar query={query} />
        <article>
          <h1>{content.title}</h1>
          {content.sections.map(section => (
            <Section key={section.id} section={section} />
          ))}
          <Feedback />
        </article>
        <TableOfContents />
      </div>
      <footer className="docs-footer">
        <p>
          Copyright Meta Platforms, Inc. <a href="/community">Community</a>
        </p>
      </footer>
    </div>
  );
}
