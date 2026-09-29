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
