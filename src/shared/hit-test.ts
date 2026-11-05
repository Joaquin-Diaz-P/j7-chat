export interface HitRect { left: number; top: number; right: number; bottom: number }
export function capturesPoint(x: number, y: number, regions: HitRect[]): boolean {
  return regions.some(r => x >= r.left && x < r.right && y >= r.top && y < r.bottom);
}

export function capturesScreenPoint(point: {x:number;y:number}, origin: {x:number;y:number}, regions: HitRect[]) {
  return capturesPoint(point.x-origin.x, point.y-origin.y, regions);
}
