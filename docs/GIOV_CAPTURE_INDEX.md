# Giov Capture Index — Exact DOM Tokens & Component Assets

> **Captured For:** Claude (`phase-2`) & LIMSL CMS Rebuild  
> **Source Target:** `https://test.giovchat.app`  
> **Date Generated:** 2026-09-11T15:57:53.764Z  
> **Token Engine:** Live DOM `getComputedStyle` + Stylesheet extraction

---

## 📑 Core Token JSON Files (Task A)

Every file contains full computed properties (`color`, `background-color`, `border-color`, `border-radius`, `box-shadow`, `font-family`, `font-size`, `padding`, `gap`) and active CSS custom properties extracted directly from the live DOM:

| File | Scope / Target Page | Key Insight |
|---|---|---|
| [`giov_tokens_theme.json`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_tokens_theme.json) | Global Root Stylesheet | 264 CSS custom properties extracted from main stylesheet bundle |
| [`giov_tokens_dashboard.json`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_tokens_dashboard.json) | Main Dashboard (`/dashboard`) | Metric cards, editorial hero typography, stats badges |
| [`giov_tokens_inbox.json`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_tokens_inbox.json) | Communication Inbox (`/dashboard/inbox`) | Two-column panel rhythm, conversation list spacing |
| [`giov_tokens_customers.json`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_tokens_customers.json) | Customer Directory (`/dashboard/customers`) | Data table row heights, cell padding, badge pills |
| [`giov_tokens_giovbot.json`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_tokens_giovbot.json) | GiovBot Studio (`/dashboard/giovbot`) | Tab navigation, toggle switch anatomy, code/knowledge inputs |
| [`giov_tokens_settings.json`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_tokens_settings.json) | Settings Interface (`/dashboard/settings`) | Form layout, select dropdowns, destructive action buttons |
| [`giov_tokens_login.json`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_tokens_login.json) | Authentication (`/dashboard/auth/login`) | Brand gradients, input borders, primary action states |

---

## 🎨 Component Interaction States (Task B)

Cropped close-up captures of individual components across state transitions:

| Component | State / Filename | Description |
|---|---|---|
| **Primary Button** | [`giov_button_primary_rest.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_button_primary_rest.png) | Rest state: near-black background (`#0f1117`), rounded-lg, white text |
| **Primary Button** | [`giov_button_primary_hover.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_button_primary_hover.png) | Hover state: subtle lightness lift (`#1e2028`) |
| **Primary Button** | [`giov_button_primary_focus.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_button_primary_focus.png) | Keyboard focus ring state via Tab |
| **Secondary Button** | [`giov_button_secondary_rest.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_button_secondary_rest.png) | Ghost/outline rest state with subtle 1px border |
| **Secondary Button** | [`giov_button_secondary_hover.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_button_secondary_hover.png) | Ghost button hovered with muted background fill |
| **Text Input** | [`giov_form_input_rest.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_form_input_rest.png) | Input rest state: clean 1px border, 8px radius |
| **Text Input** | [`giov_form_input_focus.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_form_input_focus.png) | Input keyboard focus with high-contrast active ring |
| **Text Input** | [`giov_form_input_filled.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_form_input_filled.png) | Input filled with text value |
| **Text Input** | [`giov_form_input_error.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_form_input_error.png) | Form fields displaying error border and invalid credential state |
| **Sidebar Nav** | [`giov_nav_item_inactive.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_nav_item_inactive.png) | Sidebar item inactive: muted grey text on near-black |
| **Sidebar Nav** | [`giov_nav_item_hover.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_nav_item_hover.png) | Sidebar item hover highlight |
| **Sidebar Nav** | [`giov_nav_item_active.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_nav_item_active.png) | Sidebar item active: dark grey capsule (`#1e2028`) + pure white text |
| **Sidebar Nav** | [`giov_nav_item_active_hover.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_nav_item_active_hover.png) | Sidebar item active with cursor hover |
| **Table Row** | [`giov_table_row_rest.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_table_row_rest.png) | Data row rest state |
| **Table Row** | [`giov_table_row_hover.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_table_row_hover.png) | Data row with soft hover tint |
| **Checkbox** | [`giov_checkbox_unchecked.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_checkbox_unchecked.png) | Unchecked selection box |
| **Checkbox** | [`giov_checkbox_checked.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_checkbox_checked.png) | Checked selection box |
| **Toggle Switch** | [`giov_toggle_state.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_toggle_state.png) | Switch anatomy and indicator dot |
| **Tabs** | [`giov_tab_active.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_tab_active.png) | Tab active selection indicator |
| **Tabs** | [`giov_tab_inactive.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_tab_inactive.png) | Tab inactive rest |
| **Tabs** | [`giov_tab_hover.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_tab_hover.png) | Tab hover feedback |
| **Dropdown** | [`giov_dropdown_closed.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_dropdown_closed.png) | Select / dropdown closed trigger |
| **Toast / Alert** | [`giov_toast_error.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_toast_error.png) | Error banner notification styling |

---

## 📱 Responsive Viewports (Task C)

Comparative responsive captures at Phone (`390 × 844`), Tablet Portrait (`768 × 1024`), and Laptop (`1440 × 900`):

| Screen | Mobile (`390 × 844`) | Tablet (`768 × 1024`) | Laptop (`1440 × 900`) | Responsive Notes |
|---|---|---|---|---|
| **Dashboard** | [`giov_dashboard_390.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_dashboard_390.png) | [`giov_dashboard_768.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_dashboard_768.png) | [`giov_dashboard_1440.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_dashboard_1440.png) | Sidebar collapses off-canvas behind hamburger; hero stacks into single-column |
| **Inbox** | [`giov_inbox_390.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_inbox_390.png) | [`giov_inbox_768.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_inbox_768.png) | [`giov_inbox_1440.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_inbox_1440.png) | Two-pane conversation splits to view-swapping drilldown on phone |
| **Customers** | [`giov_customers_390.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_customers_390.png) | [`giov_customers_768.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_customers_768.png) | [`giov_customers_1440.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_customers_1440.png) | Tables preserve horizontal scroll container rather than wrapping awkwardly |
| **Settings** | [`giov_settings_390.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_settings_390.png) | [`giov_settings_768.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_settings_768.png) | [`giov_settings_1440.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_settings_1440.png) | Form sections stack vertically with full-width action buttons |

---

## 🔍 Overlays, Scroll & Gap Findings (Task D)

| Asset | Description | Key Architectural Finding |
|---|---|---|
| [`giov_modal_search_open.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_modal_search_open.png) | Global Search (`Ctrl+K`) Palette Open | Centered modal with backdrop blur, grouped search results |
| [`giov_dropdown_workspace_open.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_dropdown_workspace_open.png) | Workspace Switcher Menu Open | Floating popover with active account checkmark |
| [`giov_scroll_top.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_scroll_top.png) | Top Scroll Position | Flush header without box-shadow |
| [`giov_scroll_middle.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_scroll_middle.png) | Mid Scroll Position | Sticky top bar gains elevation border/shadow, sidebar scrolls independently |
| [`giov_scroll_bottom.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_scroll_bottom.png) | Bottom Viewport | Clean footer margin and scroll termination |
| [`giov_darkmode_evaluation.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_darkmode_evaluation.png) | Dark Mode Evaluation | Confirms Giov uses a light-canvas theme with a dark sidebar; no standalone full dark-mode palette toggle was detected |
| [`giov_auth_signup_page.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_auth_signup_page.png) | Signup Flow | Editorial dual-column split: left hero illustration, right auth card |
| [`giov_auth_onboarding_page.png`](file:///C:/Users/Daniel%20Idonor/LIMSL%20CMS/limsl-cms-phase2/docs/giov_auth_onboarding_page.png) | Onboarding / First-Run State | Workspace creation step for fresh installations |
