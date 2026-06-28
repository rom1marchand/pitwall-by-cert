// stint-engine.js — Stint planner API client + shared helpers

const STINT_API = 'http://localhost:5000/api/stint-plan'

const StintPlanAPI = {
  async calculate(scenarioId, params, drivers, weatherWindows, tyreConfigs) {
    const res = await fetch(`${STINT_API}/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenario_id: scenarioId, params, drivers,
        weather_windows: weatherWindows, tyre_configs: tyreConfigs,
      }),
    })
    if (!res.ok) throw new Error(`Calculate failed: ${res.status}`)
    return res.json()
  },

  async adjustStint(scenarioId, stintIndex, changes) {
    const res = await fetch(`${STINT_API}/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario_id: scenarioId, stint_index: stintIndex, changes }),
    })
    if (!res.ok) throw new Error(`Adjust failed: ${res.status}`)
    return res.json()
  },

  async addStint(scenarioId, afterIndex) {
    const res = await fetch(`${STINT_API}/add-stint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario_id: scenarioId, after_index: afterIndex }),
    })
    if (!res.ok) throw new Error(`Add stint failed: ${res.status}`)
    return res.json()
  },

  async removeStint(scenarioId, stintIndex) {
    const res = await fetch(`${STINT_API}/remove-stint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario_id: scenarioId, stint_index: stintIndex }),
    })
    if (!res.ok) throw new Error(`Remove stint failed: ${res.status}`)
    return res.json()
  },

  async save(scenarioId, name) {
    const res = await fetch(`${STINT_API}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario_id: scenarioId, name }),
    })
    return res.json()
  },

  async load(scenarioId) {
    const res = await fetch(`${STINT_API}/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario_id: scenarioId }),
    })
    return res.json()
  },

  async listSaved() {
    const res = await fetch(`${STINT_API}/list-saved`)
    return res.json()
  },

  async deleteSaved(scenarioId) {
    const res = await fetch(`${STINT_API}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario_id: scenarioId }),
    })
    return res.json()
  },

  async listScenarios() {
    const res = await fetch(`${STINT_API}/scenarios`)
    return res.json()
  },

  async getDrivers(scenarioId) {
    const res = await fetch(`${STINT_API}/drivers?scenario_id=${encodeURIComponent(scenarioId)}`)
    return res.json()
  },

  async importMotec(scenarioId, laps) {
    const res = await fetch(`${STINT_API}/import-motec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario_id: scenarioId, laps }),
    })
    return res.json()
  },

  async getTyreInventory(scenarioId) {
    const res = await fetch(`${STINT_API}/tyre-inventory?scenario_id=${encodeURIComponent(scenarioId)}`)
    return res.json()
  },

  async updateTyreHealth(scenarioId, tyreId, healthPct) {
    const res = await fetch(`${STINT_API}/tyre-update-health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario_id: scenarioId, tyre_id: tyreId, health_pct: healthPct }),
    })
    return res.json()
  },
}

// ── FORMAT HELPERS ──

function fmtDuration(s) {
  if (!s || s <= 0) return '0:00'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

function fmtLapTime(s) {
  if (!s || s <= 0) return '\u2014'
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, '0')}`
}

function parseLapTime(str) {
  const m = str.match(/^(\d+):(\d{2})\.(\d{1,3})$/)
  if (!m) return null
  return parseInt(m[1]) * 60 + parseInt(m[2]) + parseInt(m[3].padEnd(3, '0')) / 1000
}

function avgTyreHealth(health) {
  if (!health) return 0
  return (health.fl + health.fr + health.rl + health.rr) / 4
}

function tyreHealthColor(pct) {
  if (pct > 60) return 'var(--lime)'
  if (pct > 30) return '#ff8c00'
  return '#ff3b3b'
}

function compoundBadge(compound, compounds) {
  const c = (compounds || {})[compound] || {}
  return `<span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;font-size:9px;font-weight:900;color:#000;background:${c.color || '#FFD700'}">${c.short || '?'}</span>`
}

// ── CONSTANTS ──

const DRIVER_COLORS = ['#C8FF00', '#3b8fff', '#ff8c00', '#ff3b3b', '#b44fff', '#00ffcc', '#ff69b4', '#ffd700']
const CORNER_LABELS = { fl: 'FL', fr: 'FR', rl: 'RL', rr: 'RR' }
const CORNERS = ['fl', 'fr', 'rl', 'rr']
const CPDS = {
  hard:   { s: 'H', c: '#FFFFFF', label: 'Hard' },
  medium: { s: 'M', c: '#FFD700', label: 'Medium' },
  soft:   { s: 'S', c: '#FF3B3B', label: 'Soft' },
  inter:  { s: 'I', c: '#22C55E', label: 'Inter' },
  wet:    { s: 'W', c: '#3B8FFF', label: 'Wet' },
}

// ── VEHICLE CATEGORIES ──

const CATEGORIES = {
  hypercar: { label: 'Hypercar', short: 'HY', fuel: 80, hasVE: true, tyres: 48 },
  lmp2:     { label: 'LMP2',     short: 'LMP2', fuel: 75, fuelShort: 63, hasVE: false, tyres: 56 },
  lmp3:     { label: 'LMP3',     short: 'LMP3', fuel: 55, hasVE: false, tyres: 48 },
  gte:      { label: 'GTE',      short: 'GTE', fuel: 100, hasVE: false, tyres: 60 },
  lmgt3:    { label: 'LMGT3',    short: 'GT3', fuel: 120, hasVE: true, tyres: 60 },
  custom:   { label: 'Custom',   short: 'CUS', fuel: 91, hasVE: false, tyres: 999 },
}

const CAT_COLORS = {
  hypercar: '#e11d48',
  lmp2:     '#3b8fff',
  lmp3:     '#a855f7',
  gte:      '#22c55e',
  lmgt3:    '#ff8c00',
  custom:   '#888',
}

// ── SERIES ──
const SERIES_LIST = [
  { id: 'wec',  label: 'WEC',  logo: 'assets/champ/wec.svg' },
  { id: 'elms', label: 'ELMS', logo: 'assets/champ/elms.svg' },
]

// ── CAR REGISTRY (LMU vehicles) ──
// key = internal id (matches vehFile model code), cat = category, thumb = 397 generic thumbnail prefix
const CARS = {
  // Hypercar
  'ALPINE':   { label: 'Alpine A424',              cat: 'hypercar', thumb: '397_25_ALPINE' },
  'AMVALK':   { label: 'Aston Martin Valkyrie LMH', cat: 'hypercar', thumb: '397_25_AMVALK' },
  'BMWMH':    { label: 'BMW M Hybrid V8',          cat: 'hypercar', thumb: '397_25_BMWMH' },
  'VLMDH':    { label: 'Cadillac V-Series.R',      cat: 'hypercar', thumb: '397_25_VLMDH' },
  '499P':     { label: 'Ferrari 499P',             cat: 'hypercar', thumb: '397_25_499P' },
  'GMR001':   { label: 'Genesis GMR-001',          cat: 'hypercar', thumb: '397_26_GMR001' },
  'GLICK':    { label: 'Glickenhaus 007',          cat: 'hypercar', thumb: '397_23_GLICK' },
  'ISOTTA':   { label: 'Isotta Fraschini T12',     cat: 'hypercar', thumb: '397_24_ISOTTA' },
  'SC63':     { label: 'Lamborghini SC63',         cat: 'hypercar', thumb: '397_24_SC63' },
  '9X8W':     { label: 'Peugeot 9X8',             cat: 'hypercar', thumb: '397_25_9X8W' },
  '963':      { label: 'Porsche 963',              cat: 'hypercar', thumb: '397_25_963' },
  'GR010':    { label: 'Toyota GR010',             cat: 'hypercar', thumb: '397_25_GR010' },
  'VANWALL':  { label: 'Vanwall Vandervell LMH',   cat: 'hypercar', thumb: '397_23_VANWALL' },
  // LMP2
  'ORECA07':  { label: 'Oreca 07',                 cat: 'lmp2',     thumb: '397_25_ORECA07' },
  // LMP3
  'D09P3':    { label: 'Duqueine D09 P3',          cat: 'lmp3',     thumb: '397_25_D09P3' },
  'G61LTP3EVO': { label: 'Ginetta G61-LT-P3 Evo', cat: 'lmp3',     thumb: '397_25_G61LTP3EVO' },
  'JSP325':   { label: 'Ligier JS P325',           cat: 'lmp3',     thumb: '397_25_JSP325' },
  // GTE (legacy)
  'C8RGTE':   { label: 'Corvette C8.R GTE',        cat: 'gte',      thumb: '397_23_C8RGTE' },
  '488GTE':   { label: 'Ferrari 488 GTE Evo',      cat: 'gte',      thumb: '397_23_488GTE' },
  '911GTE':   { label: 'Porsche 911 RSR-19',       cat: 'gte',      thumb: '397_23_911GTE' },
  // LMGT3
  'AMV':      { label: 'Aston Martin Vantage GT3',  cat: 'lmgt3',    thumb: '397_25_AMV' },
  'BMW':      { label: 'BMW M4 GT3',                cat: 'lmgt3',    thumb: '397_25_BMW' },
  'Z06GT3R':  { label: 'Corvette Z06 GT3.R',       cat: 'lmgt3',    thumb: '397_25_Z06GT3R' },
  '296GT3':   { label: 'Ferrari 296 GT3',           cat: 'lmgt3',    thumb: '397_25_296GT3' },
  'MUSTANG':  { label: 'Ford Mustang GT3',          cat: 'lmgt3',    thumb: '397_25_MUSTANG' },
  'HURACAN':  { label: 'Lamborghini Huracan GT3',   cat: 'lmgt3',    thumb: '397_24_HURACAN' },
  'LEXUS':    { label: 'Lexus RC F GT3',            cat: 'lmgt3',    thumb: '397_25_LEXUS' },
  'MCLAREN':  { label: 'McLaren 720S GT3 Evo',     cat: 'lmgt3',    thumb: '397_25_MCLAREN' },
  'AMG':      { label: 'Mercedes-AMG GT3',          cat: 'lmgt3',    thumb: '397_25_AMG' },
  '911GT3R':  { label: 'Porsche 911 GT3 R',        cat: 'lmgt3',    thumb: '397_25_911GT3R' },
}

function carFrontThumb(carId) {
  const car = CARS[carId]
  if (!car) return 'assets/cars_thumbnail/placeholder_car.png'
  return `assets/cars_thumbnail/FrontThumbnail/${car.thumb}_frontAngle.webp`
}
function carTopDown(carId) {
  const car = CARS[carId]
  if (!car) return 'assets/cars_thumbnail/placeholder_car.png'
  return `assets/cars_thumbnail/topDownRotated/${car.thumb}_topDown.webp`
}
function carsForCategory(catId) {
  return Object.entries(CARS).filter(([_, c]) => c.cat === catId)
}

// Detect car model from a Race Control S3 URL
// e.g. ".../397_25_911GT3R/..." → "911GT3R" → matches CARS entry
// Matches on model code only (ignores year prefix like 397_XX_)
// Legacy model codes that were renamed across seasons
const MODEL_ALIASES = { '9X8': '9X8W' }

function detectCarFromLiveryUrl(url) {
  if (!url) return null
  // Extract the 397_XX_MODEL segment from the URL path
  const m = url.match(/397_\d{2}(?:ELMS)?_([A-Z0-9_]+)/i)
  if (!m) return null
  let urlModel = m[1].toUpperCase()
  if (MODEL_ALIASES[urlModel]) urlModel = MODEL_ALIASES[urlModel]
  for (const [id, car] of Object.entries(CARS)) {
    // Extract model code from thumb: "397_25_AMV" → "AMV"
    const thumbModel = car.thumb.replace(/^397_\d{2}(?:ELMS)?_/i, '').toUpperCase()
    if (urlModel === thumbModel) {
      return { id, label: car.label, cat: car.cat }
    }
  }
  return null
}

// ── TYRE ICONS ──
// Maps compound name → PNG asset path (in assets/svg/)
const TYRE_ICONS = {
  hard:   'assets/svg/tyre_hard.png',
  medium: 'assets/svg/tyre_medium.png',
  soft:   'assets/svg/tyre_soft.png',
  inter:  'assets/svg/tyre_undef.png',
  wet:    'assets/svg/tyre_wet.png',
}
function tyreIconSrc(compound) {
  return TYRE_ICONS[compound] || TYRE_ICONS.medium
}

// ── PIT STOP FORMULA (LMU values) ──
// 4 tyres = 12s, 2 same axle = 12s, 2 cross-axle = 6s, 1 tyre = 6s

const PIT_FUEL_BASE_S = 7.7
const PIT_FUEL_PER_LITRE_S = 0.53
const PIT_TYRES_4_S = 12.0
const PIT_TYRES_2_SAME_S = 12.0
const PIT_TYRES_2_CROSS_S = 6.0
const PIT_TYRES_1_S = 6.0

function estimateTyreTime(tyreCorners) {
  if (!tyreCorners || tyreCorners.length === 0) return 0
  const n = tyreCorners.length
  if (n >= 4) return PIT_TYRES_4_S
  if (n === 1) return PIT_TYRES_1_S
  if (n === 2) {
    const fronts = tyreCorners.filter(c => c === 'fl' || c === 'fr').length
    const rears = tyreCorners.filter(c => c === 'rl' || c === 'rr').length
    if (fronts === 2 || rears === 2) return PIT_TYRES_2_SAME_S
    return PIT_TYRES_2_CROSS_S
  }
  return PIT_TYRES_4_S // 3 tyres = same as 4
}

function estimatePitTime(fuelVolume, tyreCorners, driverSwap) {
  const tFuel = fuelVolume > 0 ? PIT_FUEL_BASE_S + fuelVolume * PIT_FUEL_PER_LITRE_S : 0
  const tTyres = estimateTyreTime(tyreCorners)
  return Math.max(tFuel, tTyres) + (driverSwap ? 15 : 0)
}

// ── LIFT & COAST ──
const LC_MAX_SAVE_PCT = 1.45 / 3.45 // ~42%
const LC_TIME_PENALTY_S = 0.7

function lcCalc(baseConsumption, lcPct) {
  if (lcPct <= 0) return { adjusted: baseConsumption, penalty: 0, saved: 0 }
  const intensity = Math.min(100, lcPct) / 100
  const savePct = LC_MAX_SAVE_PCT * intensity
  const adjusted = baseConsumption * (1 - savePct)
  const penalty = LC_TIME_PENALTY_S * intensity
  return { adjusted: +adjusted.toFixed(3), penalty: +penalty.toFixed(3), saved: +(baseConsumption - adjusted).toFixed(3) }
}

// ── WEATHER SLOTS (LMU style) ──
const WEATHER_SLOTS = [
  { pct: 0,   label: '0%',   emoji: '\u2600\uFE0F', desc: 'Clear sky' },
  { pct: 25,  label: '25%',  emoji: '\u{1F324}',     desc: 'Mostly sunny, slight chance' },
  { pct: 50,  label: '50%',  emoji: '\u26C5',         desc: 'Partly cloudy, may rain' },
  { pct: 75,  label: '75%',  emoji: '\u{1F326}',     desc: 'Likely rain' },
  { pct: 100, label: '100%', emoji: '\u{1F327}',     desc: 'Heavy rain guaranteed' },
]
