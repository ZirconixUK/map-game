/**
 * Mobile-ready map pane (pan + pinch zoom) + simple clue fog
 * - No "tap to set location" (tap/drag is only for panning)
 * - Uses Geolocation (watchPosition) when permission granted
 * - Static map.png as world; overlays are computed in map pixel coords and
 *   transformed along with the map.
 */

// ---- Config ----
const BBOX = {
  nw: { lat: 53.414443210551035, lon: -3.0047607421875 },
  se: { lat: 53.389880751560305, lon: -2.95806884765625 },
};

// ---- Optional: Google Street View Static API ----
// Used by the Photo → Glimpse tool. Leave blank to disable.
// Create a browser-restricted key and enable "Street View Static API".
// Set via js/secrets.js (gitignored) — see js/secrets.example.js.
const GOOGLE_STREETVIEW_API_KEY = window.GOOGLE_STREETVIEW_API_KEY || "AIzaSyDXvuatJSnLxTIZXcdALlQB2x6T7w_ecbE";
const STREETVIEW_SIZE = "640x640";
const STREETVIEW_FOV = 90;
// Smaller FOV = more zoomed/cropped. Snapshot is the core clue, so we keep it tighter.
const STREETVIEW_SNAPSHOT_FOV = 70;

// Curated snapshot parameter presets (optional). Picked randomly per round and then persisted.
// Keep this small to avoid wildly unfair snapshots.
// Starter snapshot tuning:
// - Slightly zoomed (lower FOV) so it's less "obvious"
// - Slightly downward pitch so we see more near-context (but not pure tarmac)

// ---- Phase 5: Echo Snapshots ----
// Buy extra angles by sampling a ring around the target pano and snapping to the nearest pano.
const ECHO_SNAPSHOT_INNER_M = 150;
const ECHO_SNAPSHOT_OUTER_M = 300;
const ECHO_SNAPSHOT_MAX_ATTEMPTS = 22;
const ECHO_SNAPSHOT_MIN_SEPARATION_M = 25; // reject if too close to an existing returned pano

const STREETVIEW_SNAPSHOT_PRESETS = [
  { fov: 45, pitch: -20 },
  { fov: 55, pitch: -18 },
  { fov: 60, pitch: -24 },
];
const STREETVIEW_PITCH = 0;
const STREETVIEW_HEADING = null; // null = let Google choose

// ---- Street View pano targets (Phase 1) ----
// When enabled, new targets are chosen as snapped Street View pano locations
// (via the Street View Metadata endpoint), and the round starts by showing
// a "Circle Snapshot" from that pano.
const USE_STREETVIEW_PANO_TARGETS = true;
const STREETVIEW_METADATA_RADIUS_M = 200;
const STREETVIEW_TARGET_MAX_ATTEMPTS = 25;

// ---- Phase 6: Distance-biased target picking ----
// We bias targets by distance from the round start (startLatLng).
// Probabilities:
// - 10%: > 2km
// - 60%: 0..1km
// - 30%: 1..2km
// (Matches your intent of 10% far, and the remainder split ~2/3 close, ~1/3 mid.)
const TARGET_BAND_PROB_FAR_GT_2KM = 0.10;
const TARGET_BAND_PROB_CLOSE_LE_1KM = 0.60;
const TARGET_BAND_PROB_MID_1_TO_2KM = 0.30;

const TARGET_BAND_CLOSE_MAX_M = 1000;
const TARGET_BAND_MID_MIN_M = 1000;
const TARGET_BAND_MID_MAX_M = 2000;
const TARGET_BAND_FAR_MIN_M = 2000;

// ---- Phase 2: Scoring + grading ----
// Distance is computed to the target pano location.
// Adjusted distance can optionally subtract GPS accuracy to be fair.
const USE_ACCURACY_ADJUSTED_DISTANCE = true;

// Grade thresholds as fractions of getModeTargetRadiusM() (short=500m, medium=1000m, long=1500m).
// Copper is ~the maximum target distance for the mode; all tiers scale proportionally.
const GRADE_THRESHOLDS_FRAC = [
  { label: 'Diamond',  frac: 0.04 },   // short ≤20m  | medium ≤40m  | long ≤60m
  { label: 'Emerald',  frac: 0.12 },   // short ≤60m  | medium ≤120m | long ≤180m
  { label: 'Platinum', frac: 0.24 },   // short ≤120m | medium ≤240m | long ≤360m
  { label: 'Gold',     frac: 0.44 },   // short ≤220m | medium ≤440m | long ≤660m
  { label: 'Silver',   frac: 0.68 },   // short ≤340m | medium ≤680m | long ≤1020m
  { label: 'Bronze',   frac: 0.92 },   // short ≤460m | medium ≤920m | long ≤1380m
  { label: 'Copper',   frac: Infinity },
];

// ---- Scoring v2 (grade-based + bonuses) ----
const GRADE_BASE_SCORES = {
  Diamond: 800, Emerald: 650, Platinum: 500, Gold: 375,
  Silver: 250, Bronze: 125, Copper: 50,
};
const SCORE_TIME_BONUS_MAX   = 150;
const SCORE_LENGTH_BONUS     = { short: 0, medium: 50, long: 100 };
const SCORE_DIFFICULTY_BONUS = { easy: 0, normal: 50, hard: 100 };
const SCORE_TOOL_EFFICIENCY  = [100, 90, 75, 60, 45, 30, 15, 0]; // index = tools used (capped at 7)

// Visual "corruption" overlay for the snapshot (CSS-only, no pixel access).
// 0..1 (higher = more glitch blocks)
const STREETVIEW_CORRUPTION_ENABLED = true;
const STREETVIEW_CORRUPTION_INTENSITY_SNAPSHOT = 0.85;
const STREETVIEW_CORRUPTION_INTENSITY_GLIMPSE = 0.60;


// Debug-friendly default spawn for new rounds (outside Lime Street Station).
// Used when debug mode is ON, or when there is no player location yet.
const DEFAULT_START_LATLNG = { lat: 53.40744, lon: -2.97785 };




// Default round timer (mode-specific later).
const ROUND_TIME_LIMIT_MS = 30 * 60 * 1000; // 30 minutes

// ---- Radar options per game mode ----
// Each entry is { m: distanceInMeters, heat: heatCost }.
// Order = button order (smallest → largest). Heat scales with radius.
const RADAR_OPTIONS_BY_MODE = {
  short:  [ {m:50,heat:0.2}, {m:100,heat:0.3}, {m:150,heat:0.4}, {m:250,heat:0.6}, {m:350,heat:0.8}, {m:400,heat:1.0} ],
  medium: [ {m:50,heat:0.2}, {m:100,heat:0.3}, {m:250,heat:0.4}, {m:400,heat:0.6}, {m:650,heat:0.8}, {m:800,heat:1.0} ],
  long:   [ {m:50,heat:0.2}, {m:100,heat:0.3}, {m:250,heat:0.4}, {m:500,heat:0.6}, {m:900,heat:0.8}, {m:1200,heat:1.0} ],
};

// ---- Question costs (placeholder; can be individualized later) ----
const QUESTION_TIME_COST_MS = 5 * 60 * 1000; // 5 minutes
const QUESTION_HEAT_COST = 0.5;

// ---- Thermometer options per game mode ----
// Each entry is { m: distanceInMeters, heat: heatCost }.
// Shorter distances are more precise clues → cost more heat.
const THERMO_OPTIONS_BY_MODE = {
  short:  [ {m:100, heat:0.4}, {m:140, heat:0.3}, {m:180, heat:0.2} ],
  medium: [ {m:150, heat:0.4}, {m:220, heat:0.3}, {m:300, heat:0.2} ],
  long:   [ {m:200, heat:0.4}, {m:350, heat:0.3}, {m:500, heat:0.2} ],
};
