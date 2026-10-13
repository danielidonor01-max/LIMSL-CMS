// src/components/MachineSelect.tsx
// An organised machine selection component designed for LIMSL CMS.
//
// Machines in LIMSL are arranged in categories (e.g. CNC Light Duty, Cranes & Lifting)
// whose collective PM starts on the same scheduled date. This component defaults
// to selecting by category (housing its respective machines), while also offering
// a direct "Specific Machine" option for corrective maintenance or single-asset tasks.
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Layers, Wrench, Check, ChevronDown, Search, CheckSquare, Square, Info } from "lucide-react";
import { EQUIPMENT_CATEGORY_LABELS } from "@/lib/constants";
import Select from "@/components/Select";

export type EquipmentItem = {
  id: string;
  name: string;
  assetId: string;
  category?: string | null;
  location?: string | null;
  status?: string | null;
  criticality?: string | null;
};

export type CategoryOption = {
  code: string;
  label: string;
  machineCount?: number;
  maintenanceFrequency?: string | null;
};

export type MachineSelectProps = {
  /** The currently selected machine ID (single selection) */
  value?: string;
  /** Callback when a single machine is selected */
  onChange?: (equipmentId: string) => void;
  /** The currently selected category code (e.g. "CRANE", "CNC_LIGHT") */
  selectedCategory?: string;
  /** Callback when category changes */
  onCategoryChange?: (categoryCode: string) => void;
  /** Array of selected equipment IDs (multi-selection mode, e.g. for WMS) */
  selectedIds?: string[];
  /** Callback when multi-selection changes */
  onSelectedIdsChange?: (equipmentIds: string[]) => void;
  /** Whether the field allows selecting multiple machines (default false) */
  multiple?: boolean;
  /** Label for the input */
  label?: string;
  /** Required field flag */
  required?: boolean;
  /** Helper text or error message */
  helperText?: string;
  /** Pre-fetched list of equipment items (alias: equipment or equipmentList) */
  equipment?: EquipmentItem[];
  equipmentList?: EquipmentItem[];
  /** Default mode: "category" (default) or "specific" */
  defaultMode?: "category" | "specific";
  allowCategoryWide?: boolean;
  /** Callback when machine location is inferred, e.g. to prefill work area */
  onLocationInferred?: (location: string) => void;
  /** Custom wrapper class */
  className?: string;
};

export default function MachineSelect({
  value = "",
  onChange,
  selectedCategory = "",
  onCategoryChange,
  selectedIds = [],
  onSelectedIdsChange,
  multiple = false,
  label = "Machine / Equipment",
  required = false,
  helperText,
  equipment: propEquipmentAlias,
  equipmentList: propEquipmentList,
  defaultMode = "category",
  allowCategoryWide = true,
  onLocationInferred,
  className = "",
}: MachineSelectProps) {
  const propEquipment = propEquipmentAlias || propEquipmentList;
  const [mode, setMode] = useState<"category" | "specific">(defaultMode);
  const [internalEquipment, setInternalEquipment] = useState<EquipmentItem[]>([]);
  const [categoriesList, setCategoriesList] = useState<CategoryOption[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>(selectedCategory);
  const [searchQuery, setSearchQuery] = useState("");

  // Sync category if prop changes
  useEffect(() => {
    if (selectedCategory) {
      setActiveCategory(selectedCategory);
    }
  }, [selectedCategory]);

  // Load equipment from API if not provided in props
  useEffect(() => {
    if (propEquipment && propEquipment.length > 0) {
      setInternalEquipment(propEquipment);
      return;
    }
    fetch("/api/equipment")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data)) setInternalEquipment(data);
      })
      .catch(() => {});
  }, [propEquipment]);

  // Load categories from API for dynamic labels and counts
  useEffect(() => {
    fetch("/api/asset-categories")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.categories && Array.isArray(data.categories)) {
          setCategoriesList(
            data.categories.map((c: any) => ({
              code: c.code,
              label: c.label,
              machineCount: c.machineCount,
              maintenanceFrequency: c.maintenanceFrequency,
            }))
          );
        }
      })
      .catch(() => {});
  }, []);

  const equipment = useMemo(
    () => (propEquipment && propEquipment.length > 0 ? propEquipment : internalEquipment),
    [propEquipment, internalEquipment]
  );

  // Group equipment by category code
  const categoryGroups = useMemo(() => {
    const groups: Record<string, { label: string; machines: EquipmentItem[] }> = {};

    // Seed with known registered categories
    for (const [code, fallbackLabel] of Object.entries(EQUIPMENT_CATEGORY_LABELS)) {
      const match = categoriesList.find((c) => c.code === code);
      groups[code] = {
        label: match?.label || fallbackLabel,
        machines: [],
      };
    }

    // Populate machines into their categories
    for (const eq of equipment) {
      const catCode = eq.category || "OTHER";
      if (!groups[catCode]) {
        const catMatch = categoriesList.find((c) => c.code === catCode);
        groups[catCode] = {
          label: catMatch?.label || catCode.replace(/_/g, " "),
          machines: [],
        };
      }
      groups[catCode].machines.push(eq);
    }

    return groups;
  }, [equipment, categoriesList]);

  // Options for the Category selector dropdown
  const categoryOptions = useMemo(() => {
    return Object.entries(categoryGroups)
      .map(([code, g]) => ({
        value: code,
        label: `${g.label} (${g.machines.length} machine${g.machines.length === 1 ? "" : "s"})`,
        count: g.machines.length,
      }))
      .filter((o) => o.count > 0 || categoriesList.some((c) => c.code === o.value))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [categoryGroups, categoriesList]);

  // Machines housed in the currently chosen category
  const machinesInCategory = useMemo(() => {
    if (!activeCategory) return [];
    return categoryGroups[activeCategory]?.machines ?? [];
  }, [activeCategory, categoryGroups]);

  // Active machine object if a single machine is selected
  const selectedMachine = useMemo(
    () => equipment.find((e) => e.id === value),
    [equipment, value]
  );

  // If a machine was pre-selected, detect its category
  useEffect(() => {
    if (value && selectedMachine?.category && !activeCategory) {
      setActiveCategory(selectedMachine.category);
    }
  }, [value, selectedMachine, activeCategory]);

  // Handler when user picks a category
  const handleCategoryPick = (catCode: string) => {
    setActiveCategory(catCode);
    if (onCategoryChange) onCategoryChange(catCode);

    if (multiple) {
      // In multi-select (e.g. WMS), picking a category auto-selects its housed machines
      const catMachines = categoryGroups[catCode]?.machines ?? [];
      const newIds = catMachines.map((m) => m.id);
      if (onSelectedIdsChange) onSelectedIdsChange(newIds);
    } else {
      // In single select, if the previously selected machine is not in this category, clear or adjust
      const catMachines = categoryGroups[catCode]?.machines ?? [];
      if (value && !catMachines.some((m) => m.id === value)) {
        if (catMachines.length > 0) {
          const first = catMachines[0];
          if (onChange) onChange(first.id);
          if (onLocationInferred && first.location) onLocationInferred(first.location);
        } else {
          if (onChange) onChange("");
        }
      } else if (!value && catMachines.length > 0) {
        const first = catMachines[0];
        if (onChange) onChange(first.id);
        if (onLocationInferred && first.location) onLocationInferred(first.location);
      }
    }
  };

  // Handler when single machine is selected
  const handleMachineSelect = (mId: string) => {
    if (onChange) onChange(mId);
    const m = equipment.find((e) => e.id === mId);
    if (m) {
      if (m.category && m.category !== activeCategory) {
        setActiveCategory(m.category);
        if (onCategoryChange) onCategoryChange(m.category);
      }
      if (onLocationInferred && m.location) {
        onLocationInferred(m.location);
      }
    }
  };

  // Toggle for multi-selection
  const handleToggleMulti = (mId: string) => {
    if (!onSelectedIdsChange) return;
    const isSelected = selectedIds.includes(mId);
    const updated = isSelected
      ? selectedIds.filter((id) => id !== mId)
      : [...selectedIds, mId];
    onSelectedIdsChange(updated);
  };

  // Select all machines in active category
  const handleSelectAllCategory = () => {
    if (!onSelectedIdsChange) return;
    const catMachineIds = machinesInCategory.map((m) => m.id);
    const combined = Array.from(new Set([...selectedIds, ...catMachineIds]));
    onSelectedIdsChange(combined);
  };

  // Deselect machines in active category
  const handleClearCategory = () => {
    if (!onSelectedIdsChange) return;
    const catMachineIds = new Set(machinesInCategory.map((m) => m.id));
    const filtered = selectedIds.filter((id) => !catMachineIds.has(id));
    onSelectedIdsChange(filtered);
  };

  // Filtered equipment list for "Specific Machine" search
  const filteredSpecificEquipment = useMemo(() => {
    if (!searchQuery.trim()) return equipment;
    const q = searchQuery.toLowerCase();
    return equipment.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.assetId.toLowerCase().includes(q) ||
        (e.location && e.location.toLowerCase().includes(q)) ||
        (e.category && e.category.toLowerCase().includes(q))
    );
  }, [equipment, searchQuery]);

  return (
    <div className={`space-y-3 ${className}`}>
      {/* ── Top Decision Header: Mode Switcher ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <label className="text-sm font-medium text-ink-700 flex items-center gap-1.5">
          {label} {required && <span className="text-danger-600">*</span>}
        </label>

        {/* Organized decision pills */}
        <div className="inline-flex rounded-lg border border-ink-200 bg-ink-100 p-0.5 text-xs self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setMode("category")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors ${
              mode === "category"
                ? "bg-white text-ink-900 font-semibold shadow-card"
                : "text-ink-600 hover:text-ink-900"
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-brand-600" />
            <span>By Category (Default)</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("specific")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors ${
              mode === "specific"
                ? "bg-white text-ink-900 font-semibold shadow-card"
                : "text-ink-600 hover:text-ink-900"
            }`}
          >
            <Wrench className="w-3.5 h-3.5 text-ink-500" />
            <span>Specific Machine</span>
          </button>
        </div>
      </div>

      {/* ── MODE 1: BY CATEGORY (DEFAULT) ── */}
      {mode === "category" && (
        <div className="space-y-3 bg-surface border border-line rounded-xl p-4 shadow-card">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-ink-700">Select Machine Category</span>
              <span className="text-[11px] text-brand-700 flex items-center gap-1">
                <Info className="w-3 h-3" />
                Collectively scheduled PM regime
              </span>
            </div>

            <Select
              value={activeCategory}
              onChange={handleCategoryPick}
              placeholder="Choose a category (e.g. CNC Light Duty, Cranes)…"
              className="w-full"
            >
              <option value="">Select a machine category…</option>
              {categoryOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>

          {activeCategory && (
            <div className="pt-2 border-t border-ink-100 space-y-3">
              {/* Category Housed Machines Information */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <span className="font-semibold text-ink-900">
                    {categoryGroups[activeCategory]?.label || activeCategory}
                  </span>
                  <span className="text-ink-500 ml-1.5">
                    ({machinesInCategory.length} machine{machinesInCategory.length === 1 ? "" : "s"} in this schedule)
                  </span>
                </div>

                {multiple && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAllCategory}
                      className="text-brand-600 hover:underline font-medium text-xs"
                    >
                      Select all in category
                    </button>
                    <span className="text-ink-300">·</span>
                    <button
                      type="button"
                      onClick={handleClearCategory}
                      className="text-ink-500 hover:underline text-xs"
                    >
                      Deselect
                    </button>
                  </div>
                )}
              </div>

              {/* Multi-Select Machines Mode (WMS) */}
              {multiple ? (
                <div className="max-h-56 overflow-y-auto rounded-lg border border-ink-200 bg-ink-50/50 divide-y divide-line">
                  {machinesInCategory.length === 0 ? (
                    <p className="p-3 text-xs text-ink-500">No machines currently registered in this category.</p>
                  ) : (
                    machinesInCategory.map((m) => {
                      const isChecked = selectedIds.includes(m.id);
                      return (
                        <label
                          key={m.id}
                          className={`flex items-start gap-3 p-2.5 cursor-pointer select-none transition-colors ${
                            isChecked ? "bg-brand-50" : "hover:bg-white"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleMulti(m.id)}
                            className="w-4 h-4 mt-0.5 rounded border-ink-300 text-brand-600 accent-brand-600"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-ink-900 truncate">{m.name}</p>
                            <p className="text-xs text-ink-500">
                              {m.assetId} {m.location ? `· ${m.location}` : ""}
                            </p>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              ) : (
                /* Single Machine Select Mode (JHA, Work Order, Permit) */
                <div className="space-y-2">
                  <label className="text-xs font-medium text-ink-600 block">
                    Target Machine in this Category
                  </label>
                  <Select
                    value={value}
                    onChange={handleMachineSelect}
                    placeholder="Select machine from this category…"
                    className="w-full"
                  >
                    {allowCategoryWide && (
                      <option value="">
                        Category Scope (All machines under {categoryGroups[activeCategory]?.label || activeCategory})
                      </option>
                    )}
                    {machinesInCategory.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.assetId} · {m.name} {m.location ? `(${m.location})` : ""}
                      </option>
                    ))}
                  </Select>

                  {/* Quick selection chips for fast tapping */}
                  {machinesInCategory.length > 0 && machinesInCategory.length <= 8 && (
                    <div className="pt-1">
                      <span className="text-[11px] text-ink-400 block mb-1">Quick pick machine:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {machinesInCategory.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => handleMachineSelect(m.id)}
                            className={`px-2 py-1 rounded-lg text-xs border transition-colors ${
                              value === m.id
                                ? "bg-brand-50 border-brand-500 text-brand-700 font-semibold"
                                : "bg-white border-ink-200 text-ink-700 hover:bg-ink-50"
                            }`}
                          >
                            {m.assetId} · {m.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── MODE 2: SPECIFIC MACHINE (FOR CM / DIRECT SELECTION) ── */}
      {mode === "specific" && (
        <div className="space-y-3 bg-surface border border-line rounded-xl p-4 shadow-card">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-ink-700">Search & Select Machine</span>
              <span className="text-[11px] text-ink-500">Individual machine assignment (CM / Breakdown)</span>
            </div>

            {/* Search box to filter large registers */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-ink-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by machine name, asset ID (e.g. LEE/PE/0161), location..."
                className="w-full bg-ink-50 border border-ink-200 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-brand-500"
              />
            </div>

            <Select
              value={value}
              onChange={handleMachineSelect}
              placeholder="Select a specific machine…"
              className="w-full"
            >
              <option value="">Choose machine from register…</option>
              {filteredSpecificEquipment.map((m) => {
                const catLabel =
                  categoryGroups[m.category || "OTHER"]?.label || m.category || "General";
                return (
                  <option key={m.id} value={m.id}>
                    {m.assetId} · {m.name} — [{catLabel}] {m.location ? `(${m.location})` : ""}
                  </option>
                );
              })}
            </Select>
          </div>

          {/* Show summary card if a machine is selected */}
          {selectedMachine && (
            <div className="p-3 bg-ink-50/60 border border-ink-200 rounded-lg flex items-start justify-between gap-3 text-xs">
              <div>
                <p className="font-semibold text-ink-900">{selectedMachine.name}</p>
                <p className="text-ink-600 mt-0.5">
                  Asset ID: <span className="font-medium text-ink-800">{selectedMachine.assetId}</span>
                  {selectedMachine.location && (
                    <span className="ml-2">· Location: {selectedMachine.location}</span>
                  )}
                </p>
                <p className="text-ink-500 mt-1">
                  Category:{" "}
                  <span className="font-medium text-brand-700">
                    {categoryGroups[selectedMachine.category || "OTHER"]?.label || selectedMachine.category || "Unclassified"}
                  </span>
                </p>
              </div>
              <span className="shrink-0 px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200 font-medium text-[11px]">
                {selectedMachine.status || "Operational"}
              </span>
            </div>
          )}
        </div>
      )}

      {helperText && <p className="text-xs text-ink-500">{helperText}</p>}
    </div>
  );
}

export const MachinePicker = MachineSelect;
