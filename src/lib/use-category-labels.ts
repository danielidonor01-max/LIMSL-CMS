// src/lib/use-category-labels.ts
// Category names as the register holds them.
//
// Categories used to be a fixed list in constants.ts. They are managed in
// Settings now, so a category added there ("Excavation Devices") has to read
// as its name on every screen, not as EXCAVATION_DEVICES. The built-in names
// stay underneath as the fallback, so nothing shows a raw code while the list
// is loading or before the categories table exists.
"use client";

import { EQUIPMENT_CATEGORY_LABELS } from "@/lib/constants";
import { useApi } from "@/lib/api-cache";

export function useCategoryLabels(): Record<string, string> {
  const { data } = useApi<{ categories: { code: string; label: string }[] }>("/api/asset-categories", {
    categories: [],
  });
  const map: Record<string, string> = { ...EQUIPMENT_CATEGORY_LABELS };
  for (const c of data?.categories ?? []) map[c.code] = c.label;
  return map;
}
