import { svgPathBbox } from "svg-path-bbox";
import data from "../apps/mobile/lib/aircraftShapes.json" with { type: "json" };

function parseViewBox(viewBox) {
  const [x, y, w, h] = viewBox.split(/\s+/).map(Number);
  return { x, y, w, h };
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
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

/** Anchor in rendered px space (tar1090 w×h letterboxing, xMidYMid meet). */
function markerAnchor(shape, width, height) {
  const vb = parseViewBox(shape.viewBox);
  const bb = pathBbox(shape.path);
  const scale = Math.min(width / vb.w, height / vb.h);
  const contentW = vb.w * scale;
  const contentH = vb.h * scale;
  const offsetX = (width - contentW) / 2;
  const offsetY = (height - contentH) / 2;
  const pixelX = offsetX + (bb.cx - vb.x) * scale;
  const pixelY = offsetY + (bb.cy - vb.y) * scale;
  return {
    anchor: [+(pixelX / width).toFixed(4), +(pixelY / height).toFixed(4)],
    width,
    height,
    scale: +scale.toFixed(4),
    offset: [+offsetX.toFixed(2), +offsetY.toFixed(2)],
  };
}

const baseSize = 30;
for (const code of ["B738", "A320", "B77W", "C172", ""]) {
  const mapped = code ? data.types[code] : undefined;
  const shapeKey = mapped?.[0] ?? "unknown";
  const scale = mapped?.[1] ?? 1;
  const shape = data.shapes[shapeKey];
  const maxEdge = Math.max(shape.w, shape.h);
  const height = Math.round((baseSize * scale * shape.h) / maxEdge);
  const width = Math.round((baseSize * scale * shape.w) / maxEdge);
  const a = markerAnchor(shape, width, height);
  console.log(code || "unknown", shapeKey, a);
}