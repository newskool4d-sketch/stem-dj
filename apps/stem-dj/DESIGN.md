# Stem DJ Design System

Status: baseline contract for the Wave 2 UI redesign.

This document is the source of truth for future UI work in this project. UI changes must use these tokens, primitives, states, and layout rules, or update this file first.

## 1. Atmosphere & Identity

Stem DJ is a dense performance console, not a landing page. It should feel like low-glare DJ hardware on a dark desk: compact, legible under pressure, and organized for repeated action. The signature is twin-deck signal color: Deck A uses restrained teal, Deck B uses clear blue, while meters, cue points, stems, and warnings use semantic colors instead of decorative purple-blue wash.

The current visual language is a dark console with inset panels, waveform lanes, square controls, and compact library rows. The target keeps that density and equipment feel, but reduces generic purple/blue dominance by moving deck identity, meters, and status into named semantic tokens.

## 2. Color

### Palette

| Role | Token | Current | Target | Usage |
|---|---|---:|---:|---|
| Surface/app | `--surface-app` | `--bg` `#080a0d` | `#080a0d` | Body background, empty canvas surround |
| Surface/topbar | `--surface-topbar` | `#080a0dcc` | `#0b0e13` | Top navigation and persistent chrome |
| Surface/panel | `--surface-panel` | `--panel` `#11151b` | `#11151b` | Decks, mixer, utility panels |
| Surface/raised | `--surface-raised` | `--panel-2` `#171c24` | `#171c24` | Active panels, selected row ground |
| Surface/strong | `--surface-strong` | `--panel-3` `#202633` | `#202633` | Strong separators and headers |
| Surface/inset | `--surface-inset` | `#080b10` | `#080b10` | Inputs, logs, waveform gutters |
| Surface/grid | `--surface-grid` | `#121823` | `#121823` | Waveform grid ticks and zoom lanes |
| Border/default | `--border-default` | `--line` `#2b3442` | `#2b3442` | Panel and control borders |
| Border/subtle | `--border-subtle` | `#1f2835` | `#1f2835` | Quiet separators inside panels |
| Text/primary | `--text-primary` | `--text` `#f3f6fb` | `#f3f6fb` | Main labels and values |
| Text/muted | `--text-muted` | `--muted` `#8d98a8` | `#8d98a8` | Metadata, helper copy, inactive labels |
| Text/disabled | `--text-disabled` | `#596270` | `#596270` | Disabled controls and retired rails |
| Accent/deck A | `--accent-deck-a` | `#31c4a8` badges | `#31c4a8` | Deck A identity, A focus accents, safe signal |
| Accent/deck A strong | `--accent-deck-a-strong` | none | `#64e5cf` | Deck A hover and high-contrast highlights |
| Accent/deck B | `--accent-deck-b` | `--blue` `#17a7ff` | `#55b8ff` | Deck B identity and B focus accents |
| Accent/deck B strong | `--accent-deck-b-strong` | none | `#8bd3ff` | Deck B hover and high-contrast highlights |
| Accent/control | `--accent-control` | `--purple` `#b04cff` | `#c780ff` | Global controls, active nav, overlay title |
| Accent/warm | `--accent-warm` | `--orange` `#ff7b22` | `#ff9a4d` | Secondary cue and warm status |
| Cue/red | `--cue-red` | `#ff6969` | `#ff6969` | Hot cue 1, destructive cue state |
| Cue/yellow | `--cue-yellow` | `--yellow` `#f0d327` | `#f0d327` | Hot cue 3, BPM values |
| Cue/green | `--cue-green` | `--green` `#43d34c` | `#43d34c` | Hot cue 4, ready stems |
| Meter/safe | `--meter-safe` | recorder gradient | `#31c4a8` | Healthy level range |
| Meter/warn | `--meter-warn` | recorder gradient | `#e0bc5b` | Warning level range |
| Meter/hot | `--meter-hot` | recorder gradient | `#ff5757` | Peak and clipping range |
| State/danger | `--state-danger` | `--danger` `#ff5757` | `#ff5757` | Record, errors, destructive actions |
| State/danger text | `--state-danger-text` | `#ffb8bd` | `#ffb8bd` | Text on danger outlines |
| Focus/ring | `--focus-ring` | `#f4c8ff` | `#f4c8ff` | Keyboard focus outline |
| Overlay/scrim | `--overlay-scrim` | `--overlay-bg` | `rgba(5, 7, 10, .72)` | Modal backdrop |
| Badge/stems bg | `--badge-stems-bg` | `#31c4a820` | `#31c4a820` | Ready stem badge background |
| Badge/no stems bg | `--badge-no-stems-bg` | `#2d374840` | `#2d374840` | Missing stem badge background |

### Rules

- All new colors must be represented in this table before use.
- Deck A and Deck B accents must identify decks, not decorate unrelated controls.
- Purple is a global control accent only. Do not use it as the default answer for every active state.
- Meters must use `--meter-safe`, `--meter-warn`, and `--meter-hot`.
- Hard ban: raw ad-hoc colors in new UI code. Existing raw colors are accepted debt until Task 8 replaces them with tokens.
- Hard ban: one-note purple/blue gradients. Use neutral surfaces plus semantic signal colors.

## 3. Typography

### Font Stack

- UI: `"Segoe UI", "Malgun Gothic", system-ui, -apple-system, sans-serif`
- Mono/data: `"Cascadia Mono", "Consolas", "SFMono-Regular", monospace`
- Numeric controls and meters must use tabular figures via `font-variant-numeric: tabular-nums`.

### Scale

| Level | Token | Size | Weight | Line height | Tracking | Usage |
|---|---|---:|---:|---:|---:|---|
| Console brand | `--type-brand` | 14px | 900 | 1 | 0 | STEMWAVE mark |
| Panel title | `--type-panel-title` | 13px | 700 | 1.2 | 0 | Panel and overlay headers |
| Track title | `--type-track-title` | 14px | 700 | 1.25 | 0 | Deck title and library title |
| Control | `--type-control` | 13px | 600 | 1.2 | 0 | Buttons, select, compact inputs |
| Body | `--type-body` | 14px | 400 | 1.45 | 0 | Library rows, notices, selected track |
| Metadata | `--type-meta` | 12px | 500 | 1.35 | 0 | Time, BPM metadata, status copy |
| Meter value | `--type-meter` | 11px | 600 | 1.2 | 0 | dB, peaks, EQ readouts |
| Timer | `--type-timer` | 38px | 700 | 1 | 0 | Recording timer only |

### Rules

- Do not introduce hero-scale type. This is an operational performance tool.
- Do not scale font size with viewport width.
- Letter spacing target is 0. Existing letter-spaced labels are accepted debt until Task 8 normalizes them.
- Body and interactive text should not drop below 12px in dense controls; 14px is preferred for normal rows.

## 4. Spacing & Layout

### Base Unit

All spacing derives from 4px.

| Token | Value | Usage |
|---|---:|---|
| `--space-1` | 4px | Inner icon/text gap, small readout gap |
| `--space-2` | 8px | Default compact gap, input padding |
| `--space-3` | 12px | Panel internal rhythm, toolbar gap |
| `--space-4` | 16px | Overlay and larger panel padding |
| `--space-5` | 20px | Modal side padding |
| `--space-6` | 24px | Overlay grid gap |
| `--space-8` | 32px | Future wide section gap, rare |

Implementation-only substrate tokens may extend the semantic palette for
illustrative surfaces while remaining derived from the same dark console
system: `--surface-black`, `--surface-art-a` through `--surface-art-f`,
`--surface-rec`, `--surface-rec-raised`, `--surface-rec-panel`, and
`--wave-grid`.

### Shell Grid

- The performance view is one instrument, not separate page sections.
- The target shell uses `min-height: 100dvh`, stable grid tracks, and controlled internal scrolling.
- Core regions: topbar, global waveform, deck/mixer grid, stem utility row, zoom row, library/status zone.
- Desktop target widths: 1365px, 1440px, and 1280px must show both decks, mixer, waveform, stems, zoom, and library without incoherent overlap.
- Tablet/mobile targets: 768x1024 and 375x812 use stacked regions with internal scroll; never hide core DJ controls just to fit.
- Hard ban: marketing-page layout drift. Do not add heroes, feature cards, decorative sections, or landing-page composition.

### Performance Shell Tokens

| Token | Default | Short desktop | Usage |
|---|---:|---:|---|
| `--shell-topbar-height` | 44px | 40px | Persistent chrome height used by `#performView` |
| `--shell-gap` | 6px | 5px | Gap between major shell regions |
| `--shell-pad` | 6px | 5px | Outer performance shell padding |
| `--shell-wave-min` | 76px | 70px | Global A/B waveform minimum row |
| `--shell-decks-min` | 292px | 302px | Deck and mixer performance row minimum |
| `--shell-utility-min` | 112px | 112px | Stem utility row minimum |
| `--shell-zoom-min` | 84px | 68px | Deck detail waveform row minimum |
| `--shell-library-min` | 140px | 118px | Performance library/status row minimum |

- Desktop `#performView` must use these row tokens in one grid so rows are negotiated together.
- Short desktop may reduce non-primary rows first; deck transport, loop, stem, and mixer controls are primary and must stay visible.
- Tablet and phone layouts may stack regions and use page scrolling, but must prevent horizontal page overflow.

### Breakpoints

| Token | Width | Purpose |
|---|---:|---|
| `--bp-phone` | 375px | Narrow touch layout QA |
| `--bp-tablet` | 768px | Stacked tablet layout QA |
| `--bp-desktop-min` | 1280px | Full console layout minimum |
| `--bp-laptop` | 1365px | Short laptop QA target |
| `--bp-wide` | 1440px | Primary desktop QA target |

## 5. Components

### Topbar and Navigation

- Structure: `header.topbar`, `.brand`, `nav.nav-tabs`, `.top-actions`.
- Variants: active tab, disabled tab, overlay trigger, download link.
- Spacing: `--space-2` gaps; topbar height must be a named shell token in Task 7.
- States: default, hover, active/pressed, focus-visible, disabled.
- Accessibility: nav buttons need visible focus and active state; overlay triggers must restore focus after close.
- Motion: color or border changes only; no decorative movement.

### Performance Shell

- Structure: `#performView` containing waveform, deck/mixer grid, utility row, zoom row, library zone.
- Variants: full desktop console, short laptop compact console, stacked tablet/mobile.
- Spacing: all grid gaps use `--space-1`, `--space-2`, or `--space-3`.
- States: normal, overflow fallback, empty-library state.
- Accessibility: source order must remain keyboard-readable when stacked.
- Motion: shell regions do not animate layout.

### Deck Shell

- Structure: `.deck`, `.deck-head`, `.deck-id`, `.art`, `.track-meta`, `.tempo-box`, platter, transport, cue strip, loop strip.
- Variants: Deck A, Deck B, empty, loaded, stem-running, stem-ready.
- Spacing: compact grid gaps from `--space-1` and `--space-2`.
- States: default, selected track loaded, playing, paused, cue-ready, loading stems, error.
- Accessibility: deck controls are real buttons/inputs with visible focus. Canvas platter needs an accessible adjacent state label when behavior changes.
- Motion: platter rotation and waveform movement must communicate playback or user drag only.

### Platter

- Structure: `canvas.platter` plus surrounding deck state labels.
- Variants: idle, playing, dragging, vinyl mode on/off, scratch feedback.
- States: hover for pointer affordance, active/dragging, focus-visible if keyboard control is added, disabled/no track.
- Accessibility: pointer-only scratch must not block keyboard play/cue/load workflows.
- Motion: transform/canvas redraw tied to playback, drag, or scratch state. No idle decorative animation.

### Transport Button

- Structure: native `button`.
- Variants: primary play, secondary cue/load/stem, danger record, compact load action.
- Spacing: control padding `--space-1` to `--space-2`.
- States: default, hover, active/pressed, focus-visible, disabled, loading.
- Accessibility: text labels remain visible; do not replace clear labels with unlabeled icons.
- Motion: 100-150ms transform or color shift for press/hover only.

### Cue and Loop Controls

- Structure: native buttons in `.cue-strip` and `.loop-strip`.
- Variants: cue red, warm, yellow, green; loop size; loop off.
- States: default, set, active, hover, focus-visible, disabled.
- Accessibility: active loop state must be perceivable without color alone.
- Motion: color/border shift only.

### Mixer Strip

- Structure: mixer tabs, EQ rows, channel volume, crossfader, master gain.
- Variants: MIXER, FX, FILTER panels.
- States: active tab, hover, focus-visible, disabled, out-of-range warning.
- Accessibility: every range input has a visible label and readout when numeric precision matters.
- Motion: parameter changes are audio-smoothed in JS; UI motion remains minimal.

### Meter

- Structure: canvas or div meter with numeric readout.
- Variants: master, deck A, deck B, recording, peak hold.
- Tokens: `--meter-safe`, `--meter-warn`, `--meter-hot`, `--surface-inset`.
- States: silent, normal, warning, hot, clipped, unavailable.
- Accessibility: visible text readout must be present near any critical meter.
- Motion: meter movement is signal-driven only.

### Waveform Lane and Zoom Panel

- Structure: label, canvas, optional readout.
- Variants: global waveform, zoom waveform, empty/no track.
- States: empty, loading/analyzing, ready, loop range visible, current playhead visible.
- Accessibility: canvas has adjacent textual time/duration/loop labels.
- Motion: redraw only for playback, seeking, loop updates, or analysis.

### Stem Card

- Structure: stem label, volume range, mute/solo actions, status.
- Variants: vocals, drums, bass, other.
- States: unavailable, loading, ready, muted, soloed, disabled, error.
- Accessibility: mute and solo states must be exposed through button state text or ARIA pressed state.
- Motion: no decorative motion.

### Library Row

- Structure: semantic row action or button/listbox option, with title, filename/meta, BPM, size, stems, load actions.
- Variants: performance mini row, Library tab row, Browse result row.
- States: default, hover, focus-visible, selected, loading, empty, filtered-zero, error.
- Accessibility: keyboard must select and load to Deck A/B without a mouse; selected state must not rely on color only.
- Motion: row hover/focus color shift only.

### Form Field

- Structure: label plus input/select/range, with optional readout.
- Variants: text, search, number, select, range, checkbox, file picker.
- States: default, hover, focus-visible, disabled, invalid, loading.
- Accessibility: inputs require visible labels or programmatic labels; placeholder text is not a label.
- Motion: focus and state changes only.

### Overlay Dialog

- Structure: `role="dialog"` or native dialog equivalent, overlay scrim, heading, close button, content, actions.
- Variants: REC, FX.
- States: hidden, opening, open, closing, invalid/unavailable.
- Accessibility: initial focus, focus trap while open, Escape close, focus restore, hidden overlays not tabbable.
- Motion: opacity/transform only; respect reduced motion.

### Status Log and Notice

- Structure: log region, notice line, path line, selected preview.
- Variants: neutral, success, warning, error, long path.
- States: empty, updating, overflow, error.
- Accessibility: important status changes should use a polite live region when added.
- Motion: no animation.

### Badge

- Structure: compact text label.
- Variants: stems ready, no stems, BPM cached, job running.
- States: default, loading, success, warning, error.
- Accessibility: color plus text; never color-only.
- Motion: no animation.

## 6. Motion & Interaction

### Timing

| Type | Duration | Easing | Usage |
|---|---:|---|---|
| Micro | 100-150ms | `ease-out` | Button hover, active press, focus reveal |
| Standard | 180-240ms | `ease-in-out` | Overlay open/close, tab panel reveal |
| Signal | frame-bound | linear | Meters, platter, waveform redraw |

### Rules

- Hard ban: motion without interaction/state meaning.
- Animate only `transform`, `opacity`, or `filter`.
- Do not animate `width`, `height`, `top`, `left`, `margin`, `padding`, or grid tracks.
- Every interactive control needs hover, active/pressed, focus-visible, disabled where applicable.
- Respect `prefers-reduced-motion` by disabling non-essential transitions.
- No decorative or idle animation except signal-driven platter/waveform/meter behavior.

## 7. Depth & Surface

### Strategy

Depth strategy: mixed tonal-shift plus tight borders. This is equipment UI, so surfaces should read as stacked hardware panels, not floating marketing cards.

| Token | Value | Usage |
|---|---|---|
| `--radius-control` | 4px | Buttons, fields, row badges |
| `--radius-panel` | 6px | Decks, mixer, library panes |
| `--radius-overlay` | 8px | REC and FX overlay panels |
| `--shadow-inset` | `inset 0 1px 0 #ffffff10` | Panel top edge glint |
| `--shadow-overlay` | `0 12px 40px #00000088` | Dialog elevation only |

### Rules

- Cards are only for repeated items or framed tools; do not put cards inside cards.
- Page sections are shell regions, not floating marketing cards.
- No decorative orbs, bokeh blobs, or generic gradient backgrounds.
- Border radii stay tight: controls 4px, panels 6px, overlays 8px.
- Overlay depth may use `--shadow-overlay`; routine panels should rely on tonal shift and border.

## 8. Accepted Debt

These are known deviations accepted only as the baseline for Task 6. Later UI tasks should reduce, not expand, this list.

- Existing `static/styles.css` has raw hex and rgba values outside `:root`; Task 8 must move new and touched colors to Section 2 tokens.
- Existing fixed-height arithmetic in the performance shell can clip on short laptops; Task 7 must replace it with a responsive grid contract.
- Existing REC and FX overlays lack complete dialog semantics; Task 9 must add keyboard-safe behavior.
- Existing FX overlay headings use inline `style`; Task 9 must move them into tokenized CSS.
- Existing Collection rail is inert pseudo-navigation; Task 10 must remove it instead of styling around it.
- Existing library and browse rows are clickable div workflows; Task 11 must provide semantic keyboard operation.
- Existing font tracking uses positive letter spacing in several compact labels; Task 8 should normalize new typography to the scale in Section 3.
- Existing meter UI is incomplete; Tasks 13 and 14 must add explicit headroom and deck/master meters using Section 2 meter tokens.
