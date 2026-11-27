// One projection for the illustration, interactive markers and camera.
// The wider east-west scale leaves room for actual city blocks and park layouts.
export const MAP = {
  width: 5200, height: 6900, tileHeight: 690,
  projection: { originLon: -87.7, originLat: 41.996, scaleX: 28000, scaleY: 28000, offsetX: 400, offsetY: 120 }
};
export function project([lon, lat]) {
  const p = MAP.projection;
  return [(lon - p.originLon) * p.scaleX + p.offsetX, (p.originLat - lat) * p.scaleY + p.offsetY];
}
