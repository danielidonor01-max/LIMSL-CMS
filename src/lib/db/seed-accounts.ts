// src/lib/db/seed-accounts.ts
// The only accounts a seed is allowed to create.
//
// Everybody else — the demo Foreman, QA/QC officer, HSE officer, two
// technicians, the Factory Manager and the COO — was invented to make the
// screens look populated during the build. They carried a password that is
// committed to this repository, they hold real roles in a system where a role
// decides who may sign a permit, and they are indistinguishable in the user
// register from somebody who actually works at LIMSL. That is an access-control
// finding waiting to be written up, and it is the reason this list is short.
//
// It lives in its own module because two things need it and they must never
// disagree: the seed, which creates these accounts, and the prune, which keeps
// them while removing everything else. A second copy of the list is a day when
// the prune deletes an account the seed just made.
export type SeedAccount = {
  name: string;
  email: string;
  role: string;
  department: string;
  jobTitle: string;
  whatsapp: string;
};

export const FOUNDING_ACCOUNTS: SeedAccount[] = [
  {
    name: "Daniel Idonor",
    email: "daniel.idonor@limsl.com",
    role: "SUPER_ADMIN",
    department: "MANAGEMENT",
    jobTitle: "Super Admin",
    whatsapp: "+2349167653581",
  },
  {
    // The account actually signed in with. It was NOT on this list when the
    // list was written from the seed file, and the seed is not the authority
    // on who works here — the live table is. A prune built from the seed alone
    // would have deactivated the only enabled Super Admin in production and
    // locked the organisation out of its own system.
    name: "Daniel Idonor",
    email: "danielidonor01@gmail.com",
    role: "SUPER_ADMIN",
    department: "MANAGEMENT",
    jobTitle: "Super Admin",
    whatsapp: "+2349167653581",
  },
  {
    name: "Ajayi Oluwadamilola",
    email: "ajayioluwadamilola527@gmail.com",
    role: "SUPER_ADMIN",
    department: "MANAGEMENT",
    jobTitle: "Super Admin",
    whatsapp: "",
  },
];

// Compared lower-cased, because an address typed into the user admin screen
// with a capital letter is the same person and must not be pruned.
export const FOUNDING_EMAILS = FOUNDING_ACCOUNTS.map((a) => a.email.toLowerCase());

export const isFoundingAccount = (email: string | null | undefined) =>
  !!email && FOUNDING_EMAILS.includes(email.trim().toLowerCase());
