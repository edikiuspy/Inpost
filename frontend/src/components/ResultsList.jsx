import { memo, useMemo, useState } from "react";
import { Clock3, CreditCard, MapPin, Search, Star } from "lucide-react";
import { formatAddress, formatDistance } from "../lib/format";

const VISIBLE_LIMIT = 50;

function ResultsList({ points, selectedName, onSelect }) {
  const [query, setQuery] = useState("");
  const trimmed = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!trimmed) {
      return points;
    }
    return points.filter((point) => {
      if (point.name.toLowerCase().includes(trimmed)) {
        return true;
      }
      const address = formatAddress(point).toLowerCase();
      return address.includes(trimmed);
    });
  }, [points, trimmed]);

  const visible = filtered.length > VISIBLE_LIMIT ? filtered.slice(0, VISIBLE_LIMIT) : filtered;
  const hiddenCount = filtered.length - visible.length;
  return (
    <aside className="flex min-h-0 flex-col border-l border-stone-200 bg-white lg:h-full">
      <div className="shrink-0 border-b border-stone-200 px-5 py-4">
        <p className="text-sm font-semibold text-stone-500">
          {filtered.length} results{hiddenCount > 0 ? ` · top ${VISIBLE_LIMIT} shown` : ""}
          {trimmed ? ` of ${points.length}` : ""}
        </p>
        <h2 className="text-xl font-semibold text-ink">Ranked points</h2>
        <label className="mt-3 flex items-center gap-2 rounded-md border border-stone-300 bg-white px-3 focus-within:border-moss">
          <Search size={16} aria-hidden="true" className="text-stone-500" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or address"
            className="h-9 w-full bg-transparent text-sm outline-none"
            aria-label="Filter points by name or address"
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {visible.length === 0 ? (
          <div className="rounded-md border border-dashed border-stone-300 p-5 text-sm text-stone-600">
            No matching points.
          </div>
        ) : (
          <div className="grid gap-3">
            {visible.map((point) => (
              <ResultCard
                key={point.name}
                point={point}
                selected={selectedName === point.name}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

const ResultCard = memo(function ResultCard({ point, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(point.name)}
      className={`rounded-md border p-4 text-left transition hover:border-moss ${
        selected ? "border-moss bg-green-50" : "border-stone-200 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-ink">{point.name}</p>
          <p className="mt-1 text-sm text-stone-600">{formatAddress(point)}</p>
        </div>
        <ScoreBadge point={point} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-600">
        {formatDistance(point.distance) ? <Meta icon={MapPin} text={formatDistance(point.distance)} /> : null}
        {point.location_247 ? <Meta icon={Clock3} text="24/7" /> : null}
        {point.payment_available ? <Meta icon={CreditCard} text="Payment" /> : null}
      </div>

      <ul className="mt-3 grid gap-1 text-sm text-stone-700">
        {point.score_reasons.slice(0, 3).map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </button>
  );
});

function ScoreBadge({ point }) {
  return (
    <div className="grid min-w-20 justify-items-end gap-1">
      <div className="flex text-amber">
        {Array.from({ length: 5 }, (_, index) => (
          <Star
            key={index}
            size={15}
            fill={index < Math.round(point.score) ? "currentColor" : "none"}
            aria-hidden="true"
          />
        ))}
      </div>
      <span className="text-sm font-semibold text-ink">{point.score.toFixed(1)}</span>
    </div>
  );
}

function Meta({ icon: Icon, text }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 px-2 py-1">
      <Icon size={13} aria-hidden="true" />
      {text}
    </span>
  );
}

export default memo(ResultsList);
