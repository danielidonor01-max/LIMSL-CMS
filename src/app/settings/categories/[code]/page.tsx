// src/app/settings/categories/[code]/page.tsx
// Asset categories moved to /asset-categories; old links still land.
import { redirect } from "next/navigation";

export default async function LegacyCategoryRedirect({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  redirect(`/asset-categories/${encodeURIComponent(code)}`);
}
