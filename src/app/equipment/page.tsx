// src/app/equipment/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Layers,
  Search,
  ArrowUpDown,
  MapPin,
  ArrowLeft,
  QrCode,
  Loader2,
} from "lucide-react";

export default function EquipmentList() {
  const [equipmentList, setEquipmentList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortField, setSortField] = useState("name");
  const [sortDirection, setSortDirection] = useState("asc");

  // Fetch real seeded equipment list on mount
  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch("/api/equipment");
        if (res.ok) {
          const data = await res.json();
          setEquipmentList(data);
        }
      } catch (err) {
        console.error("Error loading equipment from DB:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Filtering
  const filteredEquipment = equipmentList.filter((eq) => {
    const matchesSearch =
      (eq.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (eq.assetId || "").toLowerCase().includes(search.toLowerCase()) ||
      (eq.oem || "").toLowerCase().includes(search.toLowerCase());

    const matchesCategory = categoryFilter === "ALL" || eq.category === categoryFilter;
    const matchesStatus = statusFilter === "ALL" || eq.status === statusFilter;

    return matchesSearch && matchesCategory && matchesStatus;
  });

  // Sorting
  const sortedEquipment = [...filteredEquipment].sort((a: any, b: any) => {
    let fieldA = (a[sortField] || "").toString().toLowerCase();
    let fieldB = (b[sortField] || "").toString().toLowerCase();

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

  const categories = [
    "ALL",
    "CNC_HEAVY",
    "PRESS_ROLL_SHEAR",
    "WELDING",
    "CRANE",
    "CNC_LIGHT",
    "MEASURING",
    "OTHER",
  ];
  const statuses = [
    "ALL",
    "OPERATIONAL",
    "UNDER_MAINTENANCE",
    "BROKEN_DOWN",
    "AWAITING_PARTS",
    "DECOMMISSIONED",
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 transition-all">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
            <Layers className="w-4.5 h-4.5 text-slate-950 font-bold" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">Equipment Registry</h1>
            <p className="text-[10px] text-emerald-600 font-mono tracking-wider uppercase">Digital Twins Database</p>
          </div>
        </div>

        <Link
          href="/equipment/new"
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-lg text-xs font-bold transition-all shadow-md shadow-emerald-950/20"
        >
          + Add New Equipment
        </Link>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        {/* Filters Panel */}
        <div className="p-4 bg-white border border-slate-200 rounded-xl flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:max-w-xs">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search by name, tag ID, or OEM..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg py-2 pl-10 pr-4 text-xs placeholder-slate-500 focus:outline-none transition-all"
            />
          </div>

          <div className="flex flex-wrap gap-3 w-full md:w-auto justify-end">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-slate-500 uppercase">Category:</span>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-slate-100 border border-slate-200 rounded-lg p-2 text-xs focus:outline-none text-slate-600"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat.replace("_", " ")}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-slate-500 uppercase">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-100 border border-slate-200 rounded-lg p-2 text-xs focus:outline-none text-slate-600"
              >
                {statuses.map((stat) => (
                  <option key={stat} value={stat}>
                    {stat.replace("_", " ")}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xl">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-500 gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
              <p className="text-xs font-mono">Loading Sealed Assets Twin Database...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold select-none">
                    <th className="py-3.5 px-4 cursor-pointer hover:text-slate-900" onClick={() => handleSort("name")}>
                      <div className="flex items-center gap-1">
                        Equipment Name <ArrowUpDown className="w-3.5 h-3.5" />
                      </div>
                    </th>
                    <th className="py-3.5 px-4 cursor-pointer hover:text-slate-900" onClick={() => handleSort("assetId")}>
                      <div className="flex items-center gap-1">
                        Asset Tag ID <ArrowUpDown className="w-3.5 h-3.5" />
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
                  {sortedEquipment.length > 0 ? (
                    sortedEquipment.map((eq) => {
                      const isBroken = eq.status === "BROKEN_DOWN";
                      const isMaintenance = eq.status === "UNDER_MAINTENANCE";
                      const urlParam = (eq.assetId || "").replace(/\//g, "-");
                      return (
                        <tr key={eq.id} className="hover:bg-slate-50 text-slate-600 transition-colors">
                          <td className="py-3.5 px-4 font-semibold text-slate-900">{eq.name}</td>
                          <td className="py-3.5 px-4 font-mono text-slate-500">{eq.assetId}</td>
                          <td className="py-3.5 px-4 text-[10px] uppercase font-mono">{eq.category.replace("_", " ")}</td>
                          <td className="py-3.5 px-4">{eq.oem || "N/A"}</td>
                          <td className="py-3.5 px-4 flex items-center gap-1 text-slate-500">
                            <MapPin className="w-3 h-3 text-emerald-500" /> {eq.location || "Workshop"}
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[9px] font-semibold border ${
                                isBroken
                                  ? "bg-rose-500/10 text-rose-600 border-rose-500/20"
                                  : isMaintenance
                                  ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                                  : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                              }`}
                            >
                              {eq.status.replace("_", " ")}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-semibold text-[10px]">
                            <span
                              className={`px-1.5 py-0.5 rounded ${
                                eq.criticality === "HIGH"
                                  ? "bg-rose-950/40 text-rose-700 border border-rose-900/40"
                                  : eq.criticality === "MEDIUM"
                                  ? "bg-amber-950/40 text-amber-700 border border-amber-900/40"
                                  : "bg-slate-100 text-slate-500 border border-slate-200"
                              }`}
                            >
                              {eq.criticality || "MEDIUM"}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex gap-2 justify-end">
                              <Link
                                href={`/equipment/${urlParam}`}
                                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-200 rounded transition-all text-[11px]"
                              >
                                Digital Twin
                              </Link>
                              <Link
                                href={`/equipment/qr/${urlParam}`}
                                className="p-1.5 hover:bg-slate-200 text-emerald-600 hover:text-emerald-700 rounded border border-slate-200 hover:border-slate-200 transition-all"
                                title="Print QR Code"
                              >
                                <QrCode className="w-4 h-4" />
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-500">
                        No machinery matches your search filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white/90 py-4 px-6 text-center text-[10px] text-slate-500 font-mono">
        &copy; {new Date().getFullYear()} Lee International Machinery and Services Limited. | Digital Twins Database.
      </footer>
    </div>
  );
}
