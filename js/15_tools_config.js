// ---- Tools config (JSON-driven costs & options metadata) ----
window.TOOLS_CONFIG = null;

// Runtime radar cost map populated by updateRadarMenuForMode().
// Keyed by String(meters) → heat cost for the current game mode.
window.__radarCostMap = {};

// Runtime thermometer cost map populated by updateThermoMenuForMode().
// Keyed by String(meters) → heat cost for the current game mode.
window.__thermoCostMap = {};

function getToolCosts(toolId, optionId) {
  // Radar costs are mode-dependent; use the live map when available.
  if (toolId === 'radar' && optionId != null) {
    const key = String(optionId);
    const map = window.__radarCostMap;
    if (map && typeof map[key] === 'number') {
      return { heat_cost: map[key] };
    }
  }

  // Thermometer costs are also mode-dependent.
  if (toolId === 'thermometer' && optionId != null) {
    const key = String(optionId);
    const map = window.__thermoCostMap;
    if (map && typeof map[key] === 'number') {
      return { heat_cost: map[key] };
    }
  }

  const cfg = window.TOOLS_CONFIG;
  const fallback = {
    heat_cost: (typeof QUESTION_HEAT_COST === "number" ? QUESTION_HEAT_COST : 0.5),
  };
  if (!cfg || !cfg.tools || !cfg.tools[toolId]) return fallback;
  const t = cfg.tools[toolId];
  const baseRaw = (t.default && typeof t.default === "object") ? t.default : fallback;
  const base = {
    heat_cost: (typeof baseRaw.heat_cost === 'number') ? baseRaw.heat_cost : fallback.heat_cost,
  };

  if (!optionId || !Array.isArray(t.options)) return base;
  const opt = t.options.find(o => String(o.id) === String(optionId));
  if (opt && opt.cost && typeof opt.cost === "object") {
    return {
      heat_cost: (typeof opt.cost.heat_cost === "number") ? opt.cost.heat_cost : base.heat_cost,
    };
  }
  return base;
}

// Rebuilds the 6 radar buttons to match the current game mode's distance options,
// and refreshes the runtime cost map so getToolCosts() stays accurate.
function updateRadarMenuForMode() {
  try {
    const mode = (typeof window.getSelectedGameLength === 'function')
      ? window.getSelectedGameLength()
      : 'short';

    const opts = (typeof RADAR_OPTIONS_BY_MODE !== 'undefined' && RADAR_OPTIONS_BY_MODE[mode])
      ? RADAR_OPTIONS_BY_MODE[mode]
      : RADAR_OPTIONS_BY_MODE['short'];

    // Rebuild cost map for this mode.
    const costMap = {};
    opts.forEach(o => { costMap[String(o.m)] = o.heat; });
    window.__radarCostMap = costMap;

    // Update each button in the radar submenu.
    const btns = document.querySelectorAll('#radarMenu [data-radar]');
    btns.forEach((btn, i) => {
      const opt = opts[i];
      if (!opt) return;
      const label = opt.m >= 1000 ? `${opt.m / 1000}km` : `${opt.m}m`;
      btn.setAttribute('data-radar', String(opt.m));

      // Update the label text node (first text child of the inner span).
      const labelSpan = btn.querySelector('.flex-1');
      if (labelSpan) {
        // Replace the text node before the costRow div.
        const costRow = labelSpan.querySelector('.costRow');
        // Clear existing text nodes, preserve the costRow child.
        Array.from(labelSpan.childNodes).forEach(node => {
          if (node.nodeType === Node.TEXT_NODE) node.remove();
        });
        labelSpan.insertBefore(document.createTextNode(label), costRow || null);
      }
    });

    // Refresh cost badges now that data-radar values have changed.
    try { if (typeof updateCostBadgesFromConfig === 'function') updateCostBadgesFromConfig(); } catch(e) {}
  } catch(e) {
    console.error('updateRadarMenuForMode error:', e);
  }
}

window.updateRadarMenuForMode = updateRadarMenuForMode;

// Rebuilds the 3 thermometer buttons to match the current game mode's distance options.
function updateThermoMenuForMode() {
  try {
    const mode = (typeof window.getSelectedGameLength === 'function')
      ? window.getSelectedGameLength()
      : 'short';

    const opts = (typeof THERMO_OPTIONS_BY_MODE !== 'undefined' && THERMO_OPTIONS_BY_MODE[mode])
      ? THERMO_OPTIONS_BY_MODE[mode]
      : THERMO_OPTIONS_BY_MODE['short'];

    // Rebuild cost map for this mode.
    const costMap = {};
    opts.forEach(o => { costMap[String(o.m)] = o.heat; });
    window.__thermoCostMap = costMap;

    // Update each button in the thermo submenu.
    const btns = document.querySelectorAll('#thermoMenu [data-thermo]');
    btns.forEach((btn, i) => {
      const opt = opts[i];
      if (!opt) return;
      const label = opt.m >= 1000 ? `${opt.m / 1000}km` : `${opt.m}m`;
      btn.setAttribute('data-thermo', String(opt.m));

      // Update the label text node (first text child of the inner span).
      const labelSpan = btn.querySelector('.flex-1');
      if (labelSpan) {
        const costRow = labelSpan.querySelector('.costRow');
        Array.from(labelSpan.childNodes).forEach(node => {
          if (node.nodeType === Node.TEXT_NODE) node.remove();
        });
        labelSpan.insertBefore(document.createTextNode(label), costRow || null);
      }
    });

    // Refresh cost badges now that data-thermo values have changed.
    try { if (typeof updateCostBadgesFromConfig === 'function') updateCostBadgesFromConfig(); } catch(e) {}
  } catch(e) {
    console.error('updateThermoMenuForMode error:', e);
  }
}

window.updateThermoMenuForMode = updateThermoMenuForMode;

function updateCostBadgesFromConfig() {
  const map = [
    { toolId: "radar", selector: "[data-radar]", getOption: (el) => el.getAttribute("data-radar") },
    { toolId: "thermometer", selector: "[data-thermo]", getOption: (el) => el.getAttribute("data-thermo") },
    { toolId: "nsew", selector: "[data-dir]", getOption: (el) => el.getAttribute("data-dir") },
    { toolId: "landmark", selector: "[data-landmark]", getOption: (el) => el.getAttribute("data-landmark") },
    { toolId: "photo", selector: "[data-photo]", getOption: (el) => el.getAttribute("data-photo") },
  ];
  map.forEach(({toolId, selector, getOption}) => {
    document.querySelectorAll(selector).forEach(btn => {
      const optId = getOption(btn);
      let cost = getToolCosts(toolId, optId);

      // Photo costs are dynamic per round:
      // - Starter photo is always free
      // - Extra photos become free to re-open after purchase
      // - Uncorrupt becomes free once applied
      try {
        if (toolId === 'photo') {
          const id = String(optId || '').toLowerCase();
          const rs = (typeof window.getRoundStateV1 === 'function') ? window.getRoundStateV1() : null;
          const photos = (rs && Array.isArray(rs.photos)) ? rs.photos : [];

          if (id === 'starter') {
            cost = { heat_cost: 0 };
          }

          if (id === 'near100' || id === 'near200') {
            const owned = photos.some(p => p && String(p.kind) === id && p.url);
            if (owned) cost = { heat_cost: 0 };
          }

          if (id === 'uncorrupt') {
            const done = (rs && rs.photosUncorrupted) ? true : false;
            if (done) cost = { heat_cost: 0 };
          }

          // heat5 curse blocks extra photos — mark button visually
          const isCurseBlocked = (id === 'near100' || id === 'near200') &&
            typeof window.isCurseActive === 'function' && window.isCurseActive('heat5');
          btn.classList.toggle('cursed', !!isCurseBlocked);
        }
      } catch(e) {}
      // Apply active curse surcharges to the displayed cost.
      let curseSurcharge = 0;
      let isCursed = false;
      try {
        if (typeof window.isCurseActive === 'function') {
          if (window.isCurseActive('heat1')) { curseSurcharge += 0.25; isCursed = true; }
          if (window.isCurseActive('heat2')) { curseSurcharge += 0.5; isCursed = true; }
        }
      } catch(e) {}

      const displayedHeat = cost.heat_cost + curseSurcharge;

      const row = btn.querySelector(".costRow");
      if (!row) return;
      const items = row.querySelectorAll(".costItem");
      if (items.length >= 1) {
        items[0].textContent = `🔥 ${Number(displayedHeat).toFixed(1)}`;
        // Purple badge when a cost-surcharge curse is active
        if (isCursed && curseSurcharge > 0 && cost.heat_cost > 0) {
          items[0].style.color = '#c084fc';
          items[0].style.backgroundColor = 'rgba(88,28,135,0.30)';
          items[0].style.borderColor = 'rgba(168,85,247,0.40)';
        } else {
          items[0].style.color = '';
          items[0].style.backgroundColor = '';
          items[0].style.borderColor = '';
        }
      }
      if (items.length >= 2) items[1].style.display = 'none';
    });
  });
}

async function loadToolsConfig() {
  try {
    const res = await fetch("tools.json", { cache: "no-store" });
    if (!res.ok) throw new Error("tools.json not found");
    window.TOOLS_CONFIG = await res.json();
    updateCostBadgesFromConfig();
  } catch (e) {
    window.TOOLS_CONFIG = null;
  }
}

loadToolsConfig();
window.updateCostBadgesFromConfig = updateCostBadgesFromConfig;
window.getToolCosts = getToolCosts;
