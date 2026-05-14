import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { markerClass } from "../lib/format";
import { formatAddress, formatDistance } from "../lib/format";

const DEFAULT_CENTER = [52.2297, 21.0122];

export default function PointsMap({ points, selectedName, userSelectedName, focusLocation, distanceSource, onSelect, onViewportChange, onZoomChange }) {
  const userSelectedPoint = useMemo(
    () => (userSelectedName ? points.find((point) => point.name === userSelectedName) ?? null : null),
    [points, userSelectedName],
  );

  return (
    <MapContainer center={DEFAULT_CENTER} zoom={12} scrollWheelZoom className="h-full min-h-[360px]" preferCanvas>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ViewportWatcher onViewportChange={onViewportChange} onZoomChange={onZoomChange} />
      <FlyToLocation focusLocation={focusLocation} />
      <FlyToSelection selected={userSelectedPoint} />
      <DistanceSourceCursor distanceSource={distanceSource} />
      <ClusteredMarkers points={points} selectedName={selectedName} userSelectedName={userSelectedName} onSelect={onSelect} />
    </MapContainer>
  );
}

function ViewportWatcher({ onViewportChange, onZoomChange }) {
  const throttleRef = useRef({ timer: null, last: 0, animating: false });

  const emitLive = (map) => {
    if (throttleRef.current.animating) {
      return;
    }
    const now = Date.now();
    const state = throttleRef.current;
    const elapsed = now - state.last;
    const minInterval = 80;
    if (elapsed >= minInterval) {
      state.last = now;
      onViewportChange(readBounds(map), "live");
      return;
    }
    if (state.timer) {
      return;
    }
    state.timer = setTimeout(() => {
      state.timer = null;
      state.last = Date.now();
      if (!throttleRef.current.animating) {
        onViewportChange(readBounds(map), "live");
      }
    }, minInterval - elapsed);
  };

  const map = useMapEvents({
    movestart: () => {
      if (map._animatingZoom || map._flyToFrame) {
        throttleRef.current.animating = true;
      }
    },
    zoomstart: () => {
      throttleRef.current.animating = true;
    },
    move: () => emitLive(map),
    moveend: () => {
      throttleRef.current.animating = false;
      if (throttleRef.current.timer) {
        clearTimeout(throttleRef.current.timer);
        throttleRef.current.timer = null;
      }
      throttleRef.current.last = Date.now();
      onViewportChange(readBounds(map), "settled");
    },
    zoomend: () => {
      throttleRef.current.animating = false;
      onViewportChange(readBounds(map), "settled");
      onZoomChange?.(map.getZoom());
    },
  });

  useEffect(() => {
    onViewportChange(readBounds(map), "settled");
    onZoomChange?.(map.getZoom());
    return () => {
      if (throttleRef.current.timer) {
        clearTimeout(throttleRef.current.timer);
        throttleRef.current.timer = null;
      }
    };
  }, [map, onViewportChange, onZoomChange]);

  return null;
}

function FlyToLocation({ focusLocation }) {
  const map = useMap();
  useEffect(() => {
    if (focusLocation) {
      map.flyTo(focusLocation, 14);
    }
  }, [focusLocation, map]);
  return null;
}

function FlyToSelection({ selected }) {
  const map = useMap();
  const lastNameRef = useRef(null);
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      lastNameRef.current = selected?.name ?? null;
      return;
    }
    if (!selected) {
      lastNameRef.current = null;
      return;
    }
    if (lastNameRef.current === selected.name) {
      return;
    }
    lastNameRef.current = selected.name;
    const target = [selected.location.latitude, selected.location.longitude];
    const targetZoom = Math.max(map.getZoom(), 16);
    map.flyTo(target, targetZoom, { duration: 0.9, easeLinearity: 0.25 });
  }, [selected, map]);
  return null;
}

function DistanceSourceCursor({ distanceSource }) {
  if (!distanceSource) {
    return null;
  }

  return (
    <Marker position={distanceSource} icon={distanceCursorIcon()}>
      <Popup>
        <div className="min-w-44">
          <p className="font-semibold text-ink">Distance source</p>
          <p>Scores and distances are counted from this location.</p>
        </div>
      </Popup>
    </Marker>
  );
}

function ClusteredMarkers({ points, selectedName, userSelectedName, onSelect }) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  const [bounds, setBounds] = useState(() => readVisibleBounds(map));
  const markerRefs = useRef(new Map());
  const pendingOpenRef = useRef(null);

  useMapEvents({
    moveend: () => setBounds(readVisibleBounds(map)),
    zoomend: () => {
      setZoom(map.getZoom());
      setBounds(readVisibleBounds(map));
    },
  });

  const clusters = useMemo(() => clusterPoints(points, zoom), [points, zoom]);
  const visibleClusters = useMemo(
    () => clusters.filter((cluster) => clusterInBounds(cluster, bounds)),
    [clusters, bounds],
  );

  useEffect(() => {
    if (!userSelectedName) {
      pendingOpenRef.current = null;
      return undefined;
    }
    pendingOpenRef.current = userSelectedName;
    const tryOpen = () => {
      if (pendingOpenRef.current !== userSelectedName) return;
      const marker = markerRefs.current.get(userSelectedName);
      if (marker) {
        marker.openPopup();
        pendingOpenRef.current = null;
      }
    };
    if (map._flyToFrame || map._animatingZoom) {
      const handler = () => requestAnimationFrame(tryOpen);
      map.once("moveend", handler);
      return () => map.off("moveend", handler);
    }
    requestAnimationFrame(tryOpen);
    return undefined;
  }, [userSelectedName, map]);

  return visibleClusters.map((cluster) => {
    if (cluster.points.length === 1) {
      const point = cluster.points[0];
      const color = markerClass(point.marker_color);
      const isSelected = selectedName === point.name;
      return (
        <CircleMarker
          key={point.name}
          center={[point.location.latitude, point.location.longitude]}
          ref={(instance) => {
            if (instance) {
              markerRefs.current.set(point.name, instance);
              if (
                pendingOpenRef.current === point.name &&
                !map._flyToFrame &&
                !map._animatingZoom
              ) {
                requestAnimationFrame(() => {
                  if (markerRefs.current.get(point.name) === instance && pendingOpenRef.current === point.name) {
                    instance.openPopup();
                    pendingOpenRef.current = null;
                  }
                });
              }
            } else {
              markerRefs.current.delete(point.name);
            }
          }}
          pathOptions={{
            color,
            fillColor: color,
            fillOpacity: isSelected ? 0.95 : 0.72,
            weight: isSelected ? 4 : 2,
          }}
          radius={isSelected ? 11 : 8}
          eventHandlers={{ click: () => onSelect(point.name) }}
        >
          <Popup>
            <PointPopup point={point} />
          </Popup>
        </CircleMarker>
      );
    }

    return (
      <Marker
        key={cluster.id}
        position={cluster.center}
        icon={clusterIcon(cluster.points.length)}
        eventHandlers={{
          click: () => {
            const bounds = cluster.points.map((point) => [point.location.latitude, point.location.longitude]);
            map.fitBounds(bounds, { padding: [42, 42], maxZoom: map.getZoom() + 2 });
          },
        }}
      >
        <Popup>
          <div className="min-w-44">
            <p className="font-semibold text-ink">{cluster.points.length} parcel lockers</p>
            <p>Zoom in to inspect individual points.</p>
          </div>
        </Popup>
      </Marker>
    );
  });
}

function PointPopup({ point }) {
  const directionsUrl = buildDirectionsUrl(point);
  const placement = formatPlacement(point);
  const lockerSizes = formatLockerSizes(point.locker_availability);
  const unavailable = formatUnavailability(point.unavailability_periods);
  return (
    <div className="min-w-56 max-w-72 space-y-1 text-sm">
      {point.image_url ? (
        <img
          src={point.image_url}
          alt={point.name}
          loading="lazy"
          className="mb-2 h-32 w-full rounded object-cover"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
      <p className="font-semibold text-ink">{point.name}</p>
      <p>{formatAddress(point)}</p>
      <p>
        {point.score.toFixed(1)} stars · {point.score_label}
        {point.status && point.status !== "Operating" ? ` · ${point.status}` : ""}
      </p>
      {formatDistance(point.distance) ? <p>{formatDistance(point.distance)}</p> : null}
      {point.open_status ? (
        <p className={openStatusClass(point)}>{point.open_status}</p>
      ) : null}
      {point.opening_hours ? <p className="text-stone-600">Hours: {point.opening_hours}</p> : null}
      {placement ? <p>{placement}</p> : null}
      {point.location_description ? <p className="text-stone-600">{point.location_description}</p> : null}
      {lockerSizes ? <p>Lockers: {lockerSizes}</p> : null}
      {point.phone_number ? (
        <p>
          Phone: <a href={`tel:${point.phone_number}`} className="text-moss underline">{point.phone_number}</a>
        </p>
      ) : null}
      {point.payment_point_descr ? <p className="text-stone-600">{point.payment_point_descr}</p> : null}
      {unavailable ? <p className="text-amber-700">Closed: {unavailable}</p> : null}
      <a
        href={directionsUrl}
        target="_blank"
        rel="noreferrer noopener"
        className="mt-1 inline-block font-medium text-moss underline"
      >
        Get directions →
      </a>
    </div>
  );
}

function openStatusClass(point) {
  if (point.open_now === false) return "font-medium text-red-700";
  if (point.closes_in_minutes !== null && point.closes_in_minutes !== undefined && point.closes_in_minutes <= 30) {
    return "font-medium text-amber-700";
  }
  if (point.open_now === true) return "font-medium text-emerald-700";
  return "text-stone-600";
}

function buildDirectionsUrl(point) {
  const { latitude, longitude } = point.location;
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&destination_place_id=${encodeURIComponent(point.name)}`;
}

function formatPlacement(point) {
  const bits = [];
  if (point.location_type) bits.push(point.location_type);
  if (point.location_category && point.location_category !== "Generic") bits.push(point.location_category);
  if (point.easy_access_zone) bits.push("easy access");
  if (point.location_247) bits.push("24/7");
  return bits.length ? bits.join(" · ") : null;
}

function formatLockerSizes(availability) {
  if (!availability || !availability.details) return null;
  const labels = { A: "S", B: "M", C: "L" };
  const parts = [];
  for (const key of ["A", "B", "C"]) {
    const status = availability.details[key];
    if (status && status !== "NO_DATA") {
      parts.push(`${labels[key]}: ${status.toLowerCase()}`);
    }
  }
  return parts.length ? parts.join(", ") : null;
}

function formatUnavailability(periods) {
  if (!periods || periods.length === 0) return null;
  const formatDate = (raw) => {
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? raw : d.toLocaleDateString();
  };
  const first = periods[0];
  const start = formatDate(first.starts_at || first.start_at || first.from);
  const end = formatDate(first.ends_at || first.end_at || first.to);
  if (start && end) return `${start} – ${end}`;
  if (start) return `from ${start}`;
  if (end) return `until ${end}`;
  return "scheduled unavailability";
}

const METERS_PER_DEG_LAT = 111_320;
const REF_COS_LAT = 0.6157;

function clusterCellMeters(zoom) {
  if (zoom >= 16) return 0;
  if (zoom >= 15) return 150;
  if (zoom >= 14) return 350;
  if (zoom >= 13) return 900;
  if (zoom >= 12) return 2_500;
  if (zoom >= 11) return 7_000;
  if (zoom >= 10) return 18_000;
  return 45_000;
}

function clusterPoints(points, zoom) {
  const cellMeters = clusterCellMeters(zoom);
  if (cellMeters === 0) {
    return points.map((point) => ({
      id: point.name,
      center: [point.location.latitude, point.location.longitude],
      points: [point],
    }));
  }

  const latStep = cellMeters / METERS_PER_DEG_LAT;
  const lonStep = cellMeters / (METERS_PER_DEG_LAT * REF_COS_LAT);
  const groups = new Map();

  points.forEach((point) => {
    const lat = point.location.latitude;
    const lon = point.location.longitude;
    const key = `${Math.floor(lat / latStep)}:${Math.floor(lon / lonStep)}`;
    const existing = groups.get(key);
    if (existing) {
      existing.push(point);
    } else {
      groups.set(key, [point]);
    }
  });

  const result = [];
  groups.forEach((groupedPoints, key) => {
    let latSum = 0;
    let lonSum = 0;
    for (let i = 0; i < groupedPoints.length; i += 1) {
      latSum += groupedPoints[i].location.latitude;
      lonSum += groupedPoints[i].location.longitude;
    }
    const size = groupedPoints.length;
    result.push({
      id: key,
      center: [latSum / size, lonSum / size],
      points: groupedPoints,
    });
  });
  return result;
}

function readVisibleBounds(map) {
  const b = map.getBounds().pad(0.25);
  return {
    north: b.getNorth(),
    south: b.getSouth(),
    east: b.getEast(),
    west: b.getWest(),
  };
}

function clusterInBounds(cluster, bounds) {
  const [lat, lon] = cluster.center;
  return lat <= bounds.north && lat >= bounds.south && lon <= bounds.east && lon >= bounds.west;
}

function clusterIcon(count) {
  const size = count >= 100 ? 58 : count >= 10 ? 50 : 42;
  return L.divIcon({
    className: "point-cluster",
    html: `<span>${count}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function distanceCursorIcon() {
  return L.divIcon({
    className: "distance-source-cursor",
    html: "<span></span>",
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function readBounds(map) {
  const bounds = map.getBounds();
  return {
    north: Number(bounds.getNorth().toFixed(6)),
    south: Number(bounds.getSouth().toFixed(6)),
    east: Number(bounds.getEast().toFixed(6)),
    west: Number(bounds.getWest().toFixed(6)),
  };
}
