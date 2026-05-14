export function formatAddress(point) {
  return [point.address?.line1, point.address?.line2].filter(Boolean).join(", ");
}

export function formatDistance(distance) {
  if (distance === null || distance === undefined) {
    return null;
  }
  if (distance < 1000) {
    return `${Math.round(distance)} m`;
  }
  return `${(distance / 1000).toFixed(1)} km`;
}

export function markerClass(color) {
  return {
    green: "#2f8f5b",
    yellow: "#d99a1f",
    orange: "#d45c3f",
    red: "#b93636",
    gray: "#6b7280",
  }[color] ?? "#6b7280";
}
