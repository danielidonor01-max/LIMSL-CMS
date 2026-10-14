// src/app/equipment/categories/[code]/page.tsx
// Seamlessly routes to the Category Digital Twin
import { redirect } from "next/navigation";

export default async function EquipmentCategoryRedirect({
  params,
}: {
  params: Promise<{ code: string }> | { code: string };
}) {
  const resolved = await params;
  redirect(`/settings/categories/${encodeURIComponent(resolved.code)}`);
}
