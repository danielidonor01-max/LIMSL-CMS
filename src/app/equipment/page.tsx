// src/app/equipment/page.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Layers,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  QrCode,
  Eye,
  History,
  Pencil,
  Plus,
  Stethoscope,
  AlertTriangle,
  Download,
} from "lucide-react";
import KebabMenu from "@/components/KebabMenu";
import Button from "@/components/Button";
import Select from "@/components/Select";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import { Badge } from "@/components/Badge";
import { useApi } from "@/lib/api-cache";
import {
  EQUIPMENT_CATEGORY_LABELS,
  EQUIPMENT_STATUS_LABELS,
  EQUIPMENT_STATUS_BADGE,
  CRITICALITY_BADGE,
  CRITICALITY_SHORT,
} from "@/lib/constants";
import { parseAssetId, ASSET_PREFIX_META, type AssetPrefix } from "@/lib/asset-id";
import { downloadCSV } from "@/lib/export";
import LoadError from "@/components/LoadError";

// An asset in one of these states is not doing its job. The register's whole
// purpose is answering "what needs me today", which the old flat list buried.
const NEEDS_ATTENTION = new Set(["BROKEN_DOWN", "AWAITING_PARTS", "UNDER_MAINTENANCE"]);

type TypeTab = "ALL" | AssetPrefix;

export default function EquipmentList() {
  const { data: equipmentList, loading, error, refresh } = useApi<any[]>("/api/equipment", []);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [typeTab, setTypeTab] = useState<TypeTab>("ALL");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [sortField, setSortField] = useState("name");
  const [sortDirection, setSortDirection] = useState("asc");

  const filtersActive =
    search.trim() !== "" ||
    categoryFilter !== "ALL" ||
    statusFilter !== "ALL" ||
    typeTab !== "ALL" ||
    attentionOnly;
  const clearFilters = () => {
    setSearch("");
    setCategoryFilter("ALL");
    setStatusFilter("ALL");
    setTypeTab("ALL");
    setAttentionOnly(false);
  };

  const prefixOf = (eq: any): AssetPrefix => parseAssetId(eq.assetId)?.prefix ?? "PE";

  const counts = useMemo(() => {
    let pe = 0;
    let sys = 0;
    let attention = 0;
    for (const eq of equipmentList) {
      if (prefixOf(eq) === "SYS") sys++;
      else pe++;
      if (NEEDS_ATTENTION.has(eq.status)) attention++;
    }
    return { pe, sys, attention, total: equipmentList.length };
  }, [equipmentList]);

  const filteredEquipment = equipmentList.filter((eq) => {
    const term = search.toLowerCase();
    const matchesSearch =
      (eq.name || "").toLowerCase().includes(term) ||
      (eq.assetId || "").toLowerCase().includes(term) ||
      (eq.serialNumber || "").toLowerCase().includes(term) ||
      (eq.oem || "").toLowerCase().includes(term);

    const matchesCategory = categoryFilter === "ALL" || eq.category === categoryFilter;
    const matchesStatus = statusFilter === "ALL" || eq.status === statusFilter;
    const matchesType = typeTab === "ALL" || prefixOf(eq) === typeTab;
    const matchesAttention = !attentionOnly || NEEDS_ATTENTION.has(eq.status);

    return matchesSearch && matchesCategory && matchesStatus && matchesType && matchesAttention;
  });

  const sortedEquipment = [...filteredEquipment].sort((a: any, b: any) => {
    const fieldA = (a[sortField] || "").toString().toLowerCase();
    const fieldB = (b[sortField] || "").toString().toLowerCase();
    if (fieldA < fieldB) return sortDirection === "asc" ? -1 : 1;
    if (fieldA > fieldB) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const exportCsv = () => {
    downloadCSV(
      `asset-register-${new Date().toISOString().slice(0, 10)}`,
      sortedEquipment.map((eq) => ({
        "Asset ID": eq.assetId,
        Name: eq.name,
        Type: prefixOf(eq),
        Category: EQUIPMENT_CATEGORY_LABELS[eq.category] ?? eq.category,
        "OEM / Vendor": eq.oem || "",
        Model: eq.model || "",
        "Serial Number": eq.serialNumber || "",
        Location: eq.location || "",
        Status: EQUIPMENT_STATUS_LABELS[eq.status] ?? eq.status,
        Criticality: CRITICALITY_SHORT[eq.criticality] ?? eq.criticality ?? "",
        "Service Interval": eq.maintenanceFrequency || "",
        Commissioned: eq.commissioningDate || "",
      })),
    );
  };

  // Derive the category filter from the categories actually present, so it always
  // covers the real data (the old hardcoded list missed several categories).
  const categories = [
    "ALL",
    ...Array.from(new Set(equipmentList.map((e) => e.category).filter(Boolean))).sort((a, b) =>
      (EQUIPMENT_CATEGORY_LABELS[a] ?? a).localeCompare(EQUIPMENT_CATEGORY_LABELS[b] ?? b),
    ),
  ];
  const statuses = ["ALL", ...Object.keys(EQUIPMENT_STATUS_LABELS)];
  const catLabel = (c: string) =>
    c === "ALL" ? "All categories" : EQUIPMENT_CATEGORY_LABELS[c] ?? c.replaceAll("_", " ");
  const statusLabel = (s: string) =>
    s === "ALL" ? "All statuses" : EQUIPMENT_STATUS_LABELS[s] ?? s.replaceAll("_", " ");

  const SortIcon = ({ field }: { field: string }) =>
    sortField !== field ? (
      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
    ) : sortDirection === "asc" ? (
      <ArrowUp className="w-3.5 h-3.5 text-emerald-600" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-emerald-600" />
    );

  const rowActions = (eq: any) => {
    const urlParam = (eq.assetId || "").replace(/\//g, "-");
    return [
      { label: "Digital Twin", icon: Eye, href: `/equipment/${urlParam}` },
      // The diagnostic engine was reachable only via a banner on the twin page,       // the most valuable feature in the product, effectively hidden.
      { label: "Troubleshoot", icon: Stethoscope, href: `/equipment/${urlParam}/troubleshoot` },
      { label: "Report Fault", icon: AlertTriangle, href: `/corrective/new?equipmentId=${eq.id}`, danger: true },
      { label: "History Log", icon: History, href: `/equipment/${urlParam}/history` },
      { label: "Edit", icon: Pencil, href: `/equipment/${urlParam}/edit` },
      { label: "Print QR Code", icon: QrCode, href: `/equipment/qr/${urlParam}` },
    ];
  };

  const emptyState = filtersActive ? (
    <EmptyState
      icon={Search}
      title="Nothing matches these filters"
      message="No asset on the register matches the current search, type, category and status."
      actionLabel="Clear filters"
      onAction={clearFilters}
    />
  ) : (
    <EmptyState
      icon={Layers}
      title="No assets registered yet"
      message="The register is empty. Add your first machine or facility system to start raising work orders against it."
      actionLabel="Add an asset"
      actionHref="/equipment/new"
    />
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto space-y-5">
        <PageHeader
          icon={Layers}
          title="Asset Register"
          subtitle={
            loading
              ? "Every machine and facility system, with status, criticality and location"
              : `${counts.total} asset${counts.total === 1 ? "" : "s"}, ${counts.pe} production, ${counts.sys} facility system${counts.sys === 1 ? "" : "s"}`
          }
          backHref="/"
          backLabel="Dashboard"
          actions={
            <>
              <Button variant="secondary" icon={Download} onClick={exportCsv} disabled={!sortedEquipment.length}>
                Export
              </Button>
              <Button href="/equipment/new" icon={Plus}>
                Add Asset
              </Button>
            </>
          }
        />

        {/* Type segment + the question the register exists to answer */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex gap-1 bg-slate-100 border border-slate-200 rounded-lg p-1 w-fit">
            {(["ALL", "PE", "SYS"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTypeTab(t)}
                title={t === "ALL" ? undefined : ASSET_PREFIX_META[t].help}
                className={`px-3 min-h-9 rounded-md text-xs font-semibold transition-all ${
                  typeTab === t ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {t === "ALL" ? `All (${counts.total})` : t === "PE" ? `Machines (${counts.pe})` : `Systems (${counts.sys})`}
              </button>
            ))}
          </div>

          <button
            onClick={() => setAttentionOnly((v) => !v)}
            aria-pressed={attentionOnly}
            className={`inline-flex items-center gap-2 px-3 min-h-9 rounded-lg border text-xs font-semibold transition-colors w-fit ${
              attentionOnly
                ? "bg-rose-50 border-rose-300 text-rose-700"
                : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            Needs attention
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] ${
                counts.attention ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-500"
              }`}
            >
              {counts.attention}
            </span>
          </button>
        </div>

        {/* Filters */}
        <div className="p-4 bg-white border border-slate-200 rounded-xl flex flex-col md:flex-row gap-3 md:items-center justify-between">
          <div className="relative w-full md:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search name, asset ID, serial or OEM…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg min-h-11 pl-10 pr-4 text-sm placeholder-slate-500 focus:outline-none transition-all"
            />
          </div>

          <div className="flex flex-wrap gap-3 w-full md:w-auto md:justify-end">
            <Select value={categoryFilter} onChange={setCategoryFilter} className="flex-1 md:flex-none">
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {catLabel(cat)}
                </option>
              ))}
            </Select>
            <Select value={statusFilter} onChange={setStatusFilter} className="flex-1 md:flex-none">
              {statuses.map((stat) => (
                <option key={stat} value={stat}>
                  {statusLabel(stat)}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {error && !loading ? (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <LoadError what="the asset register" onRetry={refresh} />
          </div>
        ) : loading ? (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <TableSkeleton rows={8} cols={7} />
          </div>
        ) : !sortedEquipment.length ? (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">{emptyState}</div>
        ) : (
          <>
            {/* Mobile, the register was table-only, unusable on the floor */}
            <div className="grid gap-3 md:hidden">
              {sortedEquipment.map((eq) => {
                const urlParam = (eq.assetId || "").replace(/\//g, "-");
                return (
                  <div key={eq.id} data-list-card className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/equipment/${urlParam}`} className="min-w-0">
                        <p className="font-semibold text-slate-900 text-sm leading-snug">{eq.name}</p>
                        <p className="font-mono text-[11px] text-slate-500 mt-0.5">{eq.assetId}</p>
                      </Link>
                      <KebabMenu ariaLabel={`Actions for ${eq.name}`} items={rowActions(eq)} />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-3">
                      <Badge className={EQUIPMENT_STATUS_BADGE[eq.status]}>
                        {EQUIPMENT_STATUS_LABELS[eq.status] ?? eq.status}
                      </Badge>
                      <Badge className={CRITICALITY_BADGE[eq.criticality] ?? CRITICALITY_BADGE.MEDIUM}>
                        {CRITICALITY_SHORT[eq.criticality] ?? "Medium"}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2.5">
                      {EQUIPMENT_CATEGORY_LABELS[eq.category] ?? eq.category} · {eq.location || "-"}
                      {eq.oem ? ` · ${eq.oem}` : ""}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Desktop */}
            <div className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold select-none">
                      <th className="py-3.5 px-4 cursor-pointer hover:text-slate-900" onClick={() => handleSort("name")}>
                        <div className="flex items-center gap-1">
                          Name <SortIcon field="name" />
                        </div>
                      </th>
                      <th className="py-3.5 px-4 cursor-pointer hover:text-slate-900" onClick={() => handleSort("assetId")}>
                        <div className="flex items-center gap-1">
                          Asset ID <SortIcon field="assetId" />
                        </div>
                      </th>
                      <th className="py-3.5 px-4">Category</th>
                      <th className="py-3.5 px-4">OEM / Vendor</th>
                      <th className="py-3.5 px-4">Location</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4">Criticality</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {sortedEquipment.map((eq) => {
                      const urlParam = (eq.assetId || "").replace(/\//g, "-");
                      return (
                        <tr key={eq.id} className="hover:bg-slate-50 text-slate-600 transition-colors">
                          <td className="py-3.5 px-4 font-semibold text-slate-900">
                            <Link href={`/equipment/${urlParam}`} className="hover:text-emerald-600">
                              {eq.name}
                            </Link>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-slate-500">{eq.assetId}</td>
                          <td className="py-3.5 px-4">
                            {EQUIPMENT_CATEGORY_LABELS[eq.category] ?? eq.category?.replaceAll("_", " ")}
                          </td>
                          <td className="py-3.5 px-4">{eq.oem || "-"}</td>
                          <td className="py-3.5 px-4 text-slate-500">{eq.location || "-"}</td>
                          <td className="py-3.5 px-4">
                            <Badge className={EQUIPMENT_STATUS_BADGE[eq.status]}>
                              {EQUIPMENT_STATUS_LABELS[eq.status] ?? eq.status}
                            </Badge>
                          </td>
                          <td className="py-3.5 px-4">
                            <Badge className={CRITICALITY_BADGE[eq.criticality] ?? CRITICALITY_BADGE.MEDIUM}>
                              {CRITICALITY_SHORT[eq.criticality] ?? "Medium"}
                            </Badge>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex justify-end">
                              <KebabMenu ariaLabel={`Actions for ${eq.name}`} items={rowActions(eq)} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
