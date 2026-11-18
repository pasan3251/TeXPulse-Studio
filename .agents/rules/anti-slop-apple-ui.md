---
trigger: glob
description: Enforces Apple Human Interface Guidelines (HIG) desktop precision and bans AI UI slop across all frontend components and stylesheets.
globs: "*.tsx, *.ts, *.css"
---

# Anti-Slop & Apple HIG Desktop UI Rules

1. **Banned "AI Slop" Patterns:**
   * NEVER use purple/indigo/neon gradients, glowing drop shadows, or decorative background blobs.
   * NEVER use `border-radius` larger than `8px` on modals or `6px` on buttons and inputs.
   * NEVER use heavy `box-shadow`s between workspace panes; separate the File Explorer, CodeMirror 6 Editor, and PDF.js Preview strictly with `1px solid` hairline borders.
   * NEVER stack multiple horizontal toolbars; consolidate global controls into a single `40px` window header.

2. **Apple HIG Surface & Typography Tokens:**
   * **Sidebar Chrome:** Translucent surface (`#F5F5F7` Light / `#18181B` Dark) with `12px`–`13px` system UI font (`-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", sans-serif`).
   * **Editor & PDF Canvas:** High-contrast reading surface (`#FFFFFF` Light / `#1E1E20` Dark).
   * **Numeric Alignment:** Apply `font-variant-numeric: tabular-nums` to all compile timers, line counters, and word counts.
   * **Single Interactive Accent:** `#007AFF` (Light) / `#0A84FF` (Dark). Semantic badges: Error `#FF3B30`, Warning `#FF9500`, Ready `#34C759`.

3. **Native Desktop Ergonomics (Scrollbars, `sidebar.left` Toggle, & Split Sashes):**
   * **Minimal `6px` Buttonless Scrollbars:** Set explicit `color-scheme` (`light`/`dark`), hide arrow buttons (`::-webkit-scrollbar-button { display: none; width: 0; height: 0; }`), use `6px` thickness with transparent tracks, and style `9999px` pill thumbs (`rgba(0,0,0,0.22)` Light / `rgba(255,255,255,0.20)` Dark).
   * **Header Sidebar Toggle:** Use the inline `16×16` Apple `sidebar.left` SVG icon inside a compact `28×28` (`6px` radius) icon button rather than text labels in the `40px` header.
   * **Draggable Split Sashes (`.tp-split-sash`):** Separate workspace panes with a crisp `1px` hairline (`--tp-border`) centered inside an `8px` interactive `col-resize` hit-target that highlights in `--tp-accent` on hover/drag and resets on double-click.
