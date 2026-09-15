/** 좌표 유틸 — 순수 함수 */
const R = 6371008.8; // 지구 평균 반지름(m)
const rad = (d: number) => (d * Math.PI) / 180;

export interface LatLng {
  lat: number;
  lng: number;
}

/** 두 좌표 사이 거리(m) — haversine */
export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 기준점에서 방위각(도, 북=0 시계방향)으로 distanceM 만큼 떨어진 좌표 */
export function offsetLatLng(center: LatLng, distanceM: number, bearingDeg: number): LatLng {
  const δ = distanceM / R;
  const θ = rad(bearingDeg);
  const φ1 = rad(center.lat);
  const λ1 = rad(center.lng);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: (φ2 * 180) / Math.PI, lng: (λ2 * 180) / Math.PI };
}
