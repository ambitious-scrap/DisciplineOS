---
name: DisciplineOS Dashboard
description: A Game Boy field control room for authoritative attention balance, enforcement, and proof-of-work.
colors:
  field-pale: "#9bbc0f"
  field-light: "#8bac0f"
  field-mid: "#0f380f"
  field-paper: "#e9efbd"
  field-warning: "#b45309"
  field-warning-ink: "#5b1d11"
  field-danger: "#8f1d2c"
  field-danger-ink: "#5f101b"
typography:
  display:
    fontFamily: "Fira Code, Courier New, monospace"
    fontWeight: 700
  body:
    fontFamily: "Fira Sans, system-ui, sans-serif"
    fontWeight: 400
rounded:
  control: "2px"
---

# Design System: DisciplineOS Dashboard

## Overview

**Visual archetype:** Game Boy field instrumentation rendered as an operate-mode control room. The shipped dashboard is a fluorescent olive-green field with a fixed dark rail, pixel dither, square status marks, tile meters, and hard-edged readouts. It is tactile through tonal blocks, borders, and offset shadows rather than glass, blur, or soft elevation.

The visual world keeps the product's authoritative, tactical stance legible at a glance: balance first, protection state second, then policy, radar, tasks, and ledger workspaces. The composition is intentionally dense and monitor-like, but copy and controls remain explicit rather than ornamental.

**Key characteristics:**
- Four olive/green roles, with paper, amber, and red reserved for contrast and exceptional states.
- Pixel rails, square geometry, dither, uppercase telemetry labels, and fixed field framing.
- Large digital time-bank readout paired with a 24-tile capacity meter.
- Operate-mode hierarchy: inspect state, then earn or spend time deliberately.

## Colors

The palette is a compact phosphor field. `field-pale` is the active canvas and selected-state voice; `field-light` is the panel surface; `field-mid`/`field-ink` is the deep ink, border, rail, and dark protection surface; `field-paper` supplies the light reading surface. Amber marks an active lease or warning, while danger red is reserved for emergency protocol.

### Primary
- **Field Pale** (`#9bbc0f`): lime canvas, active meter tiles, selected tabs, primary button text, and online status marks.
- **Field Light** (`#8bac0f`): panel fill and quiet text on dark surfaces.

### Neutral
- **Field Ink / Mid** (`#0f380f`): body text, borders, rails, deep panel, headings, and high-contrast control surfaces.
- **Field Paper** (`#e9efbd`): stat cells, modal surface, light text on dark surfaces, and completed-task tint.
- **Field Line** (`rgba(15, 56, 15, 0.45)`): restrained dividers in lists and tables.

### Exceptional states
- **Warning Amber** (`#b45309`) with **Warning Ink** (`#5b1d11`): temporary lease band and warning copy.
- **Danger Red** (`#8f1d2c`) with **Danger Ink** (`#5f101b`): emergency lease/protocol controls and emergency dialog.

**The Limited-Color Rule.** Do not introduce additional accent colors for ordinary status. Green carries normal authority and completion; amber and red carry only their defined exceptional states.

## Typography

**Display and telemetry:** `Fira Code` with `Courier New, monospace` fallback.
**Body and explanatory copy:** `Fira Sans` with `system-ui, sans-serif` fallback.

The pairing makes the interface read like a legible field terminal: monospaced labels, codes, timers, percentages, signatures, and navigation; humanist sans for explanatory sentences and task descriptions. Labels are commonly uppercase with measured tracking, not decorative display type.

### Hierarchy
- **Hero:** Fira Code 700, `clamp(2rem, 5vw, 4.25rem)`, `0.98` line-height, tight negative tracking.
- **Digital readout:** Fira Code 700, `clamp(4.2rem, 11vw, 8.5rem)`; the colon is a blinking terminal cursor.
- **Section and panel titles:** Fira Code 600–700, compact uppercase telemetry sizing.
- **Body:** Fira Sans at the 16px base; supporting copy uses readable 1.45–1.55 line-height.
- **Labels and metadata:** Fira Code 8–10px, usually uppercase with `0.02–0.10em` tracking.

## Layout

The page is a fixed field frame (`min-height: 100dvh`) over a full-viewport 8px dither pattern. Header, main content, and footer share a centered `min(1400px, 100% - 48px)` rail on desktop. The dark header has a 3px bottom rule and contains the four-square brand mark, authority readout, and connected-device chips.

The main topology is deliberate:
1. Intro statement and protocol stamp.
2. Live synchronization notice.
3. Optional active-lease band.
4. Two-column hero: wide **TIME BANK** panel (1.4fr) and dark **PROTECTION STATE** panel (0.75fr), separated by 24px.
5. Four-way tab rail: Policy Engine, Geofence Radar, Tasks & Habits, Ledger Audit.
6. One workspace at a time, followed by the emergency protocol band and footer.

Panels are rectangular 2px ink frames with hard offset shadows. Lists, task rows, and ledger tables use horizontal rules and dense grid columns rather than floating card stacks. The policy workspace splits applications and websites into parallel columns; radar uses a stage plus protocol stream; tasks use a tabular board; ledger remains a semantic table with horizontal overflow when needed.
Responsive rules are breakpoint-led rather than fluidly redesigned: below 1080px, hero/radar columns stack and device chips become icon-only; below 820px, the shared rail narrows to `min(100% - 32px, 680px)`, the authority readout hides, intro/stamp stack, policy controls stack, and task metadata collapses; below 560px, gutters become 12px, device chips form a full-width row, tabs use short labels in a horizontally scrollable rail, bank stats stack, primary actions become full width, target rows reflow, radar shortens, emergency content stacks, and ledger balance/signature columns hide.

## Elevation & Depth

Depth is graphic and physical-looking, never ambient: tonal green blocks, 2px borders, and square offset shadows. The standard field-panel shadow is `7px 7px 0 var(--field-ink)`; the dark protection panel offsets `7px 7px 0 var(--field-mid)`; the emergency dialog uses `10px 10px 0 var(--field-ink)`. Boards intentionally have no shadow. There is no blur, glow, or translucent glass layer.

## Shapes

Use rectilinear silhouettes throughout. Panels, rails, fields, badges, meters, and status marks use square corners; controls use only a slight `2px` radius. The recurring geometry is the 2px border, 7px/10px block shadow, 2×2 pixel brand mark, square status dot, and boxed protocol readout. Do not turn this system into pills, rounded cards, or soft neumorphic surfaces.

## Components

### Header and device strip
- Dark `field-mid` rail with paper/pale brand lockup, authority status, and three connected-device chips.
- Device chips are outlined, compact, icon-led, and carry a square status mark; labels collapse to icon-only at narrower widths.

### Time bank and meters
- The primary panel combines a large `HH:MM` digital readout, `HOURS : MINUTES` unit label, a 24-slot tile meter, three stat cells, and two 44px actions.
- Inactive slots are quiet green; active slots are field-pale. The meter exposes native meter semantics and current capacity values.

### Protection, leases, and emergency
- Protection state is the inverse dark panel: paper text, quiet-green dividers, and a four-row enforcement readout.
- A temporary lease is an amber band with clock and **Lock now** action; emergency leases use danger red.
- The emergency protocol is a danger-bordered light band. Confirmation is a centered, hard-shadow dialog that states the fixed 3× cost before action.

### Navigation and workspaces
- The tab rail is a dark framed strip. The selected tab becomes field-pale with dark text and a small blinking cursor; hover adds a quiet translucent green wash.
- Workspace content stays task-specific but shares the same field-panel, border, metadata, and divider grammar. Lucide line icons are small supporting marks, never substitutes for labels.
- Buttons are compact monospaced controls with 2px borders and a minimum 44px height. Primary is dark green on pale; outline is transparent; emergency is danger red; text actions are underlined links with a 44px hit height.
- Hover shifts buttons `-1px` on both axes and adds a hard 4px block shadow where defined; active returns to rest. Disabled lease/removal controls reduce opacity to `0.5` and use a not-allowed cursor.

### Interaction and accessibility states
- Every actionable control has a visible `:focus-visible` outline (`3px`, `3px` offset); dark contexts switch the outline to the light warning tone.
- The control-room tabs use `role="tablist"`/`role="tab"`/`role="tabpanel"`, roving `tabIndex`, and Arrow/Home/End keyboard movement.
- Notices use a polite live region; the time bank exposes `role="meter"`; the ledger keeps a semantic table caption and column scopes.
- The emergency dialog uses `role="dialog"` and `aria-modal`, moves focus to Cancel, traps Tab, closes on Escape or backdrop click, and restores focus to its trigger.
- Search/add controls have visible labels; icon-only removal controls use an accessible name. Active leases disable conflicting lease actions; queued removals remain blocked during their cooling-off state.

### Motion and reduced motion
- The time colon and selected-tab cursor blink with stepped opacity.
- The radar sweep rotates continuously while its workspace is visible.
- Workspace changes settle in with a short fade/8px rise.
- `prefers-reduced-motion: reduce` collapses animation, transition, and scroll durations to near-zero and disables repeated animation iterations.

## Do's and Don'ts

### Do:
- **Do** preserve the four-green field, dark rail, dither texture, pixel marks, hard borders, and block shadows.
- **Do** let the time-bank readout and tile meter anchor the first viewport, with protection state beside it on wide screens.
- **Do** keep state distinctions semantic: green for normal authority/completion, amber for leases/warnings, red for emergency.
- **Do** keep telemetry labels monospaced and explanatory copy in Fira Sans.
- **Do** preserve visible focus, keyboard tabs, live notices, meter semantics, dialog focus handling, and reduced-motion behavior.

### Don't:
- **Don't** reintroduce the superseded OLED cyber-hardware treatment: glass overlays, backdrop blur, cyan/indigo mesh lighting, double-bezel cards, or ambient glow.
- **Don't** replace the field with smooth gradients; the only background texture is the restrained pixel dither.
- **Don't** add pills, large radii, soft shadows, generic SaaS card stacks, or arbitrary decorative chrome.
- **Don't** spend amber/red on routine decoration or invent a new status color.
- **Don't** remove the fixed field frame, tile-meter readout, pixel rails, explicit labels, or the deliberate mobile stacking rules.
