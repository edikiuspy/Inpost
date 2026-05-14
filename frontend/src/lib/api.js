const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const MAP_FETCH_LIMIT = 500;

export const WORKFLOW_FUNCTIONS = {
  collect: ["parcel_collect"],
  send: ["parcel_send"],
  return: ["parcel_reverse_return_send"],
};

export async function searchPoints(filters, bounds = null) {
  const params = new URLSearchParams();

  append(params, "city", filters.city);
  append(params, "province", filters.province);
  append(params, "post_code", filters.postCode);
  append(params, "lat", filters.lat);
  append(params, "lon", filters.lon);
  append(params, "max_distance", filters.maxDistance);
  append(params, "limit", filters.limit ?? MAP_FETCH_LIMIT);
  append(params, "type", filters.pointType);
  append(params, "only_247", filters.only247);
  append(params, "payment_required", filters.paymentRequired);
  append(params, "open_now", filters.openNow);
  append(params, "north", bounds?.north);
  append(params, "south", bounds?.south);
  append(params, "east", bounds?.east);
  append(params, "west", bounds?.west);

  const functions = WORKFLOW_FUNCTIONS[filters.workflow] ?? [];
  functions.forEach((name) => params.append("functions", name));

  const response = await fetch(`${API_BASE_URL}/api/points/search?${params.toString()}`);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail ?? "Point search failed");
  }
  return response.json();
}

function append(params, key, value) {
  if (value === undefined || value === null || value === "") {
    return;
  }
  params.append(key, String(value));
}

export async function geocode(query, signal) {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return [];
  }
  const response = await fetch(`${API_BASE_URL}/api/geocode?q=${encodeURIComponent(trimmed)}`, { signal });
  if (!response.ok) {
    throw new Error("Geocode failed");
  }
  return response.json();
}
