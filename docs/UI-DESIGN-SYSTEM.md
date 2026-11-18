# TeXPulse Studio 2.0 — UI Design System & Layout Specification

**Design Authority:** TeXPulse Studio 2.0 PRD (Section 2 Requirement 4 & Section 4.2 Apple HIG + Anti-Slop Rules)  
**Mobbin MCP Status:** Live `mobbin_mobbin` queries require a paid Mobbin plan (`https://mobbin.com/pricing`); once upgraded, `/mobbin-ui-research` can attach live Mobbin reference URLs directly to component specs.

---

## 1. Core Anti-Slop Invariants

1. **Zero Decorative Gradients or Blobs:** Backgrounds use flat or native translucent semantic tokens only. Purple/indigo/amber neon gradients and radial background glows are strictly banned.
2. **1px Solid Hairline Borders Between Panes:** Workspace regions (Project Sidebar, Source/Visual Editor, PDF.js Preview, Diagnostics Drawer) are separated exclusively by `1px solid var(--tp-border-hairline)`. Box-shadows between workspace panes are banned.
3. **Strict Border-Radius Ceiling:**
   * Modals, Command Palette, Popovers: maximum `8px` (`--tp-radius-modal: 8px`).
   * Buttons, Inputs, Segmented Controls, Diagnostic Cards: maximum `6px` (`--tp-radius-control: 6px`).
   * Inline Badges & Shortcut Pills: `4px` (`--tp-radius-badge: 4px`).
4. **Single Consolidated `40px` Window Header:** Global controls (sidebar toggle, project breadcrumb, `Code ⇄ Visual` segmented switch, engine/compile status pill, `Compile` action, and PDF zoom/SyncTeX controls) live in one `40px` header bar. Stacked secondary horizontal toolbars are banned.
5. **Tabular Numerals Everywhere:** All line numbers, compile duration timers (`142 ms`), page counters (`Page 3 of 12`), diagnostic counts, and `texcount` word-count tables must apply `font-variant-numeric: tabular-nums`.

---

## 2. Locked Color Tokens (Light & Dark Themes)

Theme preference (`light` | `dark` | `system`) persists across sessions.

| Token Name | CSS Custom Property | Light Mode (`[data-theme="light"]`) | Dark Mode (`[data-theme="dark"]`) | Usage |
| :--- | :--- | :--- | :--- | :--- |
| **Sidebar & Header Chrome** | `--tp-bg-chrome` | `#F5F5F7` | `#18181B` | Left file/outline sidebar, `40px` top header, bottom status strip |
| **Editor & PDF Canvas** | `--tp-bg-canvas` | `#FFFFFF` | `#1E1E20` | CodeMirror 6 surface, KaTeX Visual view, PDF.js stage |
| **Elevated Surface** | `--tp-bg-elevated` | `#FFFFFF` | `#242428` | Command palette, modals, hover tooltips, autocomplete popover |
| **Subtle Hover / Active Row** | `--tp-bg-hover` | `rgba(0, 0, 0, 0.045)` | `rgba(255, 255, 255, 0.055)` | File tree hover, command palette row highlight |
| **Selected Row Surface** | `--tp-bg-selected` | `rgba(0, 122, 255, 0.12)` | `rgba(10, 132, 255, 0.18)` | Active file row in sidebar, active autocomplete item |
| **Hairline Border** | `--tp-border-hairline` | `#E5E5EA` | `#2C2C2E` | `1px solid` pane dividers, header/drawer borders |
| **Control Border** | `--tp-border-control` | `#D1D1D6` | `#3A3A3C` | Inputs, secondary buttons, segmented control outline |
| **Primary Text** | `--tp-text-primary` | `#1D1D1F` | `#F5F5F7` | Body copy, editor foreground, active filenames |
| **Secondary Text** | `--tp-text-secondary` | `#6E6E73` | `#A1A1A6` | Inactive tabs, sidebar labels, metadata, hints |
| **Muted / Gutter Text** | `--tp-text-muted` | `#8E8E93` | `#636366` | Line numbers, shortcut keycaps, disabled controls |
| **Interactive Accent** | `--tp-accent` | `#007AFF` | `#0A84FF` | Primary actions, active focus ring, SyncTeX target highlight |
| **Semantic Error** | `--tp-status-error` | `#FF3B30` | `#FF453A` | Fatal TeX/BibTeX errors, gutter markers, error squiggles |
| **Semantic Warning** | `--tp-status-warning` | `#FF9500` | `#FF9F0A` | LaTeX/package warnings, undefined references/citations |
| **Semantic Ready / Success** | `--tp-status-ready` | `#34C759` | `#30D158` | Compile succeeded badge, `.fmt` cache warm indicator |
| **Typesetting / Info** | `--tp-status-info` | `#5856D6` | `#5E5CE6` | `Overfull \hbox` / `Underfull \hbox` layout notifications |

---

## 3. Typography & Numeric Discipline

```css
:root {
  --tp-font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif;
  --tp-font-mono: "SF Mono", "JetBrains Mono", "Cascadia Code", Consolas, monospace;
}
```

| UI Element | Font Family | Size / Line-Height | Weight | Required Variant |
| :--- | :--- | :--- | :--- | :--- |
| **Window Header & Sidebar Tree** | `var(--tp-font-sans)` | `12.5px` / `18px` | `400` (`500` active) | — |
| **Section Eyebrows / Filter Tabs** | `var(--tp-font-sans)` | `11px` / `16px` | `600` | `letter-spacing: 0.02em` |
| **Diagnostic Card Title & Hint** | `var(--tp-font-sans)` | `13px` / `19px` | `500` title / `400` hint | — |
| **CodeMirror 6 Source Editor** | `var(--tp-font-mono)` | `13.5px` / `1.55` (configurable) | `400` | Ligatures optional |
| **Timers, Line Numbers, Counts** | `var(--tp-font-sans)` or `mono` | `11.5px`–`12.5px` | `400`–`500` | `font-variant-numeric: tabular-nums` |

---

## 4. Component Layout & Density Specification

### 4.1 Unified Three-Pane Split Workspace
* **Top Window Header (`40px` fixed height, `border-bottom: 1px solid var(--tp-border-hairline)`):**
  * **Left Zone:** Sidebar collapse button (`26px × 26px`), Project Name + active file breadcrumb (`main.tex`), dirty indicator dot (`6px`).
  * **Center Zone:** Compact segmented control (`26px` height, `6px` radius) toggling `Code` ⇄ `Visual` (KaTeX reading view).
  * **Right Zone:** Compile status pill (`Ready · 118 ms` with `tabular-nums`, or `2 Errors · 1 Warning` drawer toggle), primary `Compile` button (`⌘↵` / `Ctrl+Enter`, `26px` height, `6px` radius), and inline PDF controls (`-`, `100%`, `+`, `Fit`).
* **Left Project & Outline Sidebar (`240px` default width, resizable `180px`–`320px`, collapsible via `⌘B`):**
  * Surface: `var(--tp-bg-chrome)` with `border-right: 1px solid var(--tp-border-hairline)`.
  * Two compact segment tabs at top (`28px` height): `Files` (`.tex`, `.bib`, `.sty`, `.cls`, assets) and `Outline` (live document hierarchy derived from CodeMirror 6 Lezer AST).
  * Tree row density: `26px` row height, `6px` horizontal padding, `14px` indentation per depth level, subtle hover `var(--tp-bg-hover)`.
* **Center Editor Pane (`minmax(320px, 1fr)`):**
  * Surface: `var(--tp-bg-canvas)`.
  * **Live Math Preview Popover (Tier 1):** When the cursor is inside a math node (`$...$`, `$$...$$`, `\begin{align}`), renders a compact floating KaTeX card (`max-width: 420px`, `border: 1px solid var(--tp-border-control)`, `border-radius: 6px`, `background: var(--tp-bg-elevated)`) anchored above/below the active line without obscuring text.
* **Right PDF.js Preview Pane (`minmax(320px, 48%)`, separated by `1px solid var(--tp-border-hairline)`):**
  * Surface: `var(--tp-bg-canvas)`.
  * Continuous virtualized page scroll with exact scroll-ratio and zoom preservation across recompilations.
  * `Cmd/Ctrl + Click` triggers inverse SyncTeX search (after inverting PDF.js bottom-left Y-coordinate to top-left origin) and flashes a `1.2s` accent highlight on the target source line.

### 4.2 Categorized Diagnostics Drawer (Overleaf `HumanReadableLogs` Pattern)
* Anchored to the bottom of the Center Editor Pane (`height: 220px` collapsible, `border-top: 1px solid var(--tp-border-hairline)`).
* **Filter Tabs (`32px` bar):** `All`, `Errors (#FF3B30)`, `Warnings (#FF9500)`, `Typesetting / Boxes (#5856D6)` with `tabular-nums` badge counts.
* **Diagnostic Card Structure:**
  1. **Header Row:** Severity pill + file:line badge (`chapters/intro.tex:42`, `tabular-nums`) + **Plain-English `HumanReadableLogs` Title**.
  2. **Body:** Plain-English explanation and fix hint; if `HumanReadableLogsPackageSuggestions` matches a missing command, renders a `6px`-radius action button (`+ Add \usepackage{amsmath} to preamble`).
  3. **Collapsible Details:** Raw `.log` / `.blg` excerpt folded inside `<details>` (`var(--tp-font-mono)`, `11.5px`) so raw TeX macro expansion never clutters the primary view.

### 4.3 Command Palette & Inline Autocomplete
* **Command Palette (`⌘K` / `Ctrl+K`):**
  * Centered modal (`width: 560px`, `max-height: 380px`, `top: 14vh`), `background: var(--tp-bg-elevated)`, `border: 1px solid var(--tp-border-control)`, `border-radius: 8px`.
  * `40px` search input (`14px` font) + virtualized list of `32px` rows with right-aligned keyboard shortcut badges (`⌘↵`, `⌘/`, `tabular-nums`).
* **CodeMirror 6 Inline Autocomplete Popover:**
  * Compact list (`max-width: 380px`, `max-height: 240px`, `border-radius: 6px`, `1px solid var(--tp-border-control)`), displaying command signature (`\begin{equation}`), source category badge (`LaTeX`, `Snippet`, `\ref`, `\cite`), and hover documentation preview.
