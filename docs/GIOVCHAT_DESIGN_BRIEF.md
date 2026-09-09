# GiovChat → LIMSL CMS: UI/UX Overhaul Design Brief

## Context

This brief is for **Claude** (working on the `phase-2` branch of the LIMSL CMS repo).
Gemini has captured screenshots and design analysis from **GiovChat** (`https://test.giovchat.app`) — a premium SaaS dashboard — to serve as an **inspirational reference** for a complete UI/UX overhaul of the LIMSL CMS.

**Important:** The overhaul must stay within the existing tech stack (Next.js 16, Tailwind v4, `lucide-react`). The AGENTS.md rulebook, role-gating, DB schema, and business logic are **untouched** — this is purely a **visual and interaction layer** upgrade. All changes go to **Claude's `phase-2` branch**.

---

## GiovChat Design Language — Full Analysis

### 🎨 Color Palette

| Role | Value | Notes |
|---|---|---|
| **Sidebar background** | `#0f1117` (near-black) | Deep dark sidebar, creates contrast |
| **Sidebar active item** | `#1e2028` (dark grey) | Subtle highlight on active nav item |
| **Sidebar text (default)** | `#9ca3af` (medium grey) | Muted, low contrast for inactive |
| **Sidebar text (active)** | `#ffffff` (white) | Full white for active/hovered item |
| **Main content bg** | `#f4f6f9` (light blue-grey) | Subtle off-white, not stark white |
| **Card/panel background** | `#ffffff` (white) | Clean white cards on the grey bg |
| **Primary action (dark)** | `#0f1117` (near-black) | CTA buttons like "Open Giov", "Save draft" |
| **Primary action hover** | `#1e2028` | Slightly lighter dark on hover |
| **Accent green (status)** | `#22c55e` (green-500) | Live status dot, toggle ON state |
| **Brand blue accent** | `#3b82f6` (blue-500) | Logo "G" icon gradient |
| **Link/interactive blue** | `#3b82f6` | Inline text links |
| **Border color** | `#e5e7eb` (grey-200) | Card borders, dividers |
| **Secondary button** | `#ffffff` border `#d1d5db` | Ghost buttons with border |

### 🔤 Typography

- **Font:** System-ui / Inter-family, clean and geometric
- **Hero/page titles:** Very large, heavy bold (`font-extrabold`), black text — e.g. "Your support floor is live, Daniel." uses massive 36–40px
- **Section headings:** `font-bold`, ~24px ("Support health and usage")
- **Sub-headings / card titles:** `font-semibold`, 16–18px
- **Body copy:** `font-normal`, 14px, `text-gray-600`
- **Labels/captions:** 11–12px, `text-gray-400`, sometimes uppercase with tracking
- **Login tagline:** Large, bold, editorial style — "Turn the noise into a clear signal."

### 📐 Layout & Spacing

- **Left sidebar:** Fixed, ~240px wide, full-height, dark background
- **Sidebar internal structure:**
  - Workspace selector at top (avatar + name + chevron)
  - Flat icon + label nav items (no section labels in main nav — just icons + text)
  - "Collapse sidebar" at bottom
- **Top bar:** White/light bg, centered search bar with `Ctrl K` shortcut, status badges (Live, Pro Plan) top-right, user avatar
- **Page content area:** `padding: 24–32px`, uses a soft blue-grey (`#f4f6f9`) as background
- **Cards:** `border-radius: 12–16px`, `box-shadow: subtle`, `padding: 20–24px`
- **Spacing rhythm:** 8px base, consistent `gap-4`/`gap-6` between elements
- **Two-panel layouts:** Common (sidebar list + detail pane, e.g. GiovBot studio, Inbox)

### 🧩 Key UI Components & Patterns

#### Sidebar Navigation
```
[Logo] Giov
[Workspace: Primus Design - Daniel Idonor ▾]
─────────────────
🏠 Dashboard        ← plain icon + label, no section grouping
📥 Inbox
👥 Customers
🤖 GiovBot
📊 Analytics
⚙️ Settings
─────────────────
← Collapse sidebar
```
- Active item: dark bg `#1e2028`, white text, no left border accent
- Hover: similar subtle dark bg highlight
- Icons: small `w-5 h-5`, stroke style, greyed out when inactive

#### Top Bar
- Full-width white bar, `height: 56px`
- Center: Search input with "Search conversations, customers, and settings" placeholder + `Ctrl K` keyboard shortcut badge
- Right: Status pill "● Live", plan badge "Pro Plan", user avatar circle (initial)
- Page title shown left (current page name, not in top bar — in content area)

#### Dashboard Hero Card
- Large white card with **editorial-style text** ("Your support floor is live, Daniel.")
- Personalization — the user's first name appears in the hero
- Two CTA buttons side by side: primary (black) + secondary (white border)
- Right panel: dark card with key metrics
- Status row: "● Support desk connected · 3 of 3 launch stages complete"

#### Metric/Stats Cards (Analytics)
```
┌─────────────────────────────────┐
│ TRACKED VISITORS          [icon]│
│                                 │
│ 0                               │
│                                 │
│ All visitor sessions captured   │
│ for the team                    │
└─────────────────────────────────┘
```
- All-caps label at top, icon top-right
- Giant number (large font)
- Description text below
- Clean white card, subtle border
- 4-column grid on analytics page

#### Two-Panel Studio Layout (GiovBot)
- Left panel: ~270px, white bg, shows sub-navigation (Spotlight, Agent, Procedures, Knowledge Base, Tools)
- Right panel: main content area with form or data
- Sub-nav items: icon + label, active item gets blue underline or highlight
- Agent config: clean form with label above input, `rounded-lg` inputs

#### Empty States
- Centered icon (rounded square bg, icon inside)
- Bold heading: "Select a conversation" / "No custom tools"
- Subtext explaining the next action
- Optional CTA button

#### Buttons
- **Primary (dark):** `background: #0f1117`, white text, `border-radius: 6–8px`, `padding: 8–12px 16–20px`
- **Secondary:** White bg, grey border, dark text
- **Icon button:** Circular or square, icon only, ghost style
- **Status badge:** Small pill, "Ready" in green tint, "Published" in grey

#### Tables (Customers / Knowledge Base)
- Minimal table styling
- Column headers: small caps, `text-gray-500`
- Row hover: very subtle bg highlight
- Action icons appear on hover (edit, delete, refresh icons)
- "0 contacts" count badge top-right of table

#### Toggles
- iOS-style pill toggle: grey = off, **green** = on
- Used for system tools: "End conversation", "Transfer to human"

#### Forms (Settings, Agent config)
- Clean label above input layout
- `border: 1px solid #e5e7eb`, `border-radius: 8px`, `padding: 10px 14px`
- Input bg: white
- Focus: blue ring
- Section cards group related form fields with a white card bg

#### Status Indicators
- "● Active workspace" → green dot + text
- "Default" + "Published" → pill badges, grey bg
- AI credits counter: "0 / 500" inline

---

## Screenshots Reference Gallery

All screenshots are saved at:
`C:\Users\Daniel Idonor\.gemini\antigravity-ide\brain\723d4f4e-9b31-42ff-8058-490ef7e6d613\`

| File | What it shows |
|---|---|
| `login_page_1788946779237.png` | Split login: left dark panel with hero text + chat preview, right white panel with form |
| `dashboard_overview_1788947097808.png` | Main dashboard: dark sidebar, hero section, operating metrics card |
| `dashboard_current_1788947177009.png` | Dashboard alt view |
| `inbox_view_1788947445009.png` | Inbox: 3-column (sidebar / thread list / empty detail), filter dropdowns |
| `customers_visitors_page_1788947741270.png` | Customers/Visitors tab |
| `customers_contacts_page_1788947765106.png` | Customers/Contacts tab: table with search + count badge |
| `giovbot_page_1788947792354.png` | GiovBot main: agent card with toggle, stats |
| `giovbot_studio_spotlight_1788947930020.png` | GiovBot Studio: Spotlight metrics tab |
| `giovbot_studio_agent_1788947964188.png` | Agent config form with LLM/Behavior panels |
| `giovbot_studio_agent_rendered_1788948001687.png` | Agent config fully loaded |
| `giovbot_studio_procedures_1788948274836.png` | Procedures/escalation rules tab |
| `giovbot_studio_knowledge_rendered_1788948414990.png` | Knowledge Base: source table + job history |
| `giovbot_studio_tools_1788948446088.png` | Tools tab: empty state + system tools toggles |
| `analytics_page_1788948570528.png` | Analytics: 2-row × 4-col metric cards grid |
| `settings_overview_1788948584526.png` | Settings overview: left config nav + right content area |
| `settings_chatbox_rendered_1788948611675.png` | Settings chatbox sub-page |
| `settings_company_team_rendered_1788948726260.png` | Company & team settings: workspace profile, form fields |
| `settings_channels_1788948840836.png` | Channels settings |
| `settings_team_1788948879013.png` | Team settings |

---

## LIMSL CMS — What Needs Overhauling

### Current State
- **Sidebar:** Uses `emerald-600` accent on white/light bg — feels generic
- **Dashboard:** Basic card grid, no editorial/hero treatment
- **Top bar:** Functional but minimal
- **Typography:** Standard Tailwind defaults, no editorial weight
- **Color:** Emerald accent on white — safe but not premium
- **Cards:** Functional but no depth or sophistication

### Key Files to Know
- `src/app/globals.css` — CSS tokens (currently minimal)
- `src/components/Sidebar.tsx` — Left navigation
- `src/components/PageHeader.tsx` — Page title component
- `src/components/Button.tsx` — Button component
- `src/components/Badge.tsx` — Status pills
- `src/app/layout.tsx` — Root layout
- `src/app/page.tsx` — Dashboard (12,532 bytes — rich content)
- `docs/UI-STANDARDS.md` — Current design system (to be evolved, not discarded)

### LIMSL CMS Modules (sidebar items)
The current sidebar is grouped into 5 sections:
1. **Assets** — Equipment, OEM Documents
2. **Maintenance** — Work Orders, Preventive Maintenance (Schedule), Corrective Records, Calibration, Procedures
3. **Safety & Compliance** — Permits-to-Work, WMS, Training & Competency, Audit Log
4. **Performance & Resources** — KPI Dashboard, Reports
5. **Administration** — User Accounts, Settings, Notifications

---

## Design Direction for the Overhaul

### Core Philosophy: "GiovChat-inspired but CMMS-appropriate"
Don't copy GiovChat literally — adapt its **design language** to a maintenance/compliance system:

### 1. Sidebar Transformation
**FROM:** Light bg with emerald active state
**TO:** Deep dark sidebar (`#0f1117`/`slate-950`) with white active text, subtle hover bg — exactly like GiovChat

```css
/* New sidebar */
background: #0c0f1a;  /* deep navy-black */
active item: bg #1a1f2e, text white
inactive: text #6b7280 (gray-500)
logo accent: emerald gradient (LIMSL brand color kept)
```

### 2. Top Bar Elevation  
**FROM:** Basic header
**TO:** Clean white bar with center-aligned search (like GiovChat), user avatar right, status indicators

### 3. Dashboard Hero Section
**FROM:** Card grid of KPIs
**TO:** Editorial hero with personalized greeting ("Your maintenance floor is live, [Name]."), key metric dark card on right, CTA buttons

### 4. Content Area Background
**FROM:** `slate-50` (#f8fafc)
**TO:** `#f0f2f7` (soft blue-grey, like GiovChat's `#f4f6f9`) — more premium feel

### 5. Card Refinement
**FROM:** `rounded-xl p-5 border-slate-200`
**TO:** `rounded-2xl p-6 border-gray-200 shadow-sm` — slightly more generous radius and subtle shadow

### 6. Typography Upgrade
- Import **Inter** from Google Fonts (or system Inter)
- Dashboard hero: bold, large editorial titles
- Maintain existing type scale but with heavier weights at the top

### 7. Button Style Evolution
- Keep emerald for primary LIMSL actions (it's the brand color)
- Introduce a **dark near-black** variant for hero CTAs (like GiovChat)
- Secondary buttons: clean white with border

### 8. Status & Badge Refinement
- Use GiovChat's green dot `●` pattern for "live" / "active" statuses
- Metric cards: All-caps label + giant number + description (like analytics page)

### 9. Two-Panel Pages
For pages that have a sidebar sub-nav (Settings, GiovBot-style module pages):
- Left panel ~260px, white bg, sub-nav with icon + label
- Right panel: main content

---

## Constraints (from AGENTS.md — DO NOT VIOLATE)

1. ✅ **Stack unchanged:** Next.js 16, Tailwind v4, lucide-react icons
2. ✅ **Claude's branch:** `phase-2` — Gemini owns `main`
3. ✅ **No breaking changes to logic:** API routes, role-gating, sign-off chains — untouched
4. ✅ **No native alert/confirm** — keep using sonner toasts + Modal component
5. ✅ **Mounted guard** for session-dependent renders — keep in Sidebar.tsx
6. ✅ **Emerald as brand accent** — LIMSL's primary color, keep it for active states in the new dark sidebar
7. ✅ **Light theme is default** — the main content area stays light; only the sidebar goes dark

---

## Suggested Implementation Order for Claude

1. **`globals.css`** — New CSS custom properties (sidebar dark palette, content bg, shadow tokens)
2. **`Sidebar.tsx`** — Dark sidebar transformation (biggest visual impact)
3. **Layout/TopBar** — Elevate the top bar design
4. **`page.tsx` (Dashboard)** — Hero section with editorial greeting + metrics
5. **`PageHeader.tsx`** — More refined page title component
6. **`Button.tsx`** — Add dark variant, refine sizing
7. **`Badge.tsx`** — GiovChat-style status indicators
8. **Individual pages** — Analytics metric cards, Settings two-panel layout

---

*Brief compiled by Gemini (Antigravity) from live GiovChat session capture on 2026-09-09.*
*Screenshots are at: `C:\Users\Daniel Idonor\.gemini\antigravity-ide\brain\723d4f4e-9b31-42ff-8058-490ef7e6d613\`*
