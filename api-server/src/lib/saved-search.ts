import { sql } from "drizzle-orm";
import { db, savedSearchesTable, type Listing } from "@workspace/db";
import { createNotification } from "./dalal";

interface SearchParams {
  q?: string;
  city?: string;
  category?: string;
  type?: string;
  minPrice?: string;
  maxPrice?: string;
  minSize?: string;
  maxSize?: string;
  ownershipType?: string;
  dealType?: string;
}

function listingMatches(p: SearchParams, l: Listing): boolean {
  if (p.q && !l.title.includes(p.q)) return false;
  if (p.city && l.city !== p.city) return false;
  if (p.category && l.category !== p.category) return false;
  if (p.type && l.type !== p.type) return false;
  if (p.ownershipType && l.ownershipType !== p.ownershipType) return false;
  if (p.dealType && l.dealType !== p.dealType) return false;
  if (p.minPrice && l.price < parseFloat(p.minPrice)) return false;
  if (p.maxPrice && l.price > parseFloat(p.maxPrice)) return false;
  if (p.minSize && (l.size == null || l.size < parseFloat(p.minSize))) return false;
  if (p.maxSize && (l.size == null || l.size > parseFloat(p.maxSize))) return false;
  return true;
}

// Notify users whose saved searches match a freshly-published listing.
// Best-effort: failures must never block listing creation.
export async function notifySavedSearchMatches(listing: Listing): Promise<void> {
  const searches = await db
    .select()
    .from(savedSearchesTable)
    .where(sql`${savedSearchesTable.userId} <> ${listing.userId}`)
    .limit(2000);

  const notified = new Set<string>();
  for (const s of searches) {
    if (notified.has(s.userId)) continue;
    let params: SearchParams;
    try {
      params = JSON.parse(s.params);
    } catch {
      continue;
    }
    if (listingMatches(params, listing)) {
      notified.add(s.userId);
      await createNotification({
        userId: s.userId,
        type: "saved_search",
        title: "إعلان جديد يطابق بحثك المحفوظ 🔔",
        body: `${listing.title} — ${listing.city}`,
        link: `/listings/${listing.id}`,
      });
    }
  }
}
