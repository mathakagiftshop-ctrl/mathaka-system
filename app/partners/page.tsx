import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircle, Plus, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge, Empty, Money, PageHeader, Stars, Stat } from "@/components/bits";
import { SriLankaMap, type MapMarker } from "@/components/sri-lanka-map";
import { can, requireUser } from "@/lib/auth";
import { CITIES, findCity } from "@/lib/cities";
import { SERVICES } from "@/lib/constants";
import { findPartners, listPartners, partnerScore, type PartnerRow } from "@/lib/data/partners";
import { formatDate } from "@/lib/format";
import { whatsappLink } from "@/lib/whatsapp";

export const metadata: Metadata = { title: "Partners" };

export default async function PartnersPage({ searchParams }: { searchParams: Promise<{ city?: string; date?: string; service?: string; archived?: string }> }) {
  const params = await searchParams;
  const user = await requireUser();
  const finance = can(user, "finance");
  const [partners, matches] = await Promise.all([
    listPartners({ includeInactive: params.archived === "1" }),
    params.city ? findPartners(params.city, { date: params.date || null, service: params.service || null }) : Promise.resolve(null),
  ]);
  const active = partners.filter((partner) => partner.active);
  const owed = active.reduce((sum, partner) => sum + Math.max(partner.balance, 0), 0);
  const advanced = active.reduce((sum, partner) => sum + Math.max(-partner.balance, 0), 0);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Partners"
        title="Cake makers & helpers"
        description="Find who can deliver where, see what you owe them, and track advances."
        actions={<Link className="btn primary" href="/partners/new"><Plus size={16} />Add partner</Link>}
      />

      <section className="card" style={{ marginBottom: 22 }}>
        <h2 style={{ marginBottom: 12 }}>Find a partner for a new order</h2>
        <datalist id="city-list">{CITIES.map((city) => <option key={city.name} value={city.name}>{city.district}</option>)}</datalist>
        <form className="filters" action="/partners" style={{ marginBottom: 0 }}>
          <label className="field grow"><span>Delivery town</span><input name="city" list="city-list" defaultValue={params.city} placeholder="e.g. Kurunegala" required autoComplete="off" /></label>
          <label className="field"><span>Delivery date</span><input name="date" type="date" defaultValue={params.date} /></label>
          <label className="field"><span>Service</span>
            <select name="service" defaultValue={params.service ?? ""}>
              <option value="">Any</option>
              {SERVICES.map((service) => <option key={service}>{service}</option>)}
            </select>
          </label>
          <button className="btn primary" type="submit"><Search size={15} />Search</button>
        </form>
        {matches && (
          <div style={{ marginTop: 16 }}>
            {!findCity(params.city) && <p className="notice warn" style={{ marginBottom: 10 }}>“{params.city}” isn&apos;t in the town list, so only exact matches are shown. Pick a town from the suggestions for distance search.</p>}
            {matches.length === 0 ? (
              <Empty title={`No partners near ${params.city}`}><p>Add one, or widen a nearby partner&apos;s delivery distance.</p></Empty>
            ) : matches.map((partner) => (
              <div key={partner.id} className="match">
                <div>
                  <h3><Link href={`/partners/${partner.id}`} className="row-link">{partner.name}</Link> <small style={{ display: "inline" }}>· {partner.city}</small></h3>
                  <p className="meta">
                    {partner.reason}{partner.covers && partner.distanceKm ? ` · ${Math.round(partner.distanceKm)} km away` : ""} · {partner.services.join(", ") || "No services listed"}
                    {partnerScore(partner) && <> · <Stars score={partnerScore(partner)} /></>}
                  </p>
                  <p className="meta">
                    {params.date ? (partner.jobsThatDay ? `⚠ ${partner.jobsThatDay} job(s) already on ${formatDate(params.date)}` : `Free on ${formatDate(params.date)}`) : `${partner.open_jobs} open job(s)`}
                    {finance && partner.balance !== 0 && ` · ${partner.balance > 0 ? "We owe" : "Advance with them"} ${Math.abs(partner.balance).toLocaleString("en-LK")}`}
                  </p>
                </div>
                <div className="stack" style={{ gap: 6, justifyItems: "end" }}>
                  {partner.covers ? <Badge tone="sage">Covers</Badge> : <Badge>Nearby</Badge>}
                  {partner.phone && <a className="btn small whatsapp" target="_blank" rel="noreferrer" href={whatsappLink(partner.phone, `Hi ${partner.name}, are you available for a cake order in ${params.city}${params.date ? ` on ${formatDate(params.date)}` : ""}?`)}><MessageCircle size={14} />Ask</a>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="stats">
        <Stat label="Active partners" value={active.length} note={`${new Set(active.map((partner) => partner.city.toLowerCase())).size} towns`} />
        <Stat label="Open jobs" value={active.reduce((sum, partner) => sum + partner.open_jobs, 0)} />
        {finance && <Stat label="We owe partners" value={<Money value={owed} />} tone={owed > 0 ? "warn" : undefined} />}
        {finance && <Stat label="Advances with partners" value={<Money value={advanced} />} note="Paid ahead of finished work" />}
      </div>

      <section className="card" style={{ marginBottom: 22 }}>
        <div className="card-head"><h2>Partner coverage</h2><small>Circle size = number of partners in that town</small></div>
        <SriLankaMap markers={partnerMarkers(active)} />
      </section>

      <div className="spread" style={{ marginBottom: 10 }}>
        <h2>All partners</h2>
        <Link className="link" href={params.archived === "1" ? "/partners" : "/partners?archived=1"}>{params.archived === "1" ? "Hide archived" : "Show archived"}</Link>
      </div>
      {partners.length === 0 ? (
        <Empty title="No partners yet"><p>Add the cake makers you work with, with the town they&apos;re based in.</p></Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Partner</th><th>Town</th><th>Services</th><th>Rating</th><th className="right">Open jobs</th><th className="right">Done</th>{finance && <th className="right">Balance</th>}</tr></thead>
            <tbody>
              {partners.map((partner) => (
                <tr key={partner.id} className="clickable">
                  <td><Link className="row-link" href={`/partners/${partner.id}`}>{partner.name}</Link>{!partner.active && <> <Badge>Archived</Badge></>}<small>{partner.phone}</small></td>
                  <td>{partner.city}<small>{partner.service_radius_km} km{partner.extra_cities.length ? ` + ${partner.extra_cities.length} towns` : ""}</small></td>
                  <td><div className="chips">{partner.services.map((service) => <span className="chip" key={service}>{service}</span>)}</div></td>
                  <td>{partnerScore(partner) ? <Stars score={partnerScore(partner)} /> : <small>Not rated</small>}</td>
                  <td className="right num">{partner.open_jobs}</td>
                  <td className="right num">{partner.done_jobs}</td>
                  {finance && <td className="right">{partner.balance > 0 ? <><Money value={partner.balance} /><small>we owe</small></> : partner.balance < 0 ? <><Money value={-partner.balance} /><small>advance</small></> : <small>Settled</small>}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}

function partnerMarkers(partners: PartnerRow[]): MapMarker[] {
  const byCity = new Map<string, PartnerRow[]>();
  for (const partner of partners) {
    const city = findCity(partner.city);
    if (!city) continue;
    byCity.set(city.name, [...(byCity.get(city.name) ?? []), partner]);
  }
  return [...byCity.entries()].map(([name, list]) => {
    const city = findCity(name)!;
    return {
      lat: city.lat, lng: city.lng, weight: list.length, color: "#382032",
      title: `${name} · ${list.length} partner${list.length === 1 ? "" : "s"}`,
      lines: list.map((partner) => `${partner.name}${partner.services.length ? ` — ${partner.services.join(", ")}` : ""}`),
      href: `/partners?city=${encodeURIComponent(name)}`,
    };
  });
}
