import { describe, expect, it } from "vitest";
import { CITIES, coverage, distanceKm, findCity } from "@/lib/cities";
import { phoneDigits, whatsappLink } from "@/lib/whatsapp";

describe("towns", () => {
  it("finds towns regardless of case and punctuation", () => {
    expect(findCity("  kandy ")?.district).toBe("Kandy");
    expect(findCity("nuwaraeliya")?.name).toBe("Nuwara Eliya");
    expect(findCity("Atlantis")).toBeUndefined();
  });

  it("has no duplicate names and every town is inside Sri Lanka", () => {
    expect(new Set(CITIES.map((city) => city.name.toLowerCase())).size).toBe(CITIES.length);
    for (const city of CITIES) {
      expect(city.lat).toBeGreaterThan(5.8);
      expect(city.lat).toBeLessThan(9.9);
      expect(city.lng).toBeGreaterThan(79.6);
      expect(city.lng).toBeLessThan(81.95);
    }
  });

  it("measures roughly the right distance", () => {
    const km = distanceKm(findCity("Colombo")!, findCity("Kandy")!);
    expect(km).toBeGreaterThan(85);
    expect(km).toBeLessThan(105);
  });
});

describe("partner coverage", () => {
  const partner = { city: "Gampaha", serviceRadiusKm: 15, extraCities: ["Negombo"] };

  it("covers the home town", () => {
    expect(coverage(partner, "gampaha")).toMatchObject({ covers: true, distanceKm: 0 });
  });

  it("covers towns within the radius", () => {
    expect(coverage(partner, "Kadawatha").covers).toBe(true);
  });

  it("covers listed extra towns even if far", () => {
    expect(coverage(partner, "Negombo")).toMatchObject({ covers: true, reason: "Listed service area" });
  });

  it("does not cover far towns", () => {
    const result = coverage(partner, "Galle");
    expect(result.covers).toBe(false);
    expect(result.distanceKm).toBeGreaterThan(100);
  });

  it("handles unknown towns", () => {
    expect(coverage(partner, "Somewhere")).toMatchObject({ covers: false, distanceKm: null });
  });
});

describe("WhatsApp links", () => {
  it("normalises Sri Lankan and international numbers", () => {
    expect(phoneDigits("077 123 4567")).toBe("94771234567");
    expect(phoneDigits("+971 50 123 4567")).toBe("971501234567");
    expect(phoneDigits("00974 5555 1234")).toBe("97455551234");
  });

  it("builds a click-to-chat link with the message encoded", () => {
    expect(whatsappLink("+971501234567", "Hi & welcome")).toBe("https://wa.me/971501234567?text=Hi%20%26%20welcome");
  });

  it("falls back to a contact picker when there's no number", () => {
    expect(whatsappLink("", "Hi")).toBe("https://wa.me/?text=Hi");
  });
});
