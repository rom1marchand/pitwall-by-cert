// telemetry-maths.js
//
// Moteur de calcul des math-channels. Réimplémente en JS hard-codé une partie
// des expressions MoTeC (voir MOTEC-Exemple/Maths/*.xml pour référence) ainsi
// que les math channels spécifiques à Pitwall (LIFT, etc.).
//
// Usage :
//   const values = TelemetryMaths.compute('lift', lap, snapshot)
//   // -> Float32Array aligné sur lap.samples.length
//
// Les résultats sont mis en cache par (lap.lap_num, mathKey) pour éviter de
// recalculer à chaque frame.
//
// Ajout d'un nouveau math channel : registerMath(key, { needs, compute }).
// - needs : liste de sample-fields requis (les samples sans ces fields
//           retourneront NaN pour la math → trace vide).
// - compute(lap, snapshot) : doit retourner un array de lap.samples.length.

;(function (root) {
  'use strict'

  const _registry = new Map()

  function registerMath(key, def) {
    _registry.set(key, def)
  }

  // ── CACHE (WeakMap par lap, Map key→result) ──────────────────────────────
  // WeakMap permet au GC de jeter le cache quand le lap est libéré.
  let _cache = new WeakMap()

  function _getCached(lap, key) {
    const lapCache = _cache.get(lap)
    return lapCache ? lapCache.get(key) : undefined
  }

  function _setCached(lap, key, arr) {
    let lapCache = _cache.get(lap)
    if (!lapCache) { lapCache = new Map(); _cache.set(lap, lapCache) }
    lapCache.set(key, arr)
  }

  // FIX: invalidate() now also drops the per-lap `_cache` object (set by
  // telemetry-analyse.html's _lapPoints) so hiding a lap frees BOTH the
  // math-channel Float32Arrays AND the {x,y} point arrays. WeakMap alone
  // was not enough because the lap object stays referenced by snapshot.laps.
  function invalidate(lap) {
    if (lap) {
      _cache.delete(lap)
      // Drop the point cache too (populated by the analyser's _lapPoints).
      if (lap._cache) lap._cache = null
    } else {
      // WeakMap has no .clear() — swap in a fresh one to drop all entries.
      _cache = new WeakMap()
    }
  }

  // ── POINT D'ENTRÉE ───────────────────────────────────────────────────────
  // Renvoie un array de lap.samples.length. Si la math est inconnue ou si
  // des channels requis manquent, retourne un array de NaN (trace vide).

  function compute(key, lap, snapshot) {
    if (!lap || !lap.samples || !lap.samples.length) return new Float32Array(0)

    const cached = _getCached(lap, key)
    if (cached) return cached

    const def = _registry.get(key)
    const n = lap.samples.length
    let result

    if (!def) {
      // Math inconnue → array de NaN (trace invisible)
      result = new Float32Array(n)
      result.fill(NaN)
    } else {
      try {
        result = def.compute(lap, snapshot)
        if (!(result instanceof Float32Array)) {
          // Autorise les Array normaux, on convertit
          result = Float32Array.from(result)
        }
      } catch (e) {
        console.warn(`[TelemetryMaths] compute("${key}") failed:`, e)
        result = new Float32Array(n)
        result.fill(NaN)
      }
    }

    _setCached(lap, key, result)
    return result
  }

  // ── HELPERS ──────────────────────────────────────────────────────────────

  function _emptyNaN(n) {
    const a = new Float32Array(n)
    a.fill(NaN)
    return a
  }

  // Récupère un channel "maison" depuis les samples (retourne Float32Array
  // ou null si le channel est absent de tous les samples)
  function _pluck(lap, fieldName) {
    const n = lap.samples.length
    const out = new Float32Array(n)
    let anyFound = false
    for (let i = 0; i < n; i++) {
      const v = lap.samples[i][fieldName]
      if (typeof v === 'number' && isFinite(v)) { out[i] = v; anyFound = true }
      else out[i] = NaN
    }
    return anyFound ? out : null
  }

  // ═══ MATHS HARD-CODÉS ═══════════════════════════════════════════════════

  // ── LIFT ──────────────────────────────────────────────────────────────
  // Zone où throttle < 5% ET brake < 5%, d'une durée minimale de 0.05 s.
  // Valeurs binaires 0/1 ; le renderer peut les afficher en highlight.
  //
  // La contrainte "durée minimale" filtre le bruit : les transitions
  // throttle→brake passent par quelques samples à 0/0, qui seraient sinon
  // marqués comme lift alors que c'est juste la transition.

  registerMath('lift', {
    needs: ['throttle', 'brake'],
    compute(lap) {
      const n = lap.samples.length
      const out = new Float32Array(n)
      const THR_MAX = 0.05
      const BRK_MAX = 0.05
      const MIN_DUR_MS = 50

      // 1er passage : marque les samples candidats
      const candidate = new Uint8Array(n)
      for (let i = 0; i < n; i++) {
        const s = lap.samples[i]
        const th = (s.throttle != null ? s.throttle : 1)
        const br = (s.brake    != null ? s.brake    : 1)
        // Normalise 0..100 → 0..1 si nécessaire
        const thN = th > 1.5 ? th / 100 : th
        const brN = br > 1.5 ? br / 100 : br
        candidate[i] = (thN <= THR_MAX && brN <= BRK_MAX) ? 1 : 0
      }

      // 2e passage : ne garde que les runs ≥ MIN_DUR_MS
      let i = 0
      while (i < n) {
        if (!candidate[i]) { out[i] = 0; i++; continue }
        let j = i
        while (j < n && candidate[j]) j++
        const runMs = (lap.samples[j - 1].t - lap.samples[i].t)
        if (runMs >= MIN_DUR_MS) {
          for (let k = i; k < j; k++) out[k] = 1
        } else {
          for (let k = i; k < j; k++) out[k] = 0
        }
        i = j
      }
      return out
    }
  })

  // ── TYRE TEMP AVG (sur samples avec inner/outer/centre séparés) ─────────
  // Les .pwtel actuels n'ont qu'une valeur par coin (tyre_temp_fl).
  // Fallback : renvoie tyre_temp_<corner> tel quel quand _inner/_outer/_centre
  // ne sont pas dispos.
  for (const corner of ['fl', 'fr', 'rl', 'rr']) {
    registerMath(`tyre_temp_${corner}_avg`, {
      needs: [],
      compute(lap) {
        const n = lap.samples.length
        const out = new Float32Array(n)
        const keyInner  = `tyre_temp_${corner}_inner`
        const keyOuter  = `tyre_temp_${corner}_outer`
        const keyCentre = `tyre_temp_${corner}_centre`
        const keyRaw    = `tyre_temp_${corner}`
        for (let i = 0; i < n; i++) {
          const s = lap.samples[i]
          const ci = s[keyInner], co = s[keyOuter], cc = s[keyCentre]
          if (ci != null && co != null && cc != null) {
            out[i] = (ci + co + cc) / 3
          } else if (s[keyRaw] != null) {
            out[i] = s[keyRaw]
          } else {
            out[i] = NaN
          }
        }
        return out
      }
    })

    registerMath(`tyre_temp_${corner}_oi_diff`, {
      needs: [],
      compute(lap) {
        const n = lap.samples.length
        const out = new Float32Array(n)
        const keyInner = `tyre_temp_${corner}_inner`
        const keyOuter = `tyre_temp_${corner}_outer`
        for (let i = 0; i < n; i++) {
          const s = lap.samples[i]
          if (s[keyInner] != null && s[keyOuter] != null) {
            out[i] = s[keyOuter] - s[keyInner]
          } else out[i] = NaN
        }
        return out
      }
    })
  }

  // ── CONDITIONS (gear / WOT) ─────────────────────────────────────────────
  for (const g of [1, 2, 3, 4, 5, 6]) {
    registerMath(`is${g === 1 ? '1st' : g === 2 ? '2nd' : g === 3 ? '3rd' : g + 'th'}`, {
      needs: ['gear'],
      compute(lap) {
        const n = lap.samples.length
        const out = new Float32Array(n)
        for (let i = 0; i < n; i++) {
          const gv = lap.samples[i].gear
          out[i] = (gv === g) ? 1 : 0
        }
        return out
      }
    })
  }

  registerMath('is_wot', {
    needs: ['throttle'],
    compute(lap) {
      const n = lap.samples.length
      const out = new Float32Array(n)
      for (let i = 0; i < n; i++) {
        const th = lap.samples[i].throttle
        if (th == null) { out[i] = 0; continue }
        const thN = th > 1.5 ? th / 100 : th
        out[i] = (thN >= 0.99) ? 1 : 0
      }
      return out
    }
  })

  registerMath('is_2nd_wot', {
    needs: ['throttle', 'gear'],
    compute(lap) {
      const n = lap.samples.length
      const out = new Float32Array(n)
      for (let i = 0; i < n; i++) {
        const s = lap.samples[i]
        const thN = s.throttle > 1.5 ? s.throttle / 100 : s.throttle
        out[i] = (s.gear === 2 && thN >= 0.99) ? 1 : 0
      }
      return out
    }
  })

  registerMath('is_3rd_wot', {
    needs: ['throttle', 'gear'],
    compute(lap) {
      const n = lap.samples.length
      const out = new Float32Array(n)
      for (let i = 0; i < n; i++) {
        const s = lap.samples[i]
        const thN = s.throttle > 1.5 ? s.throttle / 100 : s.throttle
        out[i] = (s.gear === 3 && thN >= 0.99) ? 1 : 0
      }
      return out
    }
  })

  // ── TRACKBUMP (moyenne des damper velocities, nul sous 10 km/h) ─────────
  function _trackbumpCompute(cornerKeys, lap) {
    const n = lap.samples.length
    const out = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const s = lap.samples[i]
      const sp = s.speed_kmh
      if (sp == null || sp < 10) { out[i] = NaN; continue }
      let sum = 0, count = 0
      for (const k of cornerKeys) {
        if (s[k] != null) { sum += s[k]; count++ }
      }
      out[i] = count === cornerKeys.length ? sum / count : NaN
    }
    return out
  }
  registerMath('trackbump',       { needs: [], compute(lap) { return _trackbumpCompute(['damper_vel_fl','damper_vel_fr','damper_vel_rl','damper_vel_rr'], lap) } })
  registerMath('trackbump_front', { needs: [], compute(lap) { return _trackbumpCompute(['damper_vel_fl','damper_vel_fr'], lap) } })
  registerMath('trackbump_rear',  { needs: [], compute(lap) { return _trackbumpCompute(['damper_vel_rl','damper_vel_rr'], lap) } })

  // ── DAMPER_ZERO ─────────────────────────────────────────────────────────
  // 1 quand toutes les damper velocities sont ~0 ET sus_travel L/R égales
  // ET speed ~0. Utilisé comme référence pour calculer la hauteur statique.
  registerMath('damper_zero', {
    needs: [],
    compute(lap) {
      const n = lap.samples.length
      const out = new Float32Array(n)
      const VTOL = 0.005
      const TTOL = 0.005
      for (let i = 0; i < n; i++) {
        const s = lap.samples[i]
        const dv = ['damper_vel_fl','damper_vel_fr','damper_vel_rl','damper_vel_rr']
        let ok = true
        for (const k of dv) {
          const v = s[k]
          if (v == null || Math.abs(v) > VTOL) { ok = false; break }
        }
        if (ok) {
          const tFlRf = (s.sus_travel_lf ?? 0) - (s.sus_travel_rf ?? 0)
          const tLrRr = (s.sus_travel_lr ?? 0) - (s.sus_travel_rr ?? 0)
          if (Math.abs(tFlRf) > TTOL || Math.abs(tLrRr) > TTOL) ok = false
          if ((s.speed_kmh ?? 1) > 0.005) ok = false
        }
        out[i] = ok ? 1 : 0
      }
      return out
    }
  })

  // ── RIDE HEIGHT (par-lap, version simplifiée) ──────────────────────────
  // Concept MoTeC : stat_end('SUS_TRAVEL_x', damper_zero==1, range_change("Laps"))
  // → récupère la dernière valeur de sus_travel pendant un "stationnement"
  //   dans le lap, soustraire à la valeur courante pour avoir le RH dynamique.
  //
  // Version Pitwall simplifiée : on prend le MAX de sus_travel_x sur le lap
  // comme "static compression" (= position la plus étendue du ressort quand
  // la voiture est au repos ou en line droite). Approximation correcte pour
  // un usage visuel.
  function _rideHeightCompute(cornerKey, lap) {
    const travel = _pluck(lap, cornerKey)
    if (!travel) return _emptyNaN(lap.samples.length)
    let staticComp = -Infinity
    for (let i = 0; i < travel.length; i++) {
      if (!isNaN(travel[i]) && travel[i] > staticComp) staticComp = travel[i]
    }
    if (staticComp === -Infinity) return _emptyNaN(travel.length)
    const out = new Float32Array(travel.length)
    for (let i = 0; i < travel.length; i++) {
      out[i] = isNaN(travel[i]) ? NaN : (staticComp - travel[i])
    }
    return out
  }
  registerMath('ride_height_lf', { needs: ['sus_travel_lf'], compute(lap) { return _rideHeightCompute('sus_travel_lf', lap) } })
  registerMath('ride_height_rf', { needs: ['sus_travel_rf'], compute(lap) { return _rideHeightCompute('sus_travel_rf', lap) } })
  registerMath('ride_height_lr', { needs: ['sus_travel_lr'], compute(lap) { return _rideHeightCompute('sus_travel_lr', lap) } })
  registerMath('ride_height_rr', { needs: ['sus_travel_rr'], compute(lap) { return _rideHeightCompute('sus_travel_rr', lap) } })

  registerMath('ride_height_f', {
    needs: ['sus_travel_lf', 'sus_travel_rf'],
    compute(lap, snapshot) {
      const lf = compute('ride_height_lf', lap, snapshot)
      const rf = compute('ride_height_rf', lap, snapshot)
      const n = Math.min(lf.length, rf.length)
      const out = new Float32Array(n)
      for (let i = 0; i < n; i++) out[i] = (lf[i] + rf[i]) / 2
      return out
    }
  })
  registerMath('ride_height_r', {
    needs: ['sus_travel_lr', 'sus_travel_rr'],
    compute(lap, snapshot) {
      const lr = compute('ride_height_lr', lap, snapshot)
      const rr = compute('ride_height_rr', lap, snapshot)
      const n = Math.min(lr.length, rr.length)
      const out = new Float32Array(n)
      for (let i = 0; i < n; i++) out[i] = (lr[i] + rr[i]) / 2
      return out
    }
  })

  // ── DYNAMIQUE : inverse corner radius, yaw rate, oversteer ─────────────
  registerMath('inverse_corner_radius', {
    needs: ['speed_kmh'],
    compute(lap) {
      const n = lap.samples.length
      const out = new Float32Array(n)
      for (let i = 0; i < n; i++) {
        const s = lap.samples[i]
        const sp = s.speed_kmh ?? 0
        const gl = s.g_lat
        if (sp <= 30 || gl == null) { out[i] = 0; continue }
        const spMs = sp / 3.6
        out[i] = gl / (spMs * spMs)
      }
      return out
    }
  })

  registerMath('yaw_rate', {
    needs: ['speed_kmh'],
    compute(lap) {
      const n = lap.samples.length
      const out = new Float32Array(n)
      for (let i = 0; i < n; i++) {
        const s = lap.samples[i]
        const sp = s.speed_kmh ?? 0
        const gl = s.g_lat
        if (sp <= 30 || gl == null) { out[i] = 0; continue }
        const spMs = sp / 3.6
        out[i] = gl / spMs
      }
      return out
    }
  })

  // Oversteer (version simplifiée avec wheelbase fixe — l'utilisateur pourra
  // l'override plus tard si on ajoute une config par voiture).
  const WHEELBASE_M = 2.645  // valeur par défaut MoTeC User.xml
  registerMath('oversteer', {
    needs: [],
    compute(lap) {
      const n = lap.samples.length
      const out = new Float32Array(n)
      // 1er passage : calcule l'expression brute
      const raw = new Float32Array(n)
      // stat_mean(steered_angle * g_lat) — moyenne sur le lap entier
      let meanProduct = 0, pc = 0
      for (let i = 0; i < n; i++) {
        const s = lap.samples[i]
        const sa = s.steering
        const gl = s.g_lat
        if (sa != null && gl != null) { meanProduct += sa * gl; pc++ }
      }
      meanProduct = pc > 0 ? meanProduct / pc : 0
      const signMean = Math.sign(meanProduct) || 1
      for (let i = 0; i < n; i++) {
        const s = lap.samples[i]
        const sp = s.speed_kmh ?? 0
        const gl = s.g_lat
        const sa = s.steering
        if (sp < 50 || gl == null || sa == null) { raw[i] = 0; continue }
        const spMs = sp / 3.6
        const term1 = (WHEELBASE_M * gl) / (spMs * spMs)
        raw[i] = Math.sign(gl) * (term1 - signMean * sa)
      }
      // Lissage (EMA pour émuler le smooth(..., 0.2) MoTeC)
      const ALPHA = 0.2
      let ema = raw[0]
      for (let i = 0; i < n; i++) {
        ema = ALPHA * raw[i] + (1 - ALPHA) * ema
        out[i] = ema
      }
      return out
    }
  })

  registerMath('oversteer_speed_w', {
    needs: [],
    compute(lap, snapshot) {
      const n = lap.samples.length
      const base = compute('oversteer', lap, snapshot)
      const out = new Float32Array(n)
      for (let i = 0; i < n; i++) {
        const sp = lap.samples[i].speed_kmh ?? 0
        out[i] = (sp / 80) * base[i]
      }
      return out
    }
  })

  // ── DAMPER ACCELERATION FL ──────────────────────────────────────────────
  // Dérivée temporelle de damper_vel_fl. Formule : (v[i] - v[i-1]) / dt
  //
  // FIX: protection contre les dt ~0 causés par les paquets UDP dupliqués
  // (horodatage identique à l'échantillon précédent). Avant, la division
  // produisait Infinity/NaN ; désormais on hérite simplement de out[i-1].
  // Seuil : 0.1 ms (paquets sub-millisecondes = doublons pour de l'ACC/iRacing).
  const DT_EPS_S = 0.0001
  registerMath('damper_acc_fl', {
    needs: ['damper_vel_fl'],
    compute(lap) {
      const n = lap.samples.length
      const vel = _pluck(lap, 'damper_vel_fl')
      if (!vel) return _emptyNaN(n)
      const out = new Float32Array(n)
      out[0] = 0
      for (let i = 1; i < n; i++) {
        const dt = (lap.samples[i].t - lap.samples[i - 1].t) / 1000
        if (isNaN(vel[i]) || isNaN(vel[i - 1])) { out[i] = NaN; continue }
        // FIX: dt too small (or non-positive) → reuse previous acceleration
        // rather than dividing by ~0 and polluting the trace with Inf/NaN.
        if (dt <= DT_EPS_S) { out[i] = out[i - 1]; continue }
        out[i] = (vel[i] - vel[i - 1]) / dt
      }
      return out
    }
  })

  // ── DELTA TIME (time slip vs. fastest lap) ─────────────────────────────
  // NEW: MoTeC-style "time slip" channel. For each sample of the active lap,
  // compares its elapsed time vs. the reference (fastest) lap's elapsed time
  // at the SAME lap_distance. Negative = ahead of reference; positive = behind.
  //
  // Reference-lap selection mirrors the UI heuristic in telemetry-analyse.html
  // (_computeLapMetadata): exclude out/in laps, require ≥ 60 s, pick minimum
  // duration. The reference can also be forced via snapshot._refLapNum.
  //
  // Interpolation: the ref lap's (distance → time) mapping is built once per
  // call, then each active-lap sample does a linear interp between the two
  // nearest ref samples using a monotonic walking index (O(n) total, not O(n²)).

  function _findRefLap(snapshot, fallbackLap) {
    if (!snapshot || !snapshot.laps) return null
    const laps = snapshot.laps
    // Optional override: caller can set snapshot._refLapNum to force a lap.
    if (snapshot._refLapNum != null) {
      const forced = laps.find(l => l.lap_num === snapshot._refLapNum)
      if (forced && forced.samples && forced.samples.length > 1) return forced
    }
    let best = null, bestDur = Infinity
    for (let i = 0; i < laps.length; i++) {
      if (i === 0 || i === laps.length - 1) continue   // skip out/in laps
      const l = laps[i]
      if (!l.samples || l.samples.length < 2) continue
      const dur = (l.samples[l.samples.length - 1].t - l.samples[0].t) / 1000
      if (dur < 60) continue
      if (dur < bestDur) { bestDur = dur; best = l }
    }
    if (best) return best
    // Fallback: the longest lap we have, any lap (very short recording).
    let maxDur = -1
    for (const l of laps) {
      if (!l.samples || l.samples.length < 2) continue
      const dur = (l.samples[l.samples.length - 1].t - l.samples[0].t) / 1000
      if (dur > maxDur) { maxDur = dur; best = l }
    }
    return best || fallbackLap || null
  }

  registerMath('delta_time', {
    needs: [],
    compute(lap, snapshot) {
      const n = lap.samples.length
      const out = new Float32Array(n)
      const ref = _findRefLap(snapshot, lap)
      // No usable reference → delta is 0 everywhere (self-comparison).
      if (!ref || ref === lap) { out.fill(0); return out }

      // Build ref's (distance → elapsed-time) arrays, filtering samples that
      // lack lap_distance. Distances are monotonic increasing within a lap.
      const rs = ref.samples
      const refD0 = rs[0].lap_distance ?? 0
      const refT0 = rs[0].t
      const refD = new Float64Array(rs.length)
      const refT = new Float64Array(rs.length)
      let m = 0
      let lastDist = -Infinity
      for (let i = 0; i < rs.length; i++) {
        const s = rs[i]
        if (s.lap_distance == null || !isFinite(s.lap_distance)) continue
        const d = s.lap_distance - refD0
        // Guard against non-monotonic distance (rare, e.g. lap wrap mid-stream).
        if (d <= lastDist) continue
        refD[m] = d
        refT[m] = (s.t - refT0) / 1000
        lastDist = d
        m++
      }
      if (m < 2) { out.fill(NaN); return out }

      const lapD0 = lap.samples[0].lap_distance ?? 0
      const lapT0 = lap.samples[0].t
      let j = 0   // monotonic walking index into refD

      for (let i = 0; i < n; i++) {
        const s = lap.samples[i]
        if (s.lap_distance == null || !isFinite(s.lap_distance)) {
          out[i] = NaN; continue
        }
        const d = s.lap_distance - lapD0
        const tLap = (s.t - lapT0) / 1000

        // Advance j so refD[j] <= d < refD[j+1] (or clamp at edges).
        while (j < m - 1 && refD[j + 1] <= d) j++
        let tRef
        if (d <= refD[0])        tRef = refT[0]
        else if (d >= refD[m-1]) tRef = refT[m-1]
        else {
          const d1 = refD[j], d2 = refD[j + 1]
          const t1 = refT[j], t2 = refT[j + 1]
          const span = d2 - d1
          const frac = span > 0 ? (d - d1) / span : 0
          tRef = t1 + frac * (t2 - t1)
        }
        out[i] = tLap - tRef
      }
      return out
    }
  })

  // ── HISTOGRAM (utilitaire, pas un math channel) ────────────────────────
  // Distribution d'un channel sur un lap : renvoie un array [bucketCount]
  // de pourcentages de temps passés dans chaque bucket.
  // Utilisé par la sheet SUSP HISTO (phase 5).
  function histogram(lap, key, bucketCount = 64, min, max) {
    const samples = lap.samples
    if (!samples || !samples.length) return null
    let lo = min, hi = max
    if (lo == null || hi == null) {
      lo = +Infinity; hi = -Infinity
      for (const s of samples) {
        const v = s[key]
        if (typeof v === 'number' && isFinite(v)) {
          if (v < lo) lo = v
          if (v > hi) hi = v
        }
      }
      if (lo === +Infinity) return null
    }
    const span = hi - lo || 1
    const buckets = new Uint32Array(bucketCount)
    let total = 0
    for (const s of samples) {
      const v = s[key]
      if (typeof v !== 'number' || !isFinite(v)) continue
      const idx = Math.min(bucketCount - 1, Math.max(0, Math.floor(((v - lo) / span) * bucketCount)))
      buckets[idx]++
      total++
    }
    if (!total) return null
    const pct = new Float32Array(bucketCount)
    for (let i = 0; i < bucketCount; i++) pct[i] = (buckets[i] / total) * 100
    return { buckets: pct, min: lo, max: hi, count: total }
  }

  // ═══ NEW: ASYNC / NON-BLOCKING EXECUTION ═══════════════════════════════
  //
  // The synchronous `compute()` is still the hot path for cached lookups
  // (returns instantly). For cache misses, running several math channels ×
  // several laps back-to-back on the main thread was freezing the UI up to
  // ~2 s on long recordings. Until we move this to a real Web Worker, we
  // yield to the event loop between heavy operations so the browser can
  // still paint crosshair / overlay frames at 60 fps.
  //
  // Strategy:
  //   - `computeAsync(key, lap, snapshot)`  : same as compute(), but awaits
  //     a yield slot (rIC if available, else setTimeout(0)) BEFORE running
  //     the heavy sync function. First paint stays responsive.
  //   - `prewarm(keys, laps, snapshot)`     : sequentially pre-computes the
  //     given (key, lap) combos with yields between each. Meant to be called
  //     as soon as the user toggles laps/channels on; by the time they hover
  //     the chart, cache is warm.
  //
  // NOTE: `compute()` remains synchronous so it can be called inside render
  // loops without breaking the existing architecture. Callers who care about
  // jank should prefer `computeAsync` / `prewarm`.

  // Yields to the browser event loop. requestIdleCallback is ideal (only
  // runs when main thread is idle); falls back to setTimeout(0) on Safari /
  // older Electron where rIC is unavailable.
  function _yieldToEventLoop() {
    return new Promise(resolve => {
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(() => resolve(), { timeout: 50 })
      } else {
        setTimeout(resolve, 0)
      }
    })
  }

  async function computeAsync(key, lap, snapshot) {
    if (!lap || !lap.samples || !lap.samples.length) return new Float32Array(0)
    const cached = _getCached(lap, key)
    if (cached) return cached   // Zero-cost fast path — already computed.
    await _yieldToEventLoop()   // Let pending paints run first.
    return compute(key, lap, snapshot)
  }

  // Pre-compute (keys × laps) in the background, yielding between each.
  // Total cost is the same as running them all back-to-back, but spread
  // over many macrotasks so the UI stays reactive.
  async function prewarm(keys, laps, snapshot) {
    if (!keys || !laps) return
    for (const lap of laps) {
      if (!lap || !lap.samples || !lap.samples.length) continue
      for (const key of keys) {
        if (_getCached(lap, key)) continue   // already cached
        await _yieldToEventLoop()
        try { compute(key, lap, snapshot) }
        catch (e) { console.warn(`[TelemetryMaths] prewarm(${key}) failed:`, e) }
      }
    }
  }

  // ── API publique ──────────────────────────────────────────────────────────
  root.TelemetryMaths = {
    compute,
    computeAsync,   // NEW
    prewarm,        // NEW
    registerMath,
    invalidate,
    histogram,
    listRegistered() { return Array.from(_registry.keys()) },
  }
})(typeof window !== 'undefined' ? window : globalThis)
