import "server-only";
import { coverage, findCity } from "@/lib/cities";
import { db } from "@/lib/db";

export type PartnerRow = {
  id: string;
  name: string;
  business_name: string;
  phone: string;
  city: string;
  address: string;
  services: string[];
  service_radius_km: number;
  extra_cities: string[];
  rating: number | null;
  avg_stars: number | null;
  ratings: number;
  bank_details: string;
  notes: string;
  active: boolean;
  agreed: number;
  paid: number;
  balance: number;
  open_jobs: number;
  done_jobs: number;
};

export async function listPartners(options: { includeInactive?: boolean } = {}) {
  const sql = db();
  return sql<PartnerRow[]>`
    select p.*, b.agreed, b.paid, b.balance, b.open_jobs, b.done_jobs, sc.avg_stars, sc.ratings
    from partners p join partner_balances b on b.partner_id = p.id join partner_scores sc on sc.partner_id = p.id
    where ${options.includeInactive ? sql`true` : sql`p.active`}
    order by p.active desc, p.name
  `;
}

export async function getPartner(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const sql = db();
  const [partner] = await sql<PartnerRow[]>`
    select p.*, b.agreed, b.paid, b.balance, b.open_jobs, b.done_jobs, sc.avg_stars, sc.ratings
    from partners p join partner_balances b on b.partner_id = p.id join partner_scores sc on sc.partner_id = p.id where p.id = ${id}
  `;
  if (!partner) return null;
  const [jobs, payments] = await Promise.all([
    sql<{ id: string; order_id: string; order_number: string; recipient_name: string; city: string; delivery_date: string | null; description: string; agreed_amount: number; status: string; paid: number; stars: number | null; rating_comment: string | null }[]>`
      select j.id, j.order_id, o.number as order_number, o.recipient_name, o.city, o.delivery_date, j.description, j.agreed_amount, j.status,
        coalesce((select sum(amount) from partner_payments where job_id = j.id and voided_at is null), 0) as paid,
        r.stars, r.comment as rating_comment
      from partner_jobs j join orders o on o.id = j.order_id left join partner_ratings r on r.job_id = j.id
      where j.partner_id = ${id} order by o.delivery_date desc nulls first, j.created_at desc`,
    sql<{ id: string; amount: number; kind: string; method: string; reference: string; paid_on: string; notes: string; job_id: string | null; order_number: string | null; voided_at: Date | null; void_reason: string | null }[]>`
      select pp.id, pp.amount, pp.kind, pp.method, pp.reference, pp.paid_on, pp.notes, pp.job_id, o.number as order_number, pp.voided_at, pp.void_reason
      from partner_payments pp left join partner_jobs j on j.id = pp.job_id left join orders o on o.id = j.order_id
      where pp.partner_id = ${id} order by pp.paid_on desc, pp.created_at desc`,
  ]);
  return { ...partner, jobs, payments };
}

export type PartnerMatch = PartnerRow & { covers: boolean; distanceKm: number | null; reason: string; jobsThatDay: number };

/**
 * Partners for a delivery: those covering the city first (closest first), then
 * the nearest others. Also counts how many jobs each already has that day.
 */
export async function findPartners(city: string, options: { date?: string | null; service?: string | null; excludeOrderId?: string } = {}): Promise<PartnerMatch[]> {
  if (!city.trim()) return [];
  const sql = db();
  const partners = await listPartners();
  const busy = options.date
    ? await sql<{ partner_id: string; jobs: number }[]>`
        select j.partner_id, count(*)::int as jobs from partner_jobs j join orders o on o.id = j.order_id
        where o.delivery_date = ${options.date} and j.status <> 'cancelled'
          ${options.excludeOrderId ? sql`and o.id <> ${options.excludeOrderId}` : sql``}
        group by j.partner_id`
    : [];
  const jobsByPartner = new Map(busy.map((row) => [row.partner_id, row.jobs]));
  const knownCity = Boolean(findCity(city));
  return partners
    .filter((partner) => !options.service || partner.services.includes(options.service))
    .map((partner) => ({
      ...partner,
      ...coverage({ city: partner.city, serviceRadiusKm: partner.service_radius_km, extraCities: partner.extra_cities }, city),
      jobsThatDay: jobsByPartner.get(partner.id) ?? 0,
    }))
    .filter((partner) => partner.covers || (knownCity && partner.distanceKm !== null && partner.distanceKm <= 60))
    .sort((a, b) => Number(b.covers) - Number(a.covers) || (a.distanceKm ?? 999) - (b.distanceKm ?? 999) || a.jobsThatDay - b.jobsThatDay);
}

/** Their score from job ratings, or the manual rating until they have any. */
export function partnerScore(partner: Pick<PartnerRow, "avg_stars" | "ratings" | "rating">) {
  if (partner.ratings > 0 && partner.avg_stars !== null) return { stars: partner.avg_stars, count: partner.ratings };
  return partner.rating ? { stars: partner.rating, count: 0 } : null;
}

/** Partner jobs on delivered/completed orders that nobody has rated yet. */
export async function unratedJobs(limit = 10) {
  return db()<{ job_id: string; order_id: string; order_number: string; recipient_name: string; partner_name: string }[]>`
    select j.id as job_id, o.id as order_id, o.number as order_number, o.recipient_name, p.name as partner_name
    from partner_jobs j join orders o on o.id = j.order_id join partners p on p.id = j.partner_id
    where o.status in ('delivered', 'completed') and j.status <> 'cancelled'
      and not exists (select 1 from partner_ratings r where r.job_id = j.id)
      and coalesce(o.delivered_at, o.updated_at) > now() - interval '60 days'
    order by coalesce(o.delivered_at, o.updated_at) desc
    limit ${limit}`;
}

export async function partnerOptions() {
  return db()<{ id: string; name: string; city: string; services: string[] }[]>`
    select id, name, city, services from partners where active order by name`;
}
