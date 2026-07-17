export const DEFAULT_BOKEH_SHAPE = 'circle';
export const BOKEH_RING_INNER_RADIUS = 0.62;

export const BOKEH_SHAPES = Object.freeze([
  Object.freeze({ id: 'pentagon', label: '오각', sides: 5, index: 1 }),
  Object.freeze({ id: 'hexagon', label: '육각', sides: 6, index: 2 }),
  Object.freeze({ id: 'octagon', label: '팔각', sides: 8, index: 3 }),
  Object.freeze({ id: 'circle', label: '원', sides: 0, index: 0 }),
  Object.freeze({ id: 'ring', label: '링', sides: 0, index: 4 }),
  Object.freeze({ id: 'heart', label: '하트', sides: 0, index: 5 }),
  Object.freeze({ id: 'star', label: '별', sides: 0, index: 6 }),
]);

export const BOKEH_SHAPE_IDS = Object.freeze(BOKEH_SHAPES.map(({ id }) => id));
export const BOKEH_SHAPE_INDEX = Object.freeze(Object.fromEntries(BOKEH_SHAPES.map(({ id, index }) => [id, index])));

export function sanitizeBokehShape(value) {
  return BOKEH_SHAPE_IDS.includes(value) ? value : DEFAULT_BOKEH_SHAPE;
}

export function bokehShapeIndex(value) {
  return BOKEH_SHAPE_INDEX[sanitizeBokehShape(value)];
}

export function getBokehShapeLabel(value) {
  const shape = BOKEH_SHAPES.find(({ id }) => id === sanitizeBokehShape(value));
  return shape?.label ?? '원';
}

export function nextBokehShape(value, direction = 1) {
  const current = BOKEH_SHAPE_IDS.indexOf(sanitizeBokehShape(value));
  const offset = direction < 0 ? -1 : 1;
  return BOKEH_SHAPE_IDS[(current + offset + BOKEH_SHAPE_IDS.length) % BOKEH_SHAPE_IDS.length];
}

function regularPolygonRadius(angle, sides) {
  const halfStep = Math.PI / sides;
  const step = halfStep * 2;
  const relative = angle - Math.PI / 2;
  const sector = ((relative + halfStep) % step + step) % step - halfStep;
  return Math.cos(halfStep) / Math.cos(halfStep - Math.abs(sector));
}

export function sampleBokehAperture(shapeValue, sampleIndex, sampleCount) {
  const shape = sanitizeBokehShape(shapeValue);
  const count = Math.max(2, Math.round(Number(sampleCount) || 2));
  const index = Math.max(1, Math.min(count - 1, Math.round(Number(sampleIndex) || 1)));
  const angle = index * 2.399963229728653;
  const discRadius = Math.sqrt(index / Math.max(1, count - 1));
  let x = Math.cos(angle) * discRadius;
  let y = Math.sin(angle) * discRadius;

  const polygon = BOKEH_SHAPES.find(({ id }) => id === shape)?.sides ?? 0;
  if (polygon > 0) {
    const boundary = regularPolygonRadius(angle, polygon);
    x *= boundary;
    y *= boundary;
  } else if (shape === 'ring') {
    const progress = Math.max(0, Math.min(1, (index - 1) / Math.max(1, count - 2)));
    const radius = Math.sqrt(BOKEH_RING_INNER_RADIUS ** 2 + progress * (1 - BOKEH_RING_INNER_RADIUS ** 2));
    x = Math.cos(angle) * radius;
    y = Math.sin(angle) * radius;
  } else if (shape === 'heart') {
    const sinAngle = Math.sin(angle);
    x = (16 * sinAngle * sinAngle * sinAngle / 18) * discRadius;
    y = ((13 * Math.cos(angle) - 5 * Math.cos(angle * 2) - 2 * Math.cos(angle * 3) - Math.cos(angle * 4) + 2) / 18) * discRadius;
  } else if (shape === 'star') {
    const boundary = 0.65 + 0.35 * Math.cos(5 * (angle - Math.PI / 2));
    x *= boundary;
    y *= boundary;
  }

  return Object.freeze({ x, y });
}
