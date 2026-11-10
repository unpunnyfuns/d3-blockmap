/**
 * Colour scheme and palette for the configurator. The palette is written as
 * inline custom properties on <html>: the map re-reads its colours whenever
 * that element's style attribute changes.
 */

const STORAGE_KEY = "color-scheme";
const SYSTEM = "light dark";
const DARK_QUERY = "(prefers-color-scheme: dark)";

const PALETTES = {
  dark: {
    "--blockmap-missing": "#1f2430",
    "--blockmap-complete": "#3ddc84",
    "--blockmap-partial": "#f0b429",
    "--blockmap-partial-low": "#5a3d12",
    "--blockmap-partial-high": "#f0b429",
    "--blockmap-highlight": "#ff4d4f",
    "--blockmap-brush": "#9ecbff",
    "--blockmap-axis-color": "#8b93a7",
  },
  light: {
    "--blockmap-missing": "#e3e6ec",
    "--blockmap-complete": "#1a9e4b",
    "--blockmap-partial": "#ff8c00",
    "--blockmap-partial-low": "#ffd9a8",
    "--blockmap-partial-high": "#ff8c00",
    "--blockmap-highlight": "#d4380d",
    "--blockmap-brush": "#0b63ce",
    "--blockmap-axis-color": "#5b6472",
  },
};

const stored = () => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

const store = (scheme) => {
  try {
    if (scheme === SYSTEM) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, scheme);
  } catch {
    return;
  }
};

/**
 * Wires the scheme select and the colour inputs, and returns a getter for the
 * palette currently applied. `onChange` runs after every change.
 */
export const createTheme = ({ schemeSelect, colorInputs, resetButton, onChange }) => {
  const meta = document.querySelector('meta[name="color-scheme"]');
  const media = matchMedia(DARK_QUERY);
  const overrides = new Map();

  const resolved = () => {
    if (meta.content !== SYSTEM) return meta.content;
    return media.matches ? "dark" : "light";
  };

  const palette = () => ({ ...PALETTES[resolved()], ...Object.fromEntries(overrides) });

  const apply = () => {
    const colors = palette();
    for (const [name, value] of Object.entries(colors)) {
      document.documentElement.style.setProperty(name, value);
    }
    for (const input of colorInputs) input.value = colors[input.name];
    resetButton.disabled = overrides.size === 0;
    onChange();
  };

  const setScheme = (scheme) => {
    meta.content = scheme;
    schemeSelect.value = scheme;
    apply();
  };

  schemeSelect.addEventListener("change", () => {
    store(schemeSelect.value);
    setScheme(schemeSelect.value);
  });
  for (const input of colorInputs) {
    input.addEventListener("input", () => {
      overrides.set(input.name, input.value);
      apply();
    });
  }
  resetButton.addEventListener("click", () => {
    overrides.clear();
    apply();
  });
  media.addEventListener("change", apply);
  addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) setScheme(event.newValue ?? SYSTEM);
  });

  schemeSelect.value = stored() ?? SYSTEM;
  meta.content = schemeSelect.value;

  return { palette, apply };
};
