import type { Culture } from "./voice";

// A calendar of shared moments that posts can tie into ("salary day",
// "Diwali gifting", "Monday"). Timely posts get shared more because
// everyone's living the same moment that week.
//
// Recurring moments are computed from the date; festivals are listed by
// date because lunar festivals move every year. Festival dates for 2026-27
// were checked against published calendars (drikpanchang.com and others);
// add the next year's before the list runs out.

export type Moment = {
  id: string;
  // What the moment is, phrased for the prompt.
  label: string;
  // How posts can use it, so the writer ties it to the brand sensibly.
  angle: string;
  culture: Culture | "any";
  // Gifting moments suit gifting-friendly products; everyday ones suit all.
  kind: "everyday" | "gifting" | "season" | "festival";
};

type Dated = Moment & { start: string; end: string };

const d = (s: string) => new Date(`${s}T00:00:00+05:30`);

// Festival windows open before the day itself: gifting and prep content
// has to go out while people are still shopping and planning.
const FESTIVALS: Dated[] = [
  { id: "raksha-bandhan-2026", start: "2026-08-18", end: "2026-08-28", label: "Raksha Bandhan (Aug 28)", angle: "sibling gifting, brother-sister banter", culture: "india", kind: "gifting" },
  { id: "ganesh-2026", start: "2026-09-08", end: "2026-09-16", label: "Ganesh Chaturthi (Sep 14)", angle: "festive prep, family gatherings", culture: "india", kind: "festival" },
  { id: "navratri-2026", start: "2026-10-05", end: "2026-10-20", label: "Navratri and Dussehra (Oct 11-20)", angle: "garba nights, dressing up, festive energy", culture: "india", kind: "festival" },
  { id: "festive-sales-2026", start: "2026-09-20", end: "2026-10-25", label: "Festive sale season (Big Billion Days, Great Indian Festival)", angle: "cart-filling, deal hunting, treat-yourself", culture: "india", kind: "season" },
  { id: "diwali-2026", start: "2026-10-22", end: "2026-11-08", label: "Diwali (Nov 8)", angle: "Diwali gifting, cleaning, family visits, looking good in photos", culture: "india", kind: "gifting" },
  { id: "christmas-2026", start: "2026-12-10", end: "2026-12-25", label: "Christmas", angle: "Secret Santa, year-end gifting", culture: "any", kind: "gifting" },
  { id: "new-year-2027", start: "2026-12-26", end: "2027-01-07", label: "New Year resolutions", angle: "new year, new me, resolutions that last a week", culture: "any", kind: "season" },
  { id: "valentines-2027", start: "2027-02-01", end: "2027-02-14", label: "Valentine's Day", angle: "gifts for partners, single people jokes", culture: "any", kind: "gifting" },
  { id: "eid-fitr-2027", start: "2027-03-01", end: "2027-03-10", label: "Eid al-Fitr (Mar 10)", angle: "Eid outfits, family feasts, gifting", culture: "india", kind: "festival" },
  { id: "holi-2027", start: "2027-03-12", end: "2027-03-22", label: "Holi (Mar 22)", angle: "colours, getting colour off skin and hair, parties", culture: "india", kind: "festival" },
  { id: "janmashtami-2027", start: "2027-08-20", end: "2027-08-25", label: "Janmashtami (Aug 25)", angle: "festive prep, family", culture: "india", kind: "festival" },
  { id: "navratri-2027", start: "2027-09-25", end: "2027-10-09", label: "Navratri and Dussehra (from Sep 30)", angle: "garba nights, dressing up, festive energy", culture: "india", kind: "festival" },
  { id: "diwali-2027", start: "2027-10-14", end: "2027-10-29", label: "Diwali (Oct 29)", angle: "Diwali gifting, cleaning, family visits, looking good in photos", culture: "india", kind: "gifting" },
];

// Moments that come round every week, month or year.
function recurring(date: Date): Moment[] {
  const out: Moment[] = [];
  const day = date.getDay();
  const dom = date.getDate();
  const month = date.getMonth(); // 0 = Jan
  const lastDom = new Date(date.getFullYear(), month + 1, 0).getDate();

  if (day === 1) out.push({ id: "monday", label: "Monday", angle: "Monday blues, back-to-work dread", culture: "any", kind: "everyday" });
  if (day === 5 || day === 6) out.push({ id: "weekend", label: "The weekend", angle: "weekend plans, sleeping in, going out", culture: "any", kind: "everyday" });
  if (dom >= lastDom - 2 || dom <= 3) {
    out.push({ id: "salary-day", label: "Salary day", angle: "salary credited, treat yourself, the money is gone by the 5th", culture: "any", kind: "everyday" });
  } else if (dom >= 20) {
    out.push({ id: "month-end", label: "Month end", angle: "broke till salary day, counting days", culture: "any", kind: "everyday" });
  }
  if (month === 1 || month === 2) out.push({ id: "board-exams", label: "Board exam season", angle: "exam stress, late-night study, parents' pressure", culture: "india", kind: "season" });
  if (month >= 2 && month <= 4) out.push({ id: "ipl", label: "IPL season", angle: "match nights, office cricket talk, snacking", culture: "india", kind: "season" });
  if (month >= 3 && month <= 5) out.push({ id: "summer", label: "Peak summer", angle: "heat, sweat, sunscreen, staying fresh", culture: "india", kind: "season" });
  if (month >= 5 && month <= 8) out.push({ id: "monsoon", label: "Monsoon", angle: "frizzy hair, wet commutes, chai and pakode", culture: "india", kind: "season" });
  if (month === 10 || month === 11 || month === 0) out.push({ id: "wedding-season", label: "Wedding season", angle: "back-to-back shaadis, outfits, looking good in photos", culture: "india", kind: "season" });
  return out;
}

export function momentsOn(date: Date, culture: Culture): Moment[] {
  const t = date.getTime();
  const dated = FESTIVALS.filter((f) => t >= d(f.start).getTime() && t <= d(f.end).getTime() + 86_400_000 - 1);
  return [...dated, ...recurring(date)]
    .filter((m) => m.culture === "any" || m.culture === culture)
    .map(({ id, label, angle, culture: c, kind }) => ({ id, label, angle, culture: c, kind }));
}

// Share of cards tied to a moment. Not all: a feed that's only topical
// feels like a calendar, and the brand's core pain points matter most.
const MOMENT_SHARE = 0.3;

export function pickMoment(date: Date, culture: Culture, giftable: boolean): Moment | null {
  if (Math.random() >= MOMENT_SHARE) return null;
  // Festivals and gifting first: they're the most shareable and time-bound.
  const candidates = momentsOn(date, culture).filter((m) => giftable || m.kind !== "gifting");
  if (candidates.length === 0) return null;
  const ranked = [...candidates].sort((a, b) => rank(b) - rank(a));
  // Mostly the strongest moment, sometimes another, for variety.
  return Math.random() < 0.6 ? ranked[0] : ranked[Math.floor(Math.random() * ranked.length)];
}

const rank = (m: Moment) => ({ festival: 3, gifting: 3, season: 2, everyday: 1 })[m.kind];
