import { useState } from "react";

/** Order / cycle / trade status as a coloured pill. */
export function StatusPill({ value }) {
  if (!value) return null;
  const v = String(value).toUpperCase();
  const tone = ["FILLED", "COMPLETED"].includes(v) ? "good"
    : ["REJECTED", "FAILED"].includes(v) ? "bad"
      : ["CANCELED", "PARTIAL", "SKIPPED"].includes(v) ? "warn" : "neutral";
  return <span className={`pill ${tone}`}>{v.replace("_", " ")}</span>;
}

/** Previous / next controls for a server-paged table. */
export function Pager({ page, size, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
      <button className="secondary xs" disabled={page <= 0} onClick={() => onPage(page - 1)}>‹ newer</button>
      <span className="muted" style={{ fontSize: 13 }}>
        {total === 0 ? "nothing yet" : `${page * size + 1}–${Math.min(total, (page + 1) * size)} of ${total.toLocaleString("en-US")}`} · page {page + 1} of {pages}
      </span>
      <button className="secondary xs" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)}>older ›</button>
    </div>
  );
}

/** Toggle chips for choosing several items from a list, with a filter box when the list is long. */
export function ChipPicker({ options, value, onChange, emptyHint }) {
  const [q, setQ] = useState("");
  const selected = new Set(value);
  const shown = options.filter((o) => !q.trim() || o.label.toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (id) => onChange(selected.has(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div>
      {options.length > 12 && (
        <input placeholder="filter…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "100%", marginBottom: 6 }} />
      )}
      <div className="chip-row" style={{ maxHeight: 132, overflow: "auto" }}>
        {shown.map((o) => {
          const on = selected.has(o.id);
          return (
            <span key={o.id} className="tag row-click" title={o.title} onClick={() => toggle(o.id)}
                  style={{ borderColor: on ? "var(--accent)" : undefined, color: on ? "var(--accent)" : undefined }}>
              {on ? "✓ " : ""}{o.label}
            </span>
          );
        })}
        {shown.length === 0 && <span className="muted" style={{ fontSize: 12 }}>no match</span>}
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
        {value.length === 0 ? emptyHint : `${value.length} selected`}
        {value.length > 0 && <> · <span className="row-click" onClick={() => onChange([])}>clear</span></>}
      </div>
    </div>
  );
}
