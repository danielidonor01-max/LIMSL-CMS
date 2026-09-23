// src/lib/db/seed-accounts.ts
// Who a seed creates, and who the prune may remove. Two different questions,
// and answering them with one list was a bug.

// ── What a fresh database starts with ───────────────────────────────────────
// Two Super Admins and nobody else. Everybody who actually works at LIMSL is
// added through the user admin screen, where they choose their own password and
// an audit row records who created the account.
export type SeedAccount = {
  name: string;
  email: string;
  role: string;
  department: string;
  jobTitle: string;
  whatsapp: string;
};

export const SEED_ACCOUNTS: SeedAccount[] = [
  {
    name: "Daniel Idonor",
    email: "daniel.idonor@limsl.com",
    role: "SUPER_ADMIN",
    department: "MANAGEMENT",
    jobTitle: "Super Admin",
    whatsapp: "+2349167653581",
  },
  {
    name: "Daniel Idonor",
    email: "danielidonor01@gmail.com",
    role: "SUPER_ADMIN",
    department: "MANAGEMENT",
    jobTitle: "Super Admin",
    whatsapp: "+2349167653581",
  },
];

// ── What the prune may remove ───────────────────────────────────────────────
// A DENY-list, and that is the whole point of splitting this file in two.
//
// The prune was written the other way round: keep these, remove everything
// else. That is correct exactly once — the day it is written, against the
// database it was written for. Every real person added afterwards through the
// user admin screen is "everything else", so a later run deletes the staff
// LIMSL has hired. Silently, and all of them.
//
// It nearly went wrong twice already. The keep-list was first taken from the
// seed file, which did not contain the account actually signed in with, so a
// run would have deactivated the only enabled Super Admin in production. And
// Ajayi Oluwadamilola holds a real account that no seed creates.
//
// So the prune names its targets instead. These nine addresses are the demo
// staff the seeds invented to make the screens look populated during the
// build — a Foreman, a QA/QC officer, an HSE officer, two technicians, a
// Factory Manager, a COO and a build-time tester. Nothing else is ever a
// candidate, whoever adds it and whenever.
export const DEMO_ACCOUNTS = [
  "kingsley.iworah@limsl.com",
  "marcel.imadojiemu@limsl.com",
  "godspower.michael@limsl.com",
  "kenneth.aloziem@limsl.com",
  "osaghale.ikpea@limsl.com",
  "sunday.okoro@limsl.com",
  "blessing.ade@limsl.com",
  "tunde.bello@limsl.com",
  // Carries the name "System Tester" in production: a build-time account,
  // not a person.
  "dsmartfootwears@gmail.com",
].map((e) => e.toLowerCase());

// Compared lower-cased, because an address typed into the user admin screen
// with a capital letter is the same account.
const norm = (email: string | null | undefined) => (email ?? "").trim().toLowerCase();

export const isSeedAccount = (email: string | null | undefined) =>
  SEED_ACCOUNTS.some((a) => norm(a.email) === norm(email));

// Belt and braces: a seeded Super Admin can never also be a prune target, even
// if an address is one day added to both lists by mistake.
export const isPrunable = (email: string | null | undefined) =>
  DEMO_ACCOUNTS.includes(norm(email)) && !isSeedAccount(email);
