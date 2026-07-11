import data from "../apps/mobile/lib/aircraftShapes.json" with { type: "json" };

/** Rough SVG path bbox from numeric tokens (good enough for centering audit). */
function pathBbox(d) {
  const nums = d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = nums[i];
    const y = nums[i + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}

for (const k of ["unknown", "b738", "a320", "airliner", "heavy_2e", "cessna", "a380"]) {
  const s = data.shapes[k];
  if (!s) continue;
  const [vx, vy, vw, vh] = s.viewBox.split(/\s+/).map(Number);
  const vcx = vx + vw / 2;
  const vcy = vy + vh / 2;
  const paths = Array.isArray(s.path) ? s.path : [s.path];
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of paths) {
    const b = pathBbox(p);
    minX = Math.min(minX, b.minX);
    maxX = Math.max(maxX, b.maxX);
    minY = Math.min(minY, b.minY);
    maxY = Math.max(maxY, b.maxY);
  }
  const pcx = (minX + maxX) / 2;
  const pcy = (minY + maxY) / 2;
  const aspect = s.w / s.h;
  console.log(k, {
    w: s.w,
    h: s.h,
    aspect: aspect.toFixed(3),
    viewCenter: [vcx.toFixed(1), vcy.toFixed(1)],
    pathCenter: [pcx.toFixed(1), pcy.toFixed(1)],
    delta: [(pcx - vcx).toFixed(1), (pcy - vcy).toFixed(1)],
    viewBox: s.viewBox,
  });
}