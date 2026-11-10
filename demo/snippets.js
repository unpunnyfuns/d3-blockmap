/**
 * Turns the configurator's settings into copyable code. Only options that
 * differ from the library defaults are written out.
 */

const PACKAGE = "@unpunnyfuns/d3-blockmap";
const GROUP_SIZE = 3;
const CUSTOM_TOOLTIP = "({ completed, total }) => `${completed} / ${total}`";

const CALLBACKS = [
  ["onViewChange", "view"],
  ["onBrush", "selection"],
  ["onBrushEnd", "selection"],
  ["onBlockClick", "event"],
];

/** Library defaults, so the CSS snippet lists only what the page changed. */
const LIBRARY_THEME = {
  "--blockmap-missing": "#2b2b2b",
  "--blockmap-complete": "#2ecc71",
  "--blockmap-partial": "#e0a500",
  "--blockmap-partial-low": "#5b3a00",
  "--blockmap-partial-high": "#e0a500",
  "--blockmap-highlight": "#ff4d4f",
  "--blockmap-brush": "#ffffff",
  "--blockmap-axis-color": "currentColor",
};

const grouped = (value) => {
  const digits = String(value);
  const head = digits.length % GROUP_SIZE || GROUP_SIZE;
  const tail = digits.slice(head).match(/\d{3}/g) ?? [];
  return [digits.slice(0, head), ...tail].join("_");
};

const activeCallbacks = (config) =>
  CALLBACKS.filter(([name]) => config[name] && (config.brush || !name.startsWith("onBrush")));

const axisValue = (config) => (config.tickCount ? `{ tickCount: ${config.tickCount} }` : "true");

export const vanillaSnippet = (config) => {
  const options = [
    `totalBlocks: ${grouped(config.totalBlocks)},`,
    config.partial !== "coverage" && `partial: '${config.partial}',`,
    !config.interactive && "interactive: false,",
    config.axis && `axis: ${axisValue(config)},`,
    config.brush && "brush,",
    config.tooltip === "off" && "tooltip: false,",
    config.tooltip === "custom" && `tooltip: ${CUSTOM_TOOLTIP},`,
    ...activeCallbacks(config).map(([name, arg]) => `${name}: (${arg}) => console.log(${arg}),`),
  ].filter(Boolean);

  return [
    `import { createBlockMap } from '${PACKAGE}';`,
    config.brush && `import { brush } from '${PACKAGE}/brush';`,
    "",
    "const map = createBlockMap(document.querySelector('.progress'), {",
    ...options.map((line) => `  ${line}`),
    "});",
    config.highlight && "\nmap.setHighlight(true);",
  ]
    .filter((line) => line !== false)
    .join("\n");
};

export const reactSnippet = (config) => {
  const stableAxis = config.axis && Boolean(config.tickCount);
  const props = [
    `totalBlocks={${grouped(config.totalBlocks)}}`,
    config.partial !== "coverage" && `partial="${config.partial}"`,
    !config.interactive && "interactive={false}",
    config.axis && (stableAxis ? "axis={AXIS}" : "axis"),
    config.brush && "brush={brush}",
    config.tooltip === "off" && "tooltip={false}",
    config.tooltip === "custom" && `tooltip={${CUSTOM_TOOLTIP}}`,
    config.highlight && "highlight",
    ...activeCallbacks(config).map(([name, arg]) => `${name}={(${arg}) => console.log(${arg})}`),
    'className="progress"',
  ].filter(Boolean);

  return [
    `import { BlockMap } from '${PACKAGE}/react';`,
    config.brush && `import { brush } from '${PACKAGE}/brush';`,
    "",
    stableAxis && `const AXIS = ${axisValue(config)};\n`,
    "export const Progress = () => (",
    "  <BlockMap",
    ...props.map((line) => `    ${line}`),
    "  />",
    ");",
  ]
    .filter((line) => line !== false)
    .join("\n");
};

export const cssSnippet = (config, palette) => {
  const changed = Object.entries(palette).filter(([name, value]) => LIBRARY_THEME[name] !== value);
  return [
    ".progress {",
    `  height: ${config.height}px;`,
    ...changed.map(([name, value]) => `  ${name}: ${value};`),
    "}",
  ].join("\n");
};
