import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FiltersPanel from "./components/FiltersPanel.jsx";
import PointsMap from "./components/PointsMap.jsx";
import ResultsList from "./components/ResultsList.jsx";
import { searchPoints } from "./lib/api.js";

const INSTANT_FILTER_KEYS = new Set([
  "workflow",
  "pointType",
  "maxDistance",
  "only247",
  "paymentRequired",
  "openNow",
]);

const DEFAULT_FILTERS = {
  city: "Warszawa",
  province: "",
  postCode: "",
  lat: "",
  lon: "",
  addressLabel: "",
  maxDistance: "10000",
  pointType: "parcel_locker",
  workflow: "collect",
  only247: false,
  paymentRequired: false,
  openNow: true,
};

export default function App() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [points, setPoints] = useState([]);
  const [allCachedPoints, setAllCachedPoints] = useState([]);
  const [listPoints, setListPoints] = useState([]);
  const [selectedName, setSelectedName] = useState(null);
  const [viewportBounds, setViewportBounds] = useState(null);
  const [focusLocation, setFocusLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [possiblyIncomplete, setPossiblyIncomplete] = useState(false);
  const [zoom, setZoom] = useState(12);
  const SELECTION_ZOOM = 13;
  const showResultsList = zoom >= SELECTION_ZOOM;
  const filtersRef = useRef(DEFAULT_FILTERS);
  const viewportBoundsRef = useRef(null);
  const loadedBoundsRef = useRef(null);
  const pendingFetchBoundsRef = useRef(null);
  const pointCacheRef = useRef(new Map());
  const filterKeyRef = useRef(filterKey(DEFAULT_FILTERS));
  const requestIdRef = useRef(0);
  const fetchTimerRef = useRef(null);
  const listSyncTimerRef = useRef(null);

  const selectedPoint = useMemo(
    () => points.find((point) => point.name === selectedName) ?? points[0] ?? null,
    [points, selectedName],
  );

  const distanceSource = useMemo(() => {
    const latitude = Number(filters.lat);
    const longitude = Number(filters.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }
    return [latitude, longitude];
  }, [filters.lat, filters.lon]);

  const runSearch = useCallback(async (
    nextFilters = filtersRef.current,
    fetchBounds = viewportBoundsRef.current,
    visibleBounds = viewportBoundsRef.current,
  ) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    pendingFetchBoundsRef.current = fetchBounds;
    setLoading(true);
    setError(null);
    try {
      const response = await searchPoints(nextFilters, fetchBounds);
      if (requestId !== requestIdRef.current) {
        return;
      }
      response.items.forEach((point) => pointCacheRef.current.set(point.name, point));
      loadedBoundsRef.current = fetchBounds;
      pendingFetchBoundsRef.current = null;
      setPossiblyIncomplete(Boolean(response.possibly_incomplete));
      const liveBounds = viewportBoundsRef.current ?? visibleBounds;
      const allCached = Array.from(pointCacheRef.current.values());
      const visiblePoints = filterPointsToBounds(allCached, liveBounds);
      setAllCachedPoints(allCached);
      setPoints(visiblePoints);
      setSelectedName((current) => {
        if (!current) {
          return null;
        }
        return visiblePoints.some((point) => point.name === current) ? current : null;
      });
    } catch (err) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      pendingFetchBoundsRef.current = null;
      setError(err.message);
      setPoints([]);
      setAllCachedPoints([]);
      setPossiblyIncomplete(false);
      setSelectedName(null);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const scheduleFetch = useCallback((bounds, delay = 120) => {
    if (fetchTimerRef.current) {
      clearTimeout(fetchTimerRef.current);
    }
    const fetchBounds = expandBounds(bounds, 1.0);
    fetchTimerRef.current = setTimeout(() => {
      fetchTimerRef.current = null;
      runSearch(filtersRef.current, fetchBounds, viewportBoundsRef.current ?? bounds);
    }, delay);
  }, [runSearch]);

  useEffect(() => () => {
    if (fetchTimerRef.current) {
      clearTimeout(fetchTimerRef.current);
    }
    if (listSyncTimerRef.current) {
      clearTimeout(listSyncTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!showResultsList) {
      if (listSyncTimerRef.current) {
        clearTimeout(listSyncTimerRef.current);
        listSyncTimerRef.current = null;
      }
      return;
    }
    if (listSyncTimerRef.current) {
      clearTimeout(listSyncTimerRef.current);
    }
    listSyncTimerRef.current = setTimeout(() => {
      listSyncTimerRef.current = null;
      setListPoints(points);
    }, 180);
  }, [points, showResultsList]);

  const handleSelectName = useCallback((name) => {
    setSelectedName(name);
  }, []);

  const handleViewportChange = useCallback((bounds, kind = "settled") => {
    ensureCacheMatchesFilters(filtersRef.current, filterKeyRef, pointCacheRef, loadedBoundsRef);
    viewportBoundsRef.current = bounds;
    setViewportBounds(bounds);
    const cachedPoints = Array.from(pointCacheRef.current.values());
    setPoints(filterPointsToBounds(cachedPoints, bounds));

    const loaded = loadedBoundsRef.current;
    const pending = pendingFetchBoundsRef.current;
    const covers = (b) => b && containsBounds(b, bounds);
    const insideLoaded = covers(loaded) || covers(pending);

    if (kind === "settled") {
      scheduleFetch(bounds, 250);
      return;
    }

    if (!insideLoaded) {
      scheduleFetch(bounds, 140);
    }
  }, [scheduleFetch]);

  function updateFilters(patch) {
    const instantRefetch = Object.keys(patch).some((key) => INSTANT_FILTER_KEYS.has(key));
    if (instantRefetch) {
      setPossiblyIncomplete(false);
    }
    setFilters((current) => {
      const next = { ...current, ...patch };
      filtersRef.current = next;
      if (instantRefetch) {
        resetPointCache(pointCacheRef, loadedBoundsRef, filterKeyRef, next);
        setAllCachedPoints([]);
        setPoints([]);
        setListPoints([]);
        const bounds = viewportBoundsRef.current;
        if (bounds) {
          runSearch(next, expandBounds(bounds, 1.0), bounds);
        }
      }
      return next;
    });
  }

  function handleSubmit(event) {
    event.preventDefault();
    setPossiblyIncomplete(false);
    resetPointCache(pointCacheRef, loadedBoundsRef, filterKeyRef, filtersRef.current);
    setAllCachedPoints([]);
    const bounds = viewportBoundsRef.current;
    runSearch(filtersRef.current, bounds ? expandBounds(bounds, 1.0) : null, bounds);
  }

  function handleUseLocation() {
    if (!navigator.geolocation) {
      setError("Geolocation is not available in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        applyLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          label: "My location",
        });
      },
      () => setError("Could not read browser location."),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  function handlePickAddress(suggestion) {
    applyLocation({
      lat: Number(suggestion.lat),
      lon: Number(suggestion.lon),
      label: suggestion.display_name,
    });
  }

  function applyLocation({ lat, lon, label }) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return;
    }
    const next = {
      ...filtersRef.current,
      lat: lat.toFixed(5),
      lon: lon.toFixed(5),
      addressLabel: label ?? "",
    };
    filtersRef.current = next;
    setPossiblyIncomplete(false);
    resetPointCache(pointCacheRef, loadedBoundsRef, filterKeyRef, next);
    setAllCachedPoints([]);
    setPoints([]);
    setListPoints([]);
    setFilters(next);
    setFocusLocation([lat, lon]);
    const bounds = viewportBoundsRef.current;
    runSearch(next, bounds ? expandBounds(bounds, 1.0) : null, bounds);
  }

  const gridClass = showResultsList
    ? "lg:grid-cols-[320px_minmax(0,1fr)_380px]"
    : "lg:grid-cols-[320px_minmax(0,1fr)]";

  return (
    <div className={`grid min-h-screen grid-cols-1 bg-stone-100 text-ink lg:h-screen lg:min-h-0 ${gridClass} lg:overflow-hidden`}>
      <FiltersPanel
        filters={filters}
        onChange={updateFilters}
        onSubmit={handleSubmit}
        loading={loading}
        onUseLocation={handleUseLocation}
        onPickAddress={handlePickAddress}
      />

      <main className="relative min-h-[420px] lg:min-h-0 lg:overflow-hidden">
        <PointsMap
          points={allCachedPoints}
          selectedName={selectedPoint?.name}
          userSelectedName={selectedName}
          focusLocation={focusLocation}
          distanceSource={distanceSource}
          onSelect={handleSelectName}
          onViewportChange={handleViewportChange}
          onZoomChange={setZoom}
        />
        {error ? (
          <div className="absolute left-4 top-4 max-w-sm rounded-md border border-red-200 bg-white px-4 py-3 text-sm text-red-700 shadow">
            {error}
          </div>
        ) : null}
        {loading ? (
          <div className="absolute right-4 top-4 rounded-md bg-white px-4 py-3 text-sm font-medium text-stone-700 shadow">
            Loading points...
          </div>
        ) : null}
        {possiblyIncomplete ? (
          <div className="absolute bottom-4 left-4 max-w-sm rounded-md border border-amber-200 bg-white px-4 py-3 text-sm text-stone-700 shadow">
            Dense area: zoom in for more precise coverage.
          </div>
        ) : null}
        {!showResultsList && points.length > 0 ? (
          <div className="absolute bottom-4 right-4 rounded-md border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700 shadow">
            Zoom in to compare points ({points.length} in view)
          </div>
        ) : null}
      </main>

      {showResultsList ? (
        <ResultsList points={listPoints} selectedName={selectedName} onSelect={handleSelectName} />
      ) : null}
    </div>
  );
}

function filterKey(filters) {
  return JSON.stringify({
    city: filters.city,
    province: filters.province,
    postCode: filters.postCode,
    lat: filters.lat,
    lon: filters.lon,
    maxDistance: filters.maxDistance,
    pointType: filters.pointType,
    workflow: filters.workflow,
    only247: filters.only247,
    paymentRequired: filters.paymentRequired,
    openNow: filters.openNow,
  });
}

function ensureCacheMatchesFilters(filters, filterKeyRef, pointCacheRef, loadedBoundsRef) {
  const currentKey = filterKey(filters);
  if (filterKeyRef.current !== currentKey) {
    resetPointCache(pointCacheRef, loadedBoundsRef, filterKeyRef, filters);
  }
}

function resetPointCache(pointCacheRef, loadedBoundsRef, filterKeyRef, filters) {
  pointCacheRef.current = new Map();
  loadedBoundsRef.current = null;
  filterKeyRef.current = filterKey(filters);
}

function expandBounds(bounds, paddingRatio = 1.0) {
  if (!bounds) {
    return null;
  }
  const latPadding = (bounds.north - bounds.south) * paddingRatio;
  const lonPadding = (bounds.east - bounds.west) * paddingRatio;
  return {
    north: clamp(bounds.north + latPadding, -90, 90),
    south: clamp(bounds.south - latPadding, -90, 90),
    east: clamp(bounds.east + lonPadding, -180, 180),
    west: clamp(bounds.west - lonPadding, -180, 180),
  };
}

function containsBounds(outer, inner) {
  return outer.north >= inner.north && outer.south <= inner.south && outer.east >= inner.east && outer.west <= inner.west;
}

function filterPointsToBounds(points, bounds) {
  if (!bounds) {
    return points;
  }
  return points.filter((point) => {
    const latitude = point.location.latitude;
    const longitude = point.location.longitude;
    return latitude <= bounds.north && latitude >= bounds.south && longitude <= bounds.east && longitude >= bounds.west;
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
