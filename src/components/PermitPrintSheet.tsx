// src/components/PermitPrintSheet.tsx
// The permit as an A4 sheet, laid out like the pad it replaces.
//
// A printed screenshot of the web page would not be the same document: the
// permit is displayed at the job, signed in the field and filed afterwards, and
// somebody comparing a printout against an older paper permit has to be able to
// read them the same way. So this renders the paper layout, in the paper order,
// and is hidden on screen.
"use client";

import {
  PERMIT_WORK_TYPES,
  REQUIRED_DOCUMENTS,
  WORK_AREA_PRECAUTIONS,
  PPE_REQUIREMENTS,
  type ChecklistMarks,
} from "@/lib/hse/permit-form";
import type { RenewalDay } from "@/lib/hse/permit-validity";

type SignoffStep = {
  roleLabel: string;
  status: string;
  signedByName: string | null;
  signedAt: string | null;
  signatureData: string | null;
};

const parseMarks = (raw: string | null): ChecklistMarks => {
  if (!raw) return {};
  try {
    const p = JSON.parse(raw);
    return p && typeof p === "object" && !Array.isArray(p) ? p : {};
  } catch {
    return {};
  }
};

const parseList = (raw: string | null): string[] => {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
};

// The paper form is marked by hand with a tick or a cross. Reproducing those
// glyphs rather than words keeps a printout and an older paper permit readable
// side by side.
const glyph = (state: string | undefined) =>
  state === "YES" ? "✓" : state === "NO" ? "✗" : state === "NA" ? "N/A" : "";

const dmy = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

function Row({ label, value }: { label: string; value: string }) {
  return (
    <span style={{ marginRight: "14pt", whiteSpace: "nowrap" }}>
      <strong style={{ fontWeight: 600 }}>{label}</strong> {value || "________"}
    </span>
  );
}

export default function PermitPrintSheet({
  permit,
  chain,
  closeout,
}: {
  permit: {
    permitNumber: string;
    taskNo: string | null;
    workTypes: string | null;
    facility: string | null;
    workArea: string | null;
    zoneClassification: string | null;
    workDescription: string;
    startDate: string | null;
    startTime: string | null;
    durationHours: number | null;
    workerCount: number | null;
    permitDepartment: string | null;
    validityDays: number | null;
    documentMarks: string | null;
    precautionMarks: string | null;
    ppeMarks: string | null;
    additionalRequirements: string | null;
    permitHolderName: string | null;
    handbackOutcome: string | null;
    handbackReason: string | null;
    handbackByName: string | null;
    handovers: string | null;
    acceptedByName: string | null;
    acceptedByDept: string | null;
    acceptedAt: string | null;
    closureNote: string | null;
    equipment: { name: string; assetId: string } | null;
    validity: { days: string[]; marks: Record<string, RenewalDay> } | null;
  };
  chain: SignoffStep[];
  closeout: SignoffStep[];
}) {
  const types = parseList(permit.workTypes);
  const docs = parseMarks(permit.documentMarks);
  const precautions = parseMarks(permit.precautionMarks);
  const ppe = parseMarks(permit.ppeMarks);
  const days = permit.validity?.days ?? [];
  const marks = permit.validity?.marks ?? {};

  const handovers: { from: string; to: string }[] = (() => {
    try {
      const p = JSON.parse(permit.handovers ?? "[]");
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  })();

  // The paper form splits the precautions into two stacked blocks; keeping that
  // split means a printout and a paper permit fold the same way.
  const half = Math.ceil(WORK_AREA_PRECAUTIONS.length / 2);

  return (
    <div className="print-only print-sheet">
      {/* Masthead */}
      <table className="print-avoid-break">
        <tbody>
          <tr>
            <td style={{ width: "14%", textAlign: "center" }}>
              <div style={{ fontSize: "7pt" }}>TASK NO</div>
              <div style={{ fontSize: "12pt", fontWeight: 700 }}>{permit.taskNo || ""}</div>
            </td>
            <td style={{ textAlign: "center" }}>
              <div style={{ fontSize: "13pt", fontWeight: 700, letterSpacing: "0.3pt" }}>
                LEE INTERNATIONAL MACHINERY AND SERVICES LTD.
              </div>
              <div style={{ fontSize: "11pt", fontWeight: 700 }}>PERMIT TO WORK</div>
            </td>
            <td style={{ width: "22%" }}>
              <div style={{ fontSize: "7pt" }}>PERMIT NO.</div>
              <div style={{ fontSize: "12pt", fontWeight: 700 }}>{permit.permitNumber}</div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Type of work */}
      <table className="print-avoid-break">
        <tbody>
          <tr>
            {PERMIT_WORK_TYPES.map((t) => (
              <td key={t.value} style={{ textAlign: "center", fontSize: "7.5pt" }}>
                {t.label.toUpperCase()}
                <div style={{ fontSize: "11pt", fontWeight: 700, minHeight: "13pt" }}>
                  {types.includes(t.value) ? "✓" : ""}
                </div>
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      {/* PA block */}
      <table className="print-avoid-break">
        <tbody>
          <tr>
            <td>
              <div style={{ marginBottom: "3pt" }}>
                <Row label="Facility" value={permit.facility ?? ""} />
                <Row label="Work Area" value={permit.workArea ?? ""} />
                <Row label="Zone Classification" value={permit.zoneClassification ?? ""} />
              </div>
              <div style={{ marginBottom: "3pt" }}>
                <strong style={{ fontWeight: 600 }}>Description of work</strong>{" "}
                {permit.workDescription}
                {permit.equipment ? ` (${permit.equipment.assetId}, ${permit.equipment.name})` : ""}
              </div>
              <div style={{ marginBottom: "3pt" }}>
                <Row label="Start Date" value={dmy(permit.startDate)} />
                <Row label="Time" value={permit.startTime ?? ""} />
                <Row label="Duration" value={permit.durationHours ? `${permit.durationHours} hours` : ""} />
                <Row label="No. of Workers" value={permit.workerCount ? String(permit.workerCount) : ""} />
              </div>
              <div>
                <Row label="Permit Department" value={permit.permitDepartment ?? ""} />
                <Row label="Validity Period" value={`${permit.validityDays ?? 7} days`} />
                <Row label="Permit Holder" value={permit.permitHolderName ?? ""} />
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Checklists beside the signature blocks, as on the form */}
      <table className="print-avoid-break">
        <tbody>
          <tr>
            <td style={{ width: "58%" }}>
              <div style={{ fontWeight: 700, textAlign: "center", marginBottom: "2pt" }}>
                REQUIRED DOCUMENT TO BE ATTACHED
              </div>
              <table>
                <tbody>
                  {REQUIRED_DOCUMENTS.map((d) => (
                    <tr key={d.key}>
                      <td style={{ width: "18pt", textAlign: "center", fontWeight: 700 }}>
                        {glyph(docs[d.key])}
                      </td>
                      <td>{d.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ fontWeight: 700, textAlign: "center", margin: "3pt 0 2pt" }}>
                WORK AREA/SAFETY PRECAUTION TO BE TAKEN AT WORK PLACE
              </div>
              <table>
                <tbody>
                  <tr>
                    <td style={{ padding: 0, border: "none" }}>
                      <table>
                        <tbody>
                          {WORK_AREA_PRECAUTIONS.slice(0, half).map((p) => (
                            <tr key={p.key}>
                              <td style={{ width: "18pt", textAlign: "center", fontWeight: 700 }}>
                                {glyph(precautions[p.key])}
                              </td>
                              <td>{p.label}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                    <td style={{ padding: 0, border: "none" }}>
                      <table>
                        <tbody>
                          <tr>
                            <td colSpan={2} style={{ fontWeight: 700, textAlign: "center" }}>
                              PPE REQUIREMENT
                            </td>
                          </tr>
                          {PPE_REQUIREMENTS.map((p) => (
                            <tr key={p.key}>
                              <td style={{ width: "18pt", textAlign: "center", fontWeight: 700 }}>
                                {glyph(ppe[p.key])}
                              </td>
                              <td>{p.label}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>

              <table>
                <tbody>
                  {WORK_AREA_PRECAUTIONS.slice(half).map((p) => (
                    <tr key={p.key}>
                      <td style={{ width: "18pt", textAlign: "center", fontWeight: 700 }}>
                        {glyph(precautions[p.key])}
                      </td>
                      <td>{p.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ marginTop: "3pt", minHeight: "22pt" }}>
                <strong style={{ fontWeight: 600 }}>Additional Requirement</strong>{" "}
                {permit.additionalRequirements ?? ""}
              </div>
            </td>

            {/* Signature blocks */}
            <td style={{ width: "42%", padding: 0 }}>
              <table>
                <tbody>
                  {chain.map((step) => (
                    <tr key={step.roleLabel}>
                      <td style={{ minHeight: "40pt" }}>
                        <div style={{ fontSize: "7.5pt" }}>{step.roleLabel}</div>
                        <div style={{ minHeight: "26pt" }}>
                          {step.signatureData && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={step.signatureData} alt="" style={{ height: "24pt" }} />
                          )}
                        </div>
                        <div style={{ fontSize: "7.5pt" }}>
                          {step.signedByName ?? "Name/Sign/Date"}
                          {step.signedAt ? ` · ${dmy(step.signedAt)}` : ""}
                        </div>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td>
                      <div style={{ fontSize: "7.5pt" }}>Contractor Supervisor (CS)</div>
                      <div style={{ fontWeight: 700, minHeight: "26pt" }}>N/A</div>
                      <div style={{ fontSize: "7pt" }}>Internal work only</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Validity & renewal */}
      <table className="print-avoid-break">
        <tbody>
          <tr>
            <td colSpan={days.length + 1} style={{ fontWeight: 700, textAlign: "center" }}>
              VALIDITY &amp; RENEWAL
            </td>
          </tr>
          <tr>
            <th style={{ width: "40pt", textAlign: "left" }}>DATE</th>
            {days.map((d) => (
              <td key={d} style={{ textAlign: "center" }}>
                {marks[d]?.status === "NOT_WORKED" ? (
                  <span style={{ textDecoration: "line-through" }}>{dmy(d)}</span>
                ) : (
                  dmy(d)
                )}
              </td>
            ))}
          </tr>
          <tr>
            <th style={{ textAlign: "left" }}>TIME</th>
            {days.map((d) => (
              <td key={d} style={{ textAlign: "center" }}>
                {marks[d]?.status === "WORKED" ? marks[d]?.time : ""}
              </td>
            ))}
          </tr>
          <tr>
            <th style={{ textAlign: "left" }}>SIGN</th>
            {days.map((d) => (
              <td key={d} style={{ textAlign: "center", height: "26pt" }}>
                {marks[d]?.status === "WORKED" && marks[d]?.signatureData ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={marks[d]!.signatureData!} alt="" style={{ height: "20pt" }} />
                ) : marks[d]?.status === "NOT_WORKED" ? (
                  "／"
                ) : (
                  ""
                )}
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      {/* Handover, handback and closure */}
      <table className="print-avoid-break">
        <tbody>
          <tr>
            <td style={{ width: "50%" }}>
              <div style={{ fontWeight: 700, textAlign: "center" }}>HANDOVER OF WORK</div>
              <table>
                <tbody>
                  <tr>
                    <th style={{ width: "24pt" }}>S/N</th>
                    <th>NAME</th>
                    <th style={{ width: "24pt" }}>TO</th>
                    <th>NAME</th>
                  </tr>
                  {(handovers.length ? handovers : [null, null, null]).map((h, i) => (
                    <tr key={i} style={{ height: "16pt" }}>
                      <td style={{ textAlign: "center" }}>{i + 1}</td>
                      <td>{h?.from ?? ""}</td>
                      <td style={{ textAlign: "center" }}>{h ? "→" : ""}</td>
                      <td>{h?.to ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </td>
            <td style={{ width: "50%" }}>
              <div style={{ fontWeight: 700, textAlign: "center" }}>HANDBACK OF WORK</div>
              <div style={{ marginTop: "2pt" }}>
                {permit.handbackOutcome === "COMPLETED" ? "✓" : "☐"} The Job is Completed and worksite
                cleared
              </div>
              <div>{permit.handbackOutcome === "SUSPENDED" ? "✓" : "☐"} The Job is suspended</div>
              <div style={{ minHeight: "18pt" }}>
                If not Completed state reason: {permit.handbackReason ?? ""}
              </div>
              <div style={{ fontSize: "7.5pt" }}>Name: {permit.handbackByName ?? "____________"}</div>

              <div style={{ fontWeight: 700, textAlign: "center", marginTop: "4pt" }}>
                WORK ACCEPTANCE CLOSURE OF PERMIT
              </div>
              <div style={{ marginTop: "2pt" }}>Job accepted as stated and PTW Closed</div>
              <div style={{ fontSize: "7.5pt", marginTop: "4pt" }}>
                Name: {permit.acceptedByName ?? "____________"} · Date: {dmy(permit.acceptedAt)} · Dept:{" "}
                {permit.acceptedByDept ?? "______"}
              </div>
              {closeout.length > 0 && (
                <div style={{ marginTop: "3pt", fontSize: "7.5pt" }}>
                  {closeout.map((c) => (
                    <div key={c.roleLabel}>
                      {c.roleLabel}: {c.signedByName ?? "unsigned"}
                      {c.signedAt ? ` · ${dmy(c.signedAt)}` : ""}
                    </div>
                  ))}
                </div>
              )}
            </td>
          </tr>
        </tbody>
      </table>

      {permit.closureNote && (
        <p style={{ fontSize: "7.5pt", marginTop: "3pt" }}>{permit.closureNote}</p>
      )}

      <p style={{ fontSize: "7pt", marginTop: "4pt" }}>
        AC = Affected Custodian, PH = Permit Holder, AHSS = Asset Holder Site Supervisor, AHS = Asset
        Holder Supervisor, PA = Permit Applicant, CS = Contractor Supervisor
      </p>
    </div>
  );
}
