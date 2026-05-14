import { useEffect, useRef, useState } from "react";
import { LocateFixed, MapPin, Search } from "lucide-react";
import { geocode } from "../lib/api";

export default function FiltersPanel({ filters, onChange, onSubmit, loading, onUseLocation, onPickAddress }) {
  return (
    <form onSubmit={onSubmit} className="flex min-h-0 flex-col border-r border-stone-200 bg-paper lg:h-full">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
        <div>
          <p className="text-xs font-semibold uppercase text-moss">InPost</p>
          <h1 className="mt-1 text-2xl font-semibold text-ink">Smart Point Finder</h1>
        </div>

        <label className="grid gap-1 text-sm font-medium text-stone-700">
          City
          <input
            value={filters.city}
            onChange={(event) => onChange({ city: event.target.value })}
            className="h-10 rounded-md border border-stone-300 bg-white px-3 outline-none focus:border-moss"
            placeholder="Warszawa"
          />
        </label>

        <AddressField
          value={filters.addressLabel ?? ""}
          coords={filters.lat && filters.lon ? `${filters.lat}, ${filters.lon}` : null}
          onPick={onPickAddress}
        />

        <button
          type="button"
          onClick={onUseLocation}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-stone-300 bg-white px-3 text-sm font-medium text-ink hover:border-moss"
        >
          <LocateFixed size={17} aria-hidden="true" />
          Use my location
        </button>

        <label className="grid gap-1 text-sm font-medium text-stone-700">
          Workflow
          <select
            value={filters.workflow}
            onChange={(event) => onChange({ workflow: event.target.value })}
            className="h-10 rounded-md border border-stone-300 bg-white px-3 outline-none focus:border-moss"
          >
            <option value="collect">Collect parcel</option>
            <option value="send">Send parcel</option>
            <option value="return">Return parcel</option>
            <option value="none">No service filter</option>
          </select>
        </label>

        <label className="grid gap-1 text-sm font-medium text-stone-700">
          Point type
          <select
            value={filters.pointType}
            onChange={(event) => onChange({ pointType: event.target.value })}
            className="h-10 rounded-md border border-stone-300 bg-white px-3 outline-none focus:border-moss"
          >
            <option value="parcel_locker">Parcel locker</option>
            <option value="pop">ParcelPoint</option>
            <option value="">Any type</option>
          </select>
        </label>

        <div className="grid gap-3">
          <label className="grid gap-1 text-sm font-medium text-stone-700">
            Radius
            <select
              value={filters.maxDistance}
              onChange={(event) => onChange({ maxDistance: event.target.value })}
              className="h-10 rounded-md border border-stone-300 bg-white px-3 outline-none focus:border-moss"
            >
              <option value="1000">1 km</option>
              <option value="3000">3 km</option>
              <option value="10000">10 km</option>
              <option value="50000">50 km</option>
            </select>
          </label>
        </div>

        <label className="flex items-center justify-between gap-3 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700">
          Open now only
          <input
            type="checkbox"
            checked={filters.openNow}
            onChange={(event) => onChange({ openNow: event.target.checked })}
            className="h-5 w-5 accent-moss"
          />
        </label>

        <label className="flex items-center justify-between gap-3 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700">
          24/7 only
          <input
            type="checkbox"
            checked={filters.only247}
            onChange={(event) => onChange({ only247: event.target.checked })}
            className="h-5 w-5 accent-moss"
          />
        </label>

        <label className="flex items-center justify-between gap-3 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700">
          Payment required
          <input
            type="checkbox"
            checked={filters.paymentRequired}
            onChange={(event) => onChange({ paymentRequired: event.target.checked })}
            className="h-5 w-5 accent-moss"
          />
        </label>
      </div>

      <div className="border-t border-stone-200 bg-paper p-4">
        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white hover:bg-moss disabled:cursor-not-allowed disabled:bg-stone-400"
        >
          <Search size={17} aria-hidden="true" />
          {loading ? "Searching..." : "Search"}
        </button>
      </div>
    </form>
  );
}

function AddressField({ value, coords, onPick }) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const blurTimerRef = useRef(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2 || trimmed === value) {
      setSuggestions([]);
      setLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const results = await geocode(trimmed, controller.signal);
        setSuggestions(results);
      } catch (err) {
        if (err.name !== "AbortError") {
          setSuggestions([]);
        }
      } finally {
        setLoading(false);
      }
    }, 280);
    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [query, value]);

  const choose = (item) => {
    setQuery(item.display_name);
    setSuggestions([]);
    setOpen(false);
    onPick?.(item);
  };

  return (
    <div className="relative">
      <label className="grid gap-1 text-sm font-medium text-stone-700">
        Address
        <div className="flex items-center gap-2 rounded-md border border-stone-300 bg-white px-3 focus-within:border-moss">
          <MapPin size={16} aria-hidden="true" className="text-stone-500" />
          <input
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              blurTimerRef.current = setTimeout(() => setOpen(false), 150);
            }}
            placeholder="Street name and number"
            className="h-10 w-full bg-transparent text-sm outline-none"
            aria-autocomplete="list"
            aria-expanded={open && suggestions.length > 0}
          />
        </div>
      </label>
      {coords ? <p className="mt-1 text-xs text-stone-500">{coords}</p> : null}
      {open && (loading || suggestions.length > 0) ? (
        <ul
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-md border border-stone-200 bg-white shadow-lg"
          onMouseDown={() => {
            if (blurTimerRef.current) {
              clearTimeout(blurTimerRef.current);
              blurTimerRef.current = null;
            }
          }}
        >
          {loading && suggestions.length === 0 ? (
            <li className="px-3 py-2 text-sm text-stone-500">Searching…</li>
          ) : null}
          {suggestions.map((item) => (
            <li key={`${item.lat},${item.lon},${item.display_name}`}>
              <button
                type="button"
                onClick={() => choose(item)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-stone-100"
              >
                {item.display_name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
