import { ActionForm, Field, Submit, TextArea } from "@/components/form";
import { savePartner } from "@/app/partners/actions";
import { CITIES } from "@/lib/cities";
import { SERVICES } from "@/lib/constants";
import type { PartnerRow } from "@/lib/data/partners";

export function PartnerForm({ partner }: { partner?: PartnerRow }) {
  return (
    <ActionForm action={savePartner} resetOnSuccess={false} className="stack">
      {partner && <input type="hidden" name="partner_id" value={partner.id} />}
      <datalist id="city-list">{CITIES.map((city) => <option key={city.name} value={city.name}>{city.district}</option>)}</datalist>
      <section className="card">
        <h2>Who they are</h2>
        <div className="form-grid">
          <Field label="Name" name="name" required defaultValue={partner?.name} />
          <Field label="Business / page name" name="business_name" defaultValue={partner?.business_name} placeholder="e.g. Sweet Bites Cakes (Facebook)" />
          <Field label="WhatsApp number" name="phone" defaultValue={partner?.phone} placeholder="077 123 4567" />
          <label className="field"><span>Rating</span>
            <select name="rating" defaultValue={partner?.rating ?? 0}>
              <option value={0}>Not rated</option>
              {[5, 4, 3, 2, 1].map((stars) => <option key={stars} value={stars}>{"★".repeat(stars)}</option>)}
            </select>
          </label>
        </div>
      </section>
      <section className="card">
        <h2>Where they work</h2>
        <div className="form-grid">
          <label className="field"><span>Based in (town)</span>
            <input name="city" list="city-list" required defaultValue={partner?.city} autoComplete="off" />
            <small>Pick from the list so they appear on the map and in searches.</small>
          </label>
          <Field label="Delivers up to (km)" name="service_radius_km" type="number" min="0" max="300" defaultValue={partner?.service_radius_km ?? 10} hint="Towns within this distance count as covered." />
          <TextArea label="Also covers these towns" name="extra_cities" rows={2} className="full" defaultValue={partner?.extra_cities.join(", ")} hint="Comma separated, e.g. Negombo, Ja-Ela" />
          <TextArea label="Address" name="address" rows={2} className="full" defaultValue={partner?.address} />
        </div>
      </section>
      <section className="card">
        <h2>What they do</h2>
        <fieldset className="chips" style={{ gap: 14 }}>
          {SERVICES.map((service) => (
            <label key={service} className="check"><input type="checkbox" name="services[]" value={service} defaultChecked={partner?.services.includes(service)} />{service}</label>
          ))}
        </fieldset>
      </section>
      <section className="card">
        <h2>Payment & notes</h2>
        <div className="form-grid">
          <TextArea label="Bank details" name="bank_details" className="full" defaultValue={partner?.bank_details} placeholder="Bank, branch, account name and number" />
          <TextArea label="Notes" name="notes" className="full" defaultValue={partner?.notes} placeholder="Prices, quality, reliability…" />
        </div>
      </section>
      <div className="form-actions"><Submit>{partner ? "Save partner" : "Add partner"}</Submit></div>
    </ActionForm>
  );
}
