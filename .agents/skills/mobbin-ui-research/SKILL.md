---
name: mobbin-ui-research
description: Researches real-world UI patterns, command palettes, split-pane editors, and color palettes using the connected Mobbin MCP server before building frontend components. Use when designing or refactoring UI screens, modals, onboarding flows, or diagnostic drawers. Do not use for backend compiler or parser tasks.
---

# Mobbin MCP UI Research Workflow

Before generating React or CSS code for any UI feature in TeXPulse Studio 2.0, execute this sequence:

1. **Query Mobbin Reference Screens:**
   * If connected to the official Mobbin MCP plugin, call `search_screens` or `search_flows` for desktop/web productivity patterns (command palettes, split-view editors, inline diagnostics, onboarding flows).
   * If connected to `mobbin-mcp`, call `mobbin_get_filters({ kind: "patterns" })` or `mobbin_quick_search` for reference apps (Linear, Craft, Notion), followed by `mobbin_get_app_screens` or `mobbin_search_screens`.

2. **Inspect Details & Extract Palette:**
   * Call `mobbin_get_screen_detail` on the best matching `screen_url` to inspect visual hierarchy and extract dominant hex colors.

3. **Record Layout Specifications:**
   * Document the spacing, header height, border treatment, and shortcut badge alignment in the Antigravity implementation plan artifact before writing `.tsx` code.
