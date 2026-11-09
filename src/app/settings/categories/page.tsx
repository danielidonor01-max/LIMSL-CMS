// src/app/settings/categories/page.tsx
// Asset categories moved to /asset-categories. Sign-off notifications already
// sent point here, with ?change= naming the proposal, so the query is carried.
import { redirect } from "next/navigation";

export default async function LegacyCategoriesRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const change = typeof sp.change === "string" ? sp.change : null;
  redirect(change ? `/asset-categories?change=${encodeURIComponent(change)}` : "/asset-categories");
}
