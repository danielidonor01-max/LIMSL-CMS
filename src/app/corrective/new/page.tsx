// src/app/corrective/new/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";
import Select from "@/components/Select";
import Button from "@/components/Button";
import PageHeader from "@/components/PageHeader";
import Field, { FIELD_CLASS } from "@/components/Field";

export default function NewCorrectiveRequest() {
  const router = useRouter();
  const [equipmentList, setEquipmentList] = useState<any[]>([]);
  const [loadingEq, setLoadingEq] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form states
  const [equipmentId, setEquipmentId] = useState("");
  const [faultType, setFaultType] = useState("UNKNOWN");
  const [urgency, setUrgency] = useState("MEDIUM");
  const [faultDescription, setFaultDescription] = useState("");
  const [operatingStatusAtFailure, setOperatingStatusAtFailure] = useState("RUNNING");
  const [observedFault, setObservedFault] = useState("");
  const [errorCodes, setErrorCodes] = useState("");
  const [environmentalCondition, setEnvironmentalCondition] = useState("");

  useEffect(() => {
    async function loadEquipment() {
      try {
        const res = await fetch("/api/equipment");
        if (res.ok) {
          const data = await res.json();
          setEquipmentList(data);
          // Deep links (?equipmentId=…) from the twin / dashboard / QR flow
          // preselect the machine you're standing at — no re-picking.
          const wanted = new URLSearchParams(window.location.search).get("equipmentId");
          const match = wanted && data.find((e: { id: string; assetId?: string }) => e.id === wanted || e.assetId === wanted.replace(/-/g, "/"));
          if (match) setEquipmentId(match.id);
          else if (data.length > 0) setEquipmentId(data[0].id);
        }
      } catch (err) {
        console.error("Failed to load machinery list:", err);
      } finally {
        setLoadingEq(false);
      }
    }
    loadEquipment();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!equipmentId) return;

    setSaving(true);
    try {
      const res = await fetch("/api/corrective", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          equipmentId,
          faultType,
          urgency,
          faultDescription,
          operatingStatusAtFailure,
          observedFault,
          errorCodes,
          environmentalCondition,
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Couldn't log the fault — check your connection and try again.");
        return;
      }
      toast.success("Fault logged. Maintenance leadership and HSE have been notified.");
      router.push("/corrective");
    } catch {
      // On workshop wifi a dropped request used to look exactly like success.
      toast.error("Couldn't log the fault — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const faultTypes = [
    { value: "ELECTRICAL", label: "Electrical" },
    { value: "MECHANICAL", label: "Mechanical" },
    { value: "HYDRAULIC", label: "Hydraulic" },
    { value: "PNEUMATIC", label: "Pneumatic" },
    { value: "CONTROL", label: "Control / PLC" },
    { value: "STRUCTURAL", label: "Structural" },
    { value: "SAFETY", label: "Safety Device" },
    { value: "UNKNOWN", label: "Unknown / Intermittent" },
  ];

  const urgencies = [
    { value: "CRITICAL", label: "Critical (Stops production)" },
    { value: "HIGH", label: "High (Major impact)" },
    { value: "MEDIUM", label: "Medium" },
    { value: "LOW", label: "Low" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <main className="flex-1 p-6 max-w-2xl w-full mx-auto space-y-6">
        <PageHeader
          icon={AlertTriangle}
          tone="rose"
          title="Report a Machinery Fault"
          subtitle="Raise a corrective maintenance request against a machine"
          code="LIMSL-MAIN-015"
          backHref="/corrective"
          backLabel="Corrective Maintenance"
        />
        <form onSubmit={handleSubmit} className="p-6 bg-white border border-slate-200 rounded-xl space-y-6">
          <h2 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-3 uppercase tracking-wide">
            Corrective Maintenance Request Form
          </h2>

          {/* Machine Selection */}
          <Field label="Select Broken Equipment" required>
            {loadingEq ? (
              <div className="flex items-center text-xs text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin text-rose-600 mr-2" /> Loading equipment list…
              </div>
            ) : (
              <Select
                value={equipmentId}
                onChange={(v) => setEquipmentId(v)}
                className="w-full"
                required
              >
                {equipmentList.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.assetId} - {eq.name} ({eq.location})
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Fault Nature */}
            <Field label="Nature of Fault">
              <Select
                value={faultType}
                onChange={(v) => setFaultType(v)}
                className="w-full"
              >
                {faultTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </Select>
            </Field>

            {/* Urgency */}
            <Field label="Urgency Level">
              <Select
                value={urgency}
                onChange={(v) => setUrgency(v)}
                className="w-full"
              >
                {urgencies.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {/* Fault Description */}
          <Field label="Fault Description / Observed Symptom" htmlFor="fault-description" required>
            <textarea
              id="fault-description"
              placeholder="Describe the noise, vibration, failed startup sequence, burnt smell, or error codes observed..."
              value={faultDescription}
              onChange={(e) => setFaultDescription(e.target.value)}
              className={`${FIELD_CLASS} h-24 resize-none`}
              required
            />
          </Field>

          {/* Additional details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Field label="Operating Status at Failure">
              <Select
                value={operatingStatusAtFailure}
                onChange={(v) => setOperatingStatusAtFailure(v)}
                className="w-full"
              >
                <option value="RUNNING">Running</option>
                <option value="IDLE">Idle</option>
                <option value="STARTUP">Startup Sequence</option>
                <option value="SHUTDOWN">Shutdown Sequence</option>
              </Select>
            </Field>

            <Field label="Error Codes (if any)" htmlFor="error-codes">
              <input
                id="error-codes"
                type="text"
                placeholder="e.g. E-041, Spindle Overload"
                value={errorCodes}
                onChange={(e) => setErrorCodes(e.target.value)}
                className={FIELD_CLASS}
              />
            </Field>
          </div>

          <Field label="Environmental / Load Conditions" htmlFor="environmental-condition">
            <input
              id="environmental-condition"
              type="text"
              placeholder="e.g. 35°C Room Temp, 80% Max Machine Load"
              value={environmentalCondition}
              onChange={(e) => setEnvironmentalCondition(e.target.value)}
              className={FIELD_CLASS}
            />
          </Field>

          {/* Form Actions */}
          <div className="flex gap-3 justify-end pt-3">
            <Button variant="secondary" href="/corrective">
              Cancel
            </Button>
            <Button variant="danger" type="submit" disabled={saving} loading={saving}>
              Submit Request
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
