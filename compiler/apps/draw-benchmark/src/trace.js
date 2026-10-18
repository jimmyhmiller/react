// Inferred workload, NOT the original SVG or command recording.
// 900 small boxes sample three ellipses, 99 fill the core, one text label.
export function makeShapes() {
  const shapes = [];
  const round = n => Math.round(n * 1000) / 1000;
  for (let orbit = 0; orbit < 3; orbit++) {
    const angle = orbit * Math.PI / 3;
    for (let i = 0; i < 300; i++) {
      const t = i * Math.PI * 2 / 300;
      const x = 210 * Math.cos(t), y = 75 * Math.sin(t);
      shapes.push({ type: 'box', width: 7, height: 7, x: round(320 + x * Math.cos(angle) - y * Math.sin(angle) - 3.5), y: round(240 + x * Math.sin(angle) + y * Math.cos(angle) - 3.5) });
    }
  }
  for (let i = 0; i < 99; i++) {
    const radius = 25 * Math.sqrt(i / 98), angle = i * Math.PI * (3 - Math.sqrt(5));
    shapes.push({ type: 'box', width: 8, height: 8, x: round(316 + radius * Math.cos(angle)), y: round(236 + radius * Math.sin(angle)) });
  }
  shapes.push({ type: 'text', width: 160, height: 48, x: 240, y: 457 });
  return shapes;
}
export const shapes = makeShapes();
export const trace = shapes.flatMap(shape => [
  { type: 'add', kind: shape.type },
  ...['width', 'height', 'x', 'y'].map(field => ({ type: 'edit', field, value: shape[field] })),
]);
export const TRACE_ID = 'inferred-box-logo-v1';
