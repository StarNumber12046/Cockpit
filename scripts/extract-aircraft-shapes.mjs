import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { svgPathBbox } from "svg-path-bbox";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(
  __dirname,
  "../apps/mobile/lib/aircraftShapes.json",
);

const URL =
  "https://raw.githubusercontent.com/wiedehopf/tar1090/master/html/markers.js";

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchText(res.headers.location).then(resolve, reject);
          return;
        }
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve(d));
      })
      .on("error", reject);
  });
}

const NEED = [
  "a319",
  "a320",
  "a321",
  "b737",
  "b738",
  "b739",
  "airliner",
  "a332",
  "a359",
  "a380",
  "md11",
  "unknown",
  "helicopter",
  "jet_swept",
  "cessna",
  "heavy_2e",
  "heavy_4e",
  "c130",
];

const src = await fetchText(URL);

const shapesStart = src.indexOf("let shapes = {");
const typesStart = src.indexOf("let TypeDesignatorIcons = {");
const typesEnd = src.indexOf("let TypeDescriptionIcons");

if (shapesStart < 0 || typesStart < 0) {
  throw new Error("Could not locate shapes / TypeDesignatorIcons");
}

/** Brace-match an object literal starting at the first `{` after `from`. */
function sliceObject(source, from) {
  const open = source.indexOf("{", from);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  throw new Error("Unclosed object from " + from);
}

const shapesLiteral = sliceObject(src, shapesStart);
const typesLiteral = sliceObject(src, typesStart);

// Evaluate markers.js fragments in a sandbox-ish way.
const g = {};
// Type map references _ulac in a few places — stub it.
const typesCode = typesLiteral.replaceAll("_ulac", '["unknown", 1]');

// eslint-disable-next-line no-new-func
new Function(
  "g",
  "g.shapes = " + shapesLiteral + ";\ng.types = " + typesCode + ";",
)(g);

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
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

const shapes = {};
for (const k of NEED) {
  const s = g.shapes[k];
  if (!s) {
    console.warn("missing shape", k);
    continue;
  }
  const vb = parseViewBox(s.viewBox);
  const bb = pathBbox(s.path);
  const shiftX = +(vb.cx - bb.cx).toFixed(2);
  const shiftY = +(vb.cy - bb.cy).toFixed(2);
  shapes[k] = {
    w: s.w,
    h: s.h,
    viewBox: s.viewBox,
    strokeScale: s.strokeScale ?? 1,
    path: s.path,
    transform: s.transform ?? null,
    centerShift:
      shiftX === 0 && shiftY === 0 ? null : [shiftX, shiftY],
  };
}

const types = {};
for (const [code, val] of Object.entries(g.types)) {
  if (!Array.isArray(val)) continue;
  const [shape, scale] = val;
  if (shapes[shape]) types[code] = [shape, scale];
}

// Map 777 family etc. to heavy_2e if present in NEED
const extras = {
  B752: ["heavy_2e", 0.9],
  B753: ["heavy_2e", 0.9],
  B772: ["heavy_2e", 1.0],
  B773: ["heavy_2e", 1.02],
  B77L: ["heavy_2e", 1.02],
  B77W: ["heavy_2e", 1.04],
  B741: ["heavy_4e", 0.96],
  B742: ["heavy_4e", 0.96],
  B743: ["heavy_4e", 0.96],
  B744: ["heavy_4e", 0.96],
  B748: ["heavy_4e", 0.98],
  A306: ["heavy_2e", 0.93],
  C172: ["cessna", 1],
  C152: ["cessna", 1],
  C182: ["cessna", 1],
};
for (const [code, val] of Object.entries(extras)) {
  if (shapes[val[0]] && !types[code]) types[code] = val;
}

const payload = { shapes, types };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(payload));
console.log(
  "wrote",
  OUT,
  "shapes=",
  Object.keys(shapes).length,
  "types=",
  Object.keys(types).length,
  "bytes=",
  JSON.stringify(payload).length,
);
