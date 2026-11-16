// src/lib/document-register-kinds.ts
// The register's row shape and type names, apart from the builder so the
// page can use them without pulling the database into the browser.
export type RegisterLink = { number: string; href: string };

export type RegisterRow = {
  key: string;
  kind: RegisterKind;
  number: string;
  revision: number | null;
  title: string;
  status: string;
  date: string | null;
  by: string | null;
  href: string;
  /** The numbers this record traces to. */
  tracesTo: RegisterLink[];
  /** A task number the record carries, where it has one (permits). */
  taskNo: string | null;
};

export type RegisterKind =
  | "WORK_ORDER"
  | "BATCH_LINE"
  | "PM_BATCH"
  | "WMS"
  | "JHA"
  | "PERMIT"
  | "CORRECTIVE"
  | "NON_CONFORMITY"
  | "INCIDENT"
  | "CATEGORY_CHANGE";

export const REGISTER_KIND_LABEL: Record<RegisterKind, string> = {
  WORK_ORDER: "Work order",
  BATCH_LINE: "Batch line",
  PM_BATCH: "PM batch",
  WMS: "Method statement",
  JHA: "Hazard analysis",
  PERMIT: "Permit to work",
  CORRECTIVE: "Fault report (CMRF)",
  NON_CONFORMITY: "Non-conformity",
  INCIDENT: "Incident",
  CATEGORY_CHANGE: "Category change",
};
