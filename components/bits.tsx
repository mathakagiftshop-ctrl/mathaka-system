import { statusInfo } from "@/lib/constants";
import { formatMoney } from "@/lib/format";

export function StatusBadge({ status }: { status: string }) {
  const info = statusInfo(status);
  return <span className={`badge ${info.tone}`} title={info.hint}>{info.label}</span>;
}

export function Badge({ tone = "", children }: { tone?: "" | "blue" | "gold" | "sage" | "ribbon"; children: React.ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Money({ value, currency = "LKR", tone }: { value: number; currency?: string; tone?: "auto" }) {
  const color = tone === "auto" ? (value < 0 ? "var(--ribbon-dark)" : value > 0 ? "var(--sage)" : undefined) : undefined;
  return <span className="num" style={color ? { color, fontWeight: 700 } : undefined}>{formatMoney(value, currency)}</span>;
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </header>
  );
}

export function Stat({ label, value, note, tone }: { label: string; value: React.ReactNode; note?: React.ReactNode; tone?: "dark" | "good" | "warn" }) {
  return (
    <div className={`stat ${tone ?? ""}`}>
      <small>{label}</small>
      <strong>{value}</strong>
      {note && <span>{note}</span>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return <div className="empty"><strong>{title}</strong>{children}</div>;
}

/** "★ 4.6 (12)" for an average of job ratings, or plain stars for a manual rating. */
export function Stars({ score }: { score: { stars: number; count: number } | null }) {
  if (!score) return null;
  return (
    <span className="stars" title={score.count ? `${score.stars} average from ${score.count} rating${score.count === 1 ? "" : "s"}` : "Manual rating"}>
      {score.count ? <>★ {score.stars.toFixed(1)} <small>({score.count})</small></> : "★".repeat(Math.round(score.stars))}
    </span>
  );
}

/** Five tappable stars as radio buttons (no client JS). */
export function StarInput({ name = "stars", defaultValue }: { name?: string; defaultValue?: number | null }) {
  return (
    <fieldset className="star-input" aria-label="Rating">
      {[5, 4, 3, 2, 1].map((value) => (
        <label key={value} title={`${value} star${value === 1 ? "" : "s"}`}>
          <input type="radio" name={name} value={value} defaultChecked={defaultValue === value} required />
          <span aria-hidden>★</span>
          <span className="sr-only">{value} star{value === 1 ? "" : "s"}</span>
        </label>
      ))}
    </fieldset>
  );
}
