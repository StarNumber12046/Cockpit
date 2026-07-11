import { svgPathBbox } from "svg-path-bbox";
import data from "../apps/mobile/lib/aircraftShapes.json" with { type: "json" };

function parseViewBox(viewBox) {
  const [x, y, w, h] = viewBox.split(/\s+/).map(Number);
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
}

function pathBbox(paths) {
  const list = Array.isArray(paths) ? paths : [paths];
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const d of list) {
    const [x0, y0, x1, y1] = svgPathBbox(d);
    minX = Math.min(minX, x0);
    minY = Math.min(minY, y0);
    maxX = Math.max(maxX, x1);
    maxY = Math.max(maxY, y1);
  }
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    minX,
    minY,
    maxX,
    maxY,
  };
}

for (const k of Object.keys(data.shapes)) {
  const s = data.shapes[k];
  const vb = parseViewBox(s.viewBox);
  const bb = pathBbox(s.path);
  const shiftX = +(vb.cx - bb.cx).toFixed(2);
  const shiftY = +(vb.cy - bb.cy).toFixed(2);
  console.log(k, {
    shift: [shiftX, shiftY],
    viewCenter: [vb.cx, vb.cy],
    pathCenter: [+bb.cx.toFixed(1), +bb.cy.toFixed(1)],
    deltaPxAt30: [
      +((shiftX / vb.w) * 30).toFixed(2),
      +((shiftY / vb.h) * 30).toFixed(2),
    ],
  });
}