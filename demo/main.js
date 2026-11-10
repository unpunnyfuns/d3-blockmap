import { createBlockMap } from "@unpunnyfuns/d3-blockmap";
import { brush } from "@unpunnyfuns/d3-blockmap/brush";
import { cssSnippet, reactSnippet, vanillaSnippet } from "./snippets.js";
import { createSource } from "./sources.js";
import { createTheme } from "./theme.js";

const MAX_BLOCKS = 0xffffffff;
const PROGRESS_INTERVAL_MS = 250;
const PERCENT = 100;
const PERCENT_DIGITS = 2;
const COPY_FEEDBACK_MS = 2000;
const MS_PER_SECOND = 1000;
const MAX_FRAME_MS = 250;
const DEFAULT_DURATION_S = 60;
const CALLBACK_NAMES = ["onViewChange", "onBrush", "onBrushEnd", "onBlockClick"];
const REBUILD_KEYS = ["totalBlocks", "source", "partial", "interactive", "axis", "tickCount", "brush", "tooltip"];

const PRESET_BASE = {
  partial: "coverage",
  height: 24,
  interactive: true,
  highlight: false,
  axis: false,
  tickCount: "",
  brush: false,
  tooltip: "default",
  onViewChange: false,
  onBrush: false,
  onBrushEnd: false,
  onBlockClick: false,
  duration: DEFAULT_DURATION_S,
  targetFill: 100,
};

const PRESETS = {
  streaming: { ...PRESET_BASE, totalBlocks: 10_000_000, source: "random", partial: "gradient" },
  discrete: { ...PRESET_BASE, totalBlocks: 40, source: "random", duration: 20 },
  ranges: {
    ...PRESET_BASE,
    totalBlocks: 10_000_000,
    source: "ranges",
    axis: true,
    brush: true,
    onViewChange: true,
    onBrushEnd: true,
    onBlockClick: true,
  },
};

const HINTS = {
  static: "This map is not interactive.",
  pan: "Ctrl/⌘+wheel or a pinch zooms, drag pans, double-click resets. Focus the bar for keyboard controls.",
  brush: "Drag selects a block range, Shift+drag pans, Ctrl/⌘+wheel or a pinch zooms, double-click resets.",
};

const $ = (selector) => document.querySelector(selector);
const form = $("#config");
const container = $("#map");
const fields = form.elements;
const numberFormat = new Intl.NumberFormat("en-US");
const fmt = (value) => numberFormat.format(value);

const formatRange = (range) => (range ? `[${fmt(range[0])}, ${fmt(range[1])}]` : "null");

const FORMATTERS = {
  onViewChange: (view) => `{ start: ${fmt(view.start)}, end: ${fmt(view.end)} }`,
  onBrush: formatRange,
  onBrushEnd: formatRange,
  onBlockClick: ({ block, range, completed, total }) =>
    `{ block: ${fmt(block)}, range: ${formatRange(range)}, completed: ${fmt(completed)}, total: ${fmt(total)} }`,
};

let config;
let map;
let source;
let running = true;
let elapsed = 0;

const readTotal = () => {
  const value = Math.floor(Number(fields.totalBlocks.value));
  const valid = Number.isFinite(value) && value >= 1 && value <= MAX_BLOCKS;
  return valid ? value : (config?.totalBlocks ?? PRESETS.streaming.totalBlocks);
};

const readDuration = () => {
  const value = Number(fields.duration.value);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_DURATION_S;
};

const readConfig = () => ({
  totalBlocks: readTotal(),
  source: fields.source.value,
  duration: readDuration(),
  targetFill: Number(fields.targetFill.value),
  partial: fields.partial.value,
  height: Number(fields.height.value),
  interactive: fields.interactive.checked,
  highlight: fields.highlight.checked,
  axis: fields.axis.checked,
  tickCount: fields.axis.checked ? fields.tickCount.value : "",
  brush: fields.brush.checked,
  tooltip: fields.tooltip.value,
  ...Object.fromEntries(CALLBACK_NAMES.map((name) => [name, fields[name].checked])),
});

const writeConfig = (values) => {
  for (const [name, value] of Object.entries(values)) {
    const field = fields[name];
    if (field.type === "checkbox") field.checked = value;
    else field.value = value;
  }
};

const report = (name, payload) => {
  if (!config[name]) return;
  $(`[data-event="${name}"] dd`).textContent = FORMATTERS[name](payload);
};

const mapOptions = (view) => {
  const options = {
    totalBlocks: config.totalBlocks,
    partial: config.partial,
    interactive: config.interactive,
    ...Object.fromEntries(CALLBACK_NAMES.map((name) => [name, (payload) => report(name, payload)])),
  };
  if (view) options.view = view;
  if (config.axis) options.axis = config.tickCount ? { tickCount: Number(config.tickCount) } : true;
  if (config.brush) options.brush = brush;
  if (config.tooltip === "off") options.tooltip = false;
  if (config.tooltip === "custom") {
    options.tooltip = ({ completed, total }) => `${fmt(completed)} / ${fmt(total)}`;
  }
  return options;
};

/** Construction-time options changed: build a new map and replay the data into it. */
const rebuild = (keepView) => {
  const view = keepView ? map?.getView() : undefined;
  const selection = keepView ? map?.getBrush() : null;
  map?.destroy();
  map = createBlockMap(container, mapOptions(view));
  source.replay(map);
  if (config.brush && selection) map.setBrush(selection);
};

const showProgress = () => {
  const { completed, total } = map.getProgress();
  const percent = ((completed / total) * PERCENT).toFixed(PERCENT_DIGITS);
  $("#progress").textContent = `${fmt(completed)} / ${fmt(total)} (${percent}%)`;
};

const hint = () => {
  if (!config.interactive) return HINTS.static;
  return config.brush ? HINTS.brush : HINTS.pan;
};

const renderChrome = () => {
  container.style.height = `${config.height}px`;
  fields.heightValue.value = `${config.height}px`;
  fields.targetFillValue.value = `${config.targetFill}%`;
  fields.tickCount.disabled = !config.axis;
  fields.onBrush.disabled = !config.brush;
  fields.onBrushEnd.disabled = !config.brush;
  $("#clear-brush").hidden = !config.brush;
  $("#toggle").textContent = running ? "Pause" : "Resume";
  $("#hint").textContent = hint();
  for (const name of CALLBACK_NAMES) {
    const row = $(`[data-event="${name}"]`);
    const shown = config[name] && (config.brush || !name.startsWith("onBrush"));
    if (row.hidden === shown) row.querySelector("dd").textContent = "waiting";
    row.hidden = !shown;
  }
};

const renderSnippets = () => {
  if (!config) return;
  $("#snippet-js").textContent = vanillaSnippet(config);
  $("#snippet-react").textContent = reactSnippet(config);
  $("#snippet-css").textContent = cssSnippet(config, theme.palette());
};

const startSource = () => {
  source = createSource(config.source, config.totalBlocks);
  elapsed = 0;
  running = true;
};

/** How many blocks should be complete by now, and how far through the run we are. */
const schedule = () => {
  const durationMs = config.duration * MS_PER_SECOND;
  const phase = durationMs === 0 ? 1 : Math.min(1, elapsed / durationMs);
  const target = (config.targetFill / PERCENT) * config.totalBlocks;
  return { phase, want: Math.round(phase * target) };
};

const update = () => {
  const previous = config;
  config = readConfig();
  const dataChanged =
    !previous || previous.totalBlocks !== config.totalBlocks || previous.source !== config.source;
  if (dataChanged) {
    startSource();
  }
  if (dataChanged || REBUILD_KEYS.some((key) => previous[key] !== config[key])) rebuild(!dataChanged);
  map.setHighlight(config.highlight);
  renderChrome();
  renderSnippets();
  showProgress();
};

const theme = createTheme({
  schemeSelect: $("#scheme"),
  colorInputs: [...form.querySelectorAll("[data-color]")],
  resetButton: $("#reset-colors"),
  onChange: renderSnippets,
});

const onFormEvent = (event) => {
  const target = event.target;
  if (target.id === "scheme" || target.hasAttribute("data-color")) return;
  if (event.type === "input" && target.name === "totalBlocks") return;
  update();
};
form.addEventListener("input", onFormEvent);
form.addEventListener("change", onFormEvent);
form.addEventListener("submit", (event) => event.preventDefault());

for (const button of form.querySelectorAll("[data-preset]")) {
  button.addEventListener("click", () => {
    writeConfig(PRESETS[button.dataset.preset]);
    update();
  });
}

$("#toggle").addEventListener("click", () => {
  running = !running;
  renderChrome();
});
$("#restart").addEventListener("click", () => {
  startSource();
  source.replay(map);
  renderChrome();
  showProgress();
});
$("#reset-view").addEventListener("click", () => map.resetView());
$("#clear-brush").addEventListener("click", () => map.setBrush(null));

const copyTimers = new WeakMap();
let lastMessage = "";

const announce = (button, ok) => {
  const tip = button.nextElementSibling;
  const base = ok ? "Copied" : "Copy failed";
  const message = base === lastMessage ? `${base}\u00A0` : base;
  lastMessage = message;
  clearTimeout(copyTimers.get(button));
  tip.textContent = "";
  requestAnimationFrame(() => {
    tip.textContent = message;
  });
  copyTimers.set(
    button,
    setTimeout(() => {
      tip.textContent = "";
    }, COPY_FEEDBACK_MS),
  );
};

const copy = async (button, target) => {
  try {
    await navigator.clipboard.writeText(target.innerText.trim());
    announce(button, true);
  } catch {
    announce(button, false);
  }
};

/** Invoker commands where the browser has them, a click listener where it does not. */
if ("CommandEvent" in window) {
  document.addEventListener(
    "command",
    (event) => {
      if (event.command === "--copy") copy(event.source, event.target);
    },
    true,
  );
} else {
  document.addEventListener("click", (event) => {
    const button = event.target.closest('button[command="--copy"]');
    const target = button && document.getElementById(button.getAttribute("commandfor"));
    if (target) copy(button, target);
  });
}

let lastProgress = 0;
let lastFrame = performance.now();
const frame = (now) => {
  if (running) elapsed += Math.min(now - lastFrame, MAX_FRAME_MS);
  lastFrame = now;
  const { phase, want } = schedule();
  if (running && map.getProgress().completed < want) source.advance(map, want, phase);
  if (now - lastProgress >= PROGRESS_INTERVAL_MS) {
    showProgress();
    lastProgress = now;
  }
  requestAnimationFrame(frame);
};

writeConfig(PRESETS.streaming);
update();
theme.apply();
requestAnimationFrame(frame);
