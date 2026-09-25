// src/app/equipment/[assetId]/edit/page.tsx
// Editing is a modal on the machine's own page now, opened from there or from
// the register row. This route stays only so links and bookmarks made before
// that still land: it forwards to the page with the editor already open.
import { redirect } from "next/navigation";

export default async function EquipmentEditRedirect({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  const { assetId } = await params;
  redirect(`/equipment/${assetId}?edit=1`);
}
