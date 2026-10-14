import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const value = argv[i + 1]?.startsWith("--") ? true : argv[i + 1] ?? true;
    args.set(key.slice(2), value);
    if (value !== true) i += 1;
  }
  return args;
}

function requireIncludes(text, label, needles, failures) {
  for (const needle of needles) {
    if (!text.includes(needle)) failures.push(`${label}: missing "${needle}"`);
  }
}

function todoBlock(plan, number) {
  const match = new RegExp(`^- \\[[ xX]\\] ${number}\\.`, "m").exec(plan);
  const start = match?.index ?? -1;
  if (start === -1) return "";
  const next = plan.indexOf("\n- [", start + 1);
  return plan.slice(start, next === -1 ? plan.length : next);
}

function validateDesign(designText, planText) {
  const failures = [];
  requireIncludes(designText, "headings", [
    "# Stem DJ Design System",
    "## 1. Atmosphere & Identity",
    "## 2. Color",
    "## 3. Typography",
    "## 4. Spacing & Layout",
    "## 5. Components",
    "## 6. Motion & Interaction",
    "## 7. Depth & Surface",
  ], failures);

  requireIncludes(designText, "color tokens", [
    "--surface-app",
    "--surface-panel",
    "--surface-raised",
    "--surface-inset",
    "--text-primary",
    "--text-muted",
    "--accent-deck-a",
    "--accent-deck-b",
    "--accent-warm",
    "--meter-safe",
    "--meter-warn",
    "--meter-hot",
    "--state-danger",
    "--focus-ring",
    "--overlay-scrim",
  ], failures);

  requireIncludes(designText, "layout and surface tokens", [
    "--space-1",
    "--space-2",
    "--space-3",
    "--radius-control",
    "--radius-panel",
    "--radius-overlay",
    "--shadow-overlay",
  ], failures);

  requireIncludes(designText, "component primitives", [
    "### Deck Shell",
    "### Mixer Strip",
    "### Meter",
    "### Overlay Dialog",
    "### Library Row",
    "### Form Field",
    "### Status Log and Notice",
    "### Badge",
  ], failures);

  requireIncludes(designText, "state coverage", [
    "default",
    "hover",
    "active/pressed",
    "focus-visible",
    "disabled",
    "loading",
    "empty",
    "error",
    "selected",
  ], failures);

  requireIncludes(designText, "explicit bans", [
    "Hard ban: raw ad-hoc colors",
    "Hard ban: marketing-page layout drift",
    "Hard ban: motion without interaction/state meaning",
  ], failures);

  for (const number of [7, 8, 9, 10, 11]) {
    const block = todoBlock(planText, number);
    if (!block) {
      failures.push(`plan: missing Task ${number}`);
      continue;
    }
    if (!block.includes("DESIGN.md")) failures.push(`plan: Task ${number} does not reference DESIGN.md`);
  }

  return failures;
}

function writeEvidence(evidencePath, result) {
  if (!evidencePath) return;
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
  const lines = [
    "# Task 6 Evidence: Design Contract",
    "",
    `Result: ${result.failures.length === 0 ? "PASS" : "FAIL"}`,
    "",
    "## Checked",
    "",
    `- Design file: ${result.designPath}`,
    `- Plan file: ${result.planPath}`,
    "- Required seven DESIGN.md sections",
    "- Color, spacing, radius, surface, meter, overlay, form, library row, and deck accent tokens",
    "- Component primitives and required states",
    "- Explicit bans for raw ad-hoc colors, marketing-page layout drift, and motion without state meaning",
    "- Todo 7-11 references to DESIGN.md",
    "",
    "## Failures",
    "",
    ...(result.failures.length ? result.failures.map((failure) => `- ${failure}`) : ["- None"]),
    "",
  ];
  fs.writeFileSync(evidencePath, `${lines.join("\n")}\n`, "utf8");
}

const args = parseArgs(process.argv.slice(2));
const designPath = String(args.get("design") ?? "DESIGN.md");
const planPath = String(args.get("plan") ?? ".omo/plans/stem-dj-overhaul.md");
const evidencePath = args.has("evidence") ? String(args.get("evidence")) : "";

const designText = fs.readFileSync(designPath, "utf8");
const planText = fs.readFileSync(planPath, "utf8");
const failures = validateDesign(designText, planText);
writeEvidence(evidencePath, { designPath, planPath, failures });

if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
}
