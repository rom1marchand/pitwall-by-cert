// telemetry-channels.js
//
// Catalogue central des channels et math-channels affichables dans le
// Telemetry Analyzer. Chaque entrée définit les couleurs, unités et plages
// Y par défaut pour un canal donné, utilisables par toutes les sheets.
//
// Les plages Y peuvent être :
//   - numériques  : { yMin: 0, yMax: 350 }
//   - 'auto'      : calculé au load depuis le min/max observé
//   - 'auto105'   : max observé × 1.05 (= 105% pour laisser une marge visuelle)
//   - 'auto-5'    : min observé × 1.05 ou -5% d'amplitude (même logique "marge")
//
// Les math channels ont `source: 'math'` et seront calculés via
// telemetry-maths.js lors de leur première utilisation.

;(function (root) {
  'use strict'

  // ── Palette Pitwall ──────────────────────────────────────────────────────
  const C = {
    lime:        '#C8FF00',
    green:       '#3bff5c',
    green_soft:  '#7fe39f',
    red:         '#ff3b3b',
    red_dark:    '#c71d1d',
    blue:        '#3b8fff',
    blue_dark:   '#1e4fc0',
    cyan:        '#00ffff',
    yellow:      '#ffff00',
    orange:      '#ff8c00',
    purple:      '#a855f7',
    white:       '#e8e8e8',
    light_green: '#7fff9f',
    light_blue:  '#7fb8ff',
  }

  // ── Helpers formatage ────────────────────────────────────────────────────
  const pct01 = v => Math.round(v * 100)           // 0..1 → 0..100
  const asInt = v => Math.round(v)

  // ── Définition des channels ──────────────────────────────────────────────
  // Format : key: { label, color, unit, yMin, yMax, source, fmtY?, stepped?, primary? }
  //
  // primary = true marque le channel comme "channel maître" du graph quand
  // il est mélangé à d'autres (Speed au-dessus de Throttle/Brake, etc.)
  //
  // source = 'channel' : lu directement depuis sample[key]
  // source = 'math'    : calculé via TelemetryMaths.compute(key, lap, snapshot)

  const CHANNELS = {
    // ═══ RAW CHANNELS ═══════════════════════════════════════════════════════
    speed_kmh:      { label: 'Speed',    unit: 'km/h', color: C.blue,       yMin: 0,  yMax: 'auto105', source: 'channel', primary: true },
    throttle:       { label: 'Throttle', unit: '%',    color: C.green,      yMin: -0.05, yMax: 1.05,   source: 'channel', fmtY: pct01 },
    brake:          { label: 'Brake',    unit: '%',    color: C.red,        yMin: -0.05, yMax: 1.05,   source: 'channel', fmtY: pct01 },
    gear:           { label: 'Gear',     unit: '',     color: C.light_blue, yMin: -1, yMax: 8,         source: 'channel', stepped: true, fmtY: asInt },
    rpm:            { label: 'RPM',      unit: '',     color: C.blue_dark,  yMin: 4000, yMax: 'auto105', source: 'channel' },
    steering:       { label: 'Steer',    unit: '',     color: C.cyan,       yMin: -1, yMax: 1,         source: 'channel' },
    fuel_liters:    { label: 'Fuel',     unit: 'L',    color: C.lime,       yMin: 0,  yMax: 'auto105', source: 'channel' },
    virtual_energy: { label: 'V-Energy', unit: '%',    color: C.purple,     yMin: 0,  yMax: 100,       source: 'channel' },

    // Tyre temps (average per corner — LMU sim_info gives one value per corner)
    tyre_temp_fl:   { label: 'FL', unit: '°C', color: C.yellow, yMin: 'auto', yMax: 'auto105', source: 'channel' },
    tyre_temp_fr:   { label: 'FR', unit: '°C', color: C.yellow, yMin: 'auto', yMax: 'auto105', source: 'channel' },
    tyre_temp_rl:   { label: 'RL', unit: '°C', color: C.yellow, yMin: 'auto', yMax: 'auto105', source: 'channel' },
    tyre_temp_rr:   { label: 'RR', unit: '°C', color: C.yellow, yMin: 'auto', yMax: 'auto105', source: 'channel' },

    // Positions (utilisées pour la track map, pas rendues en graph)
    pos_x:          { label: 'PosX', unit: 'm', color: C.white, yMin: 'auto', yMax: 'auto', source: 'channel' },
    pos_z:          { label: 'PosZ', unit: 'm', color: C.white, yMin: 'auto', yMax: 'auto', source: 'channel' },

    // Raw channels that may or may not be present in the current snapshot
    // format. If absent, the trace just renders empty (no crash).
    tyre_pressure_fl: { label: 'Pres FL', unit: 'kPa', color: C.orange, yMin: 'auto', yMax: 'auto105', source: 'channel' },
    tyre_pressure_fr: { label: 'Pres FR', unit: 'kPa', color: C.orange, yMin: 'auto', yMax: 'auto105', source: 'channel' },
    tyre_pressure_rl: { label: 'Pres RL', unit: 'kPa', color: C.orange, yMin: 'auto', yMax: 'auto105', source: 'channel' },
    tyre_pressure_rr: { label: 'Pres RR', unit: 'kPa', color: C.orange, yMin: 'auto', yMax: 'auto105', source: 'channel' },

    brake_temp_fl:    { label: 'Brake FL', unit: '°C', color: C.red_dark, yMin: 'auto', yMax: 'auto105', source: 'channel' },
    brake_temp_fr:    { label: 'Brake FR', unit: '°C', color: C.red_dark, yMin: 'auto', yMax: 'auto105', source: 'channel' },
    brake_temp_rl:    { label: 'Brake RL', unit: '°C', color: C.red_dark, yMin: 'auto', yMax: 'auto105', source: 'channel' },
    brake_temp_rr:    { label: 'Brake RR', unit: '°C', color: C.red_dark, yMin: 'auto', yMax: 'auto105', source: 'channel' },

    tyre_wear_fl:     { label: 'Wear FL', unit: '°', color: C.orange, yMin: 0, yMax: 1000, source: 'channel' },
    tyre_wear_fr:     { label: 'Wear FR', unit: '°', color: C.orange, yMin: 0, yMax: 1000, source: 'channel' },
    tyre_wear_rl:     { label: 'Wear RL', unit: '°', color: C.orange, yMin: 0, yMax: 1000, source: 'channel' },
    tyre_wear_rr:     { label: 'Wear RR', unit: '°', color: C.orange, yMin: 0, yMax: 1000, source: 'channel' },

    // Suspension travel / damper velocity — may be absent depending on sim
    sus_travel_lf:    { label: 'Sus Trav LF', unit: 'mm',    color: C.light_green, yMin: 'auto', yMax: 'auto105', source: 'channel' },
    sus_travel_rf:    { label: 'Sus Trav RF', unit: 'mm',    color: C.light_green, yMin: 'auto', yMax: 'auto105', source: 'channel' },
    sus_travel_lr:    { label: 'Sus Trav LR', unit: 'mm',    color: C.light_green, yMin: 'auto', yMax: 'auto105', source: 'channel' },
    sus_travel_rr:    { label: 'Sus Trav RR', unit: 'mm',    color: C.light_green, yMin: 'auto', yMax: 'auto105', source: 'channel' },
    damper_vel_fl:    { label: 'Damp V FL',   unit: 'mm/s',  color: C.white,       yMin: 'auto', yMax: 'auto105', source: 'channel' },
    damper_vel_fr:    { label: 'Damp V FR',   unit: 'mm/s',  color: C.white,       yMin: 'auto', yMax: 'auto105', source: 'channel' },
    damper_vel_rl:    { label: 'Damp V RL',   unit: 'mm/s',  color: C.white,       yMin: 'auto', yMax: 'auto105', source: 'channel' },
    damper_vel_rr:    { label: 'Damp V RR',   unit: 'mm/s',  color: C.white,       yMin: 'auto', yMax: 'auto105', source: 'channel' },

    g_lat:            { label: 'G Lat',  unit: 'G', color: C.cyan,   yMin: -3, yMax: 3, source: 'channel' },
    g_lon:            { label: 'G Lon',  unit: 'G', color: C.purple, yMin: -3, yMax: 3, source: 'channel' },

    // ═══ MATH CHANNELS ═════════════════════════════════════════════════════
    // These are resolved at render time by TelemetryMaths.compute()

    // LIFT : 1 pendant les zones lift, 0 ailleurs. Rendu "highlight" (zones
    // coloriées) plutôt que ligne continue — le renderer phase 5 gérera ça.
    lift:             { label: 'LIFT', unit: '',  color: C.light_green, yMin: 0, yMax: 1, source: 'math', fmtY: asInt, stepped: true, highlight: true },

    // Tyre temp "avg" (multi-point) — utilisé quand un .ld MoTeC contient
    // Tyre Temp Inner/Outer/Centre séparés
    tyre_temp_fl_avg: { label: 'FL Avg', unit: '°C', color: C.yellow, yMin: 'auto', yMax: 'auto105', source: 'math' },
    tyre_temp_fr_avg: { label: 'FR Avg', unit: '°C', color: C.yellow, yMin: 'auto', yMax: 'auto105', source: 'math' },
    tyre_temp_rl_avg: { label: 'RL Avg', unit: '°C', color: C.yellow, yMin: 'auto', yMax: 'auto105', source: 'math' },
    tyre_temp_rr_avg: { label: 'RR Avg', unit: '°C', color: C.yellow, yMin: 'auto', yMax: 'auto105', source: 'math' },

    tyre_temp_fl_oi_diff: { label: 'FL O-I', unit: '°C', color: C.yellow, yMin: -20, yMax: 20, source: 'math' },
    tyre_temp_fr_oi_diff: { label: 'FR O-I', unit: '°C', color: C.yellow, yMin: -20, yMax: 20, source: 'math' },
    tyre_temp_rl_oi_diff: { label: 'RL O-I', unit: '°C', color: C.yellow, yMin: -20, yMax: 20, source: 'math' },
    tyre_temp_rr_oi_diff: { label: 'RR O-I', unit: '°C', color: C.yellow, yMin: -20, yMax: 20, source: 'math' },

    // Ride heights (par lap) — dérivés de sus_travel_* avec damper_zero
    ride_height_lf:   { label: 'RH LF', unit: 'mm', color: C.red,  yMin: 'auto', yMax: 'auto105', source: 'math' },
    ride_height_rf:   { label: 'RH RF', unit: 'mm', color: C.red,  yMin: 'auto', yMax: 'auto105', source: 'math' },
    ride_height_lr:   { label: 'RH LR', unit: 'mm', color: C.red,  yMin: 'auto', yMax: 'auto105', source: 'math' },
    ride_height_rr:   { label: 'RH RR', unit: 'mm', color: C.red,  yMin: 'auto', yMax: 'auto105', source: 'math' },

    // Averages F/R pour SUSP Travel sheet
    ride_height_f:    { label: 'RH Front', unit: 'mm', color: C.red,   yMin: 'auto', yMax: 'auto105', source: 'math' },
    ride_height_r:    { label: 'RH Rear',  unit: 'mm', color: C.red,   yMin: 'auto', yMax: 'auto105', source: 'math' },

    // Condition flags
    is1st:            { label: 'in 1st', unit: '', color: C.blue, yMin: 0, yMax: 1, source: 'math', stepped: true },
    is2nd:            { label: 'in 2nd', unit: '', color: C.blue, yMin: 0, yMax: 1, source: 'math', stepped: true },
    is3rd:            { label: 'in 3rd', unit: '', color: C.blue, yMin: 0, yMax: 1, source: 'math', stepped: true },
    is4th:            { label: 'in 4th', unit: '', color: C.blue, yMin: 0, yMax: 1, source: 'math', stepped: true },
    is5th:            { label: 'in 5th', unit: '', color: C.blue, yMin: 0, yMax: 1, source: 'math', stepped: true },
    is6th:            { label: 'in 6th', unit: '', color: C.blue, yMin: 0, yMax: 1, source: 'math', stepped: true },
    is_wot:           { label: 'WOT',    unit: '', color: C.green, yMin: 0, yMax: 1, source: 'math', stepped: true },
    is_2nd_wot:       { label: '2nd WOT',unit: '', color: C.green, yMin: 0, yMax: 1, source: 'math', stepped: true },
    is_3rd_wot:       { label: '3rd WOT',unit: '', color: C.green, yMin: 0, yMax: 1, source: 'math', stepped: true },

    // Trackbump
    trackbump:        { label: 'Trackbump',       unit: 'mm/s', color: C.blue,  yMin: -500, yMax: 500, source: 'math' },
    trackbump_front:  { label: 'Trackbump Front', unit: 'mm/s', color: C.blue,  yMin: -500, yMax: 500, source: 'math' },
    trackbump_rear:   { label: 'Trackbump Rear',  unit: 'mm/s', color: C.blue,  yMin: -500, yMax: 500, source: 'math' },

    // Dynamique
    inverse_corner_radius: { label: '1/R corner', unit: '', color: C.white, yMin: -0.02, yMax: 0.02, source: 'math' },
    yaw_rate:              { label: 'Yaw Rate',    unit: 'rad/s', color: C.white, yMin: -2, yMax: 2, source: 'math' },
    oversteer:             { label: 'Oversteer',   unit: 'rad',   color: C.purple, yMin: -0.3, yMax: 0.3, source: 'math' },
    oversteer_speed_w:     { label: 'Oversteer SW', unit: 'rad',  color: C.purple, yMin: -0.3, yMax: 0.3, source: 'math' },

    // Derivatives
    damper_acc_fl:    { label: 'Damp Acc FL', unit: 'm/s²', color: C.orange, yMin: 'auto', yMax: 'auto105', source: 'math' },

    // NEW: Delta Time (time slip vs. fastest lap) — MoTeC-style reference comparison.
    // Negative = ahead of reference, positive = behind. Plot height should let the
    // trace breathe around 0; ±2 s is enough for intra-session comparisons.
    delta_time:       { label: 'Delta T', unit: 's', color: C.purple, yMin: -2, yMax: 2, source: 'math' },
  }

  // ── Plages par défaut pour les groupes utilisés dans les sheets ──────────
  // (un "group" = un graph = un bloc canvas contenant 1..N traces)
  //
  // makeGraph(id, label, traceKeys[], opts?) construit un graph en piochant
  // dans CHANNELS. Si une key n'existe pas, un warning console l'indique
  // mais rien ne casse (le renderer verra une trace "unknown" et l'ignorera).

  function makeGraph(id, label, traceKeys, opts = {}) {
    const traces = []
    for (const key of traceKeys) {
      const def = CHANNELS[key]
      if (!def) {
        console.warn(`[TelemetryChannels] Unknown channel "${key}" in graph "${id}"`)
        continue
      }
      traces.push({
        key,
        label:    def.label,
        unit:     def.unit,
        color:    def.color,
        yMin:     def.yMin,
        yMax:     def.yMax,
        source:   def.source,
        stepped:  def.stepped || false,
        fmtY:     def.fmtY || null,
        highlight: def.highlight || false,
        primary:   def.primary || false,
      })
    }
    return {
      id,
      label,
      height:   opts.height   || 120,
      visible:  opts.visible !== false,
      type:     opts.type     || 'trace',     // 'trace' | 'histogram' | 'trackmap'
      traces,
      reference_lines: opts.reference_lines || [],
    }
  }

  // ── Résolution des plages Y 'auto' et 'auto105' après chargement snapshot
  //
  // Appelée UNE fois après load pour figer les yMin/yMax auto sur toutes
  // les traces de toutes les sheets. Modifie en place.

  function resolveAutoRanges(workspace, snapshot) {
    if (!snapshot || !snapshot.laps) return
    // Pré-calcul : min/max par channel key (sur tous les laps)
    const stats = {}
    for (const lap of snapshot.laps) {
      if (!lap.samples) continue
      for (const s of lap.samples) {
        for (const k in s) {
          if (k === 't') continue
          const v = s[k]
          if (typeof v !== 'number' || !isFinite(v)) continue
          if (!stats[k]) stats[k] = { min: v, max: v }
          else {
            if (v < stats[k].min) stats[k].min = v
            if (v > stats[k].max) stats[k].max = v
          }
        }
      }
    }
    // Applique aux traces
    for (const sheet of workspace.sheets) {
      for (const g of sheet.graphs) {
        for (const tr of g.traces) {
          const st = stats[tr.key]
          if (!st) continue   // channel absent → on garde les valeurs d'origine
          if (tr.yMin === 'auto')     tr.yMin = Math.floor(st.min)
          if (tr.yMin === 'auto-5')   tr.yMin = st.min - 0.05 * Math.abs(st.max - st.min)
          if (tr.yMax === 'auto')     tr.yMax = Math.ceil(st.max)
          if (tr.yMax === 'auto105')  tr.yMax = st.max * 1.05 + 1e-6
        }
      }
    }
  }

  // ── API publique ──────────────────────────────────────────────────────────
  root.TelemetryChannels = {
    CHANNELS,
    COLORS: C,
    get(key) { return CHANNELS[key] || null },
    makeGraph,
    resolveAutoRanges,
  }
})(typeof window !== 'undefined' ? window : globalThis)
