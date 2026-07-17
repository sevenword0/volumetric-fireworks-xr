import { Fn, If, atan, float, int, shapeCircle, smoothstep } from 'three/tsl';
import { BOKEH_RING_INNER_RADIUS, BOKEH_SHAPE_INDEX } from './bokeh-shapes.js';

const APERTURE_EDGE = 0.045;

function insideRadialBoundary(radius, boundary) {
  return float(1).sub(smoothstep(boundary.sub(APERTURE_EDGE), boundary.add(APERTURE_EDGE), radius));
}

export const bokehApertureMask = Fn(([apertureUVNode, bokehShapeNode]) => {
  const point = apertureUVNode.sub(0.5).mul(2);
  const radius = point.length();
  const angle = atan(point.y, point.x);
  const mask = shapeCircle(apertureUVNode).toVar();

  const assignRegularPolygon = (sides) => {
    const halfStep = float(Math.PI / sides);
    const step = halfStep.mul(2);
    const sector = angle.sub(Math.PI / 2).add(Math.PI * 8).add(halfStep).mod(step).sub(halfStep);
    const boundary = halfStep.cos().div(halfStep.sub(sector.abs()).cos());
    mask.assign(insideRadialBoundary(radius, boundary));
  };

  If(bokehShapeNode.equal(int(BOKEH_SHAPE_INDEX.pentagon)), () => assignRegularPolygon(5));
  If(bokehShapeNode.equal(int(BOKEH_SHAPE_INDEX.hexagon)), () => assignRegularPolygon(6));
  If(bokehShapeNode.equal(int(BOKEH_SHAPE_INDEX.octagon)), () => assignRegularPolygon(8));

  If(bokehShapeNode.equal(int(BOKEH_SHAPE_INDEX.ring)), () => {
    const outer = insideRadialBoundary(radius, float(1));
    const inner = smoothstep(BOKEH_RING_INNER_RADIUS - APERTURE_EDGE, BOKEH_RING_INNER_RADIUS + APERTURE_EDGE, radius);
    mask.assign(outer.mul(inner));
  });

  If(bokehShapeNode.equal(int(BOKEH_SHAPE_INDEX.heart)), () => {
    const x2 = point.x.mul(point.x);
    const y2 = point.y.mul(point.y);
    const base = x2.add(y2).sub(0.8);
    const heartField = base.mul(base).mul(base).sub(x2.mul(point.y).mul(y2));
    mask.assign(float(1).sub(smoothstep(-0.025, 0.025, heartField)));
  });

  If(bokehShapeNode.equal(int(BOKEH_SHAPE_INDEX.star)), () => {
    const boundary = angle.sub(Math.PI / 2).mul(5).cos().mul(0.35).add(0.65);
    mask.assign(insideRadialBoundary(radius, boundary));
  });

  return mask;
});
