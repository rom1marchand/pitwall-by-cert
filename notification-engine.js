// notification-engine.js — Race event detection engine
// Monitors session, driver, and standings data to push notifications
// Depends on: Notifications object from pitwall.js

class NotificationEngine {
  constructor(options = {}) {
    // Tracked state for delta detection
    this._prev = {
      rain: undefined,
      rainIntensity: 0,
      flagState: 0,
      yellowFlag: 0,
      inPits: undefined,
      position: undefined,
      positionClass: undefined,
      fuelLiters: undefined,
      lapNumber: undefined,
      sessionType: undefined,
      standings: new Map(),   // vehicleId -> { position, in_pits, last_lap, finish_status }
    }

    // Cooldowns to avoid notification spam (ms)
    this._cooldowns = {}
    this._cooldownMs = {
      position_change:  10000,  // 10s between position notifs
      position_class:   10000,
      weather:          30000,  // 30s
      flag:             15000,
      pit_entry:        5000,
      pit_exit:         5000,
      fuel_warning:     60000,  // 1min
      fuel_critical:    30000,
      damage:           20000,
      crash:            15000,
      safety_car:       30000,
      rival_pit:        8000,
      rival_crash:      15000,
      gap_closing:      30000,
      gap_opening:      30000,
      new_leader:       10000,
      class_leader:     10000,
      slow_lap:         30000,
      fast_lap:         30000,
    }

    // Config: which car(s) to monitor as "our team"
    this._teamVehicles = new Set()  // vehicle IDs/names for our team
    this._playerVehicleId = null

    // Team position tracking for class-based position
    this._vehicleClass = null

    // Thresholds
    this._fuelWarningLaps = options.fuelWarningLaps || 5
    this._fuelCriticalLaps = options.fuelCriticalLaps || 2
    this._fuelPerLap = options.fuelPerLap || 0
    this._gapThreshold = options.gapThreshold || 2.0  // seconds
    this._slowLapThreshold = options.slowLapThreshold || 1.03  // 3% slower than best

    // Standings history for gap analysis
    this._gapHistory = new Map()  // vehicleId -> [last N gaps]
    this._GAP_HISTORY_SIZE = 5

    // Best lap tracking
    this._bestLap = null
    this._avgLap = null
    this._lapTimes = []
  }

  // ── PUBLIC API ──

  /** Set which vehicles belong to our team */
  setTeamVehicles(vehicleIds) {
    this._teamVehicles = new Set(vehicleIds)
  }

  /** Update fuel per lap for fuel warnings */
  setFuelPerLap(fpl) {
    this._fuelPerLap = fpl
  }

  /** Feed session data */
  updateSession(session) {
    if (!session) return
    this._checkWeather(session)
    this._checkFlags(session)
    this._checkSessionChange(session)
  }

  /** Feed driver (player) data */
  updateDriver(driver) {
    if (!driver) return
    this._checkPitStatus(driver)
    this._checkFuel(driver)
    this._checkLapPerformance(driver)

    // Track player vehicle for standings cross-reference
    if (driver.vehicle) this._playerVehicleId = driver.vehicle
    if (driver.position != null) this._prev.position = driver.position
    if (driver.fuel_liters != null) this._prev.fuelLiters = driver.fuel_liters
    if (driver.lap_number != null) this._prev.lapNumber = driver.lap_number
  }

  /** Feed standings array */
  updateStandings(standings) {
    if (!Array.isArray(standings) || !standings.length) return
    this._checkPositionChanges(standings)
    this._checkRivalPits(standings)
    this._checkCrashes(standings)
    this._checkGapTrends(standings)
    this._checkLeaderChanges(standings)
    this._updateStandingsState(standings)
  }

  /** Full update — pass all available data at once */
  update(session, driver, standings) {
    this.updateSession(session)
    this.updateDriver(driver)
    this.updateStandings(standings)
  }

  /** Reset all tracking state */
  reset() {
    this._prev = {
      rain: undefined, rainIntensity: 0, flagState: 0, yellowFlag: 0,
      inPits: undefined, position: undefined, positionClass: undefined,
      fuelLiters: undefined, lapNumber: undefined, sessionType: undefined,
      standings: new Map(),
    }
    this._cooldowns = {}
    this._gapHistory.clear()
    this._bestLap = null
    this._avgLap = null
    this._lapTimes = []
  }

  // ── WEATHER ──

  _checkWeather(session) {
    const wasRaining = this._prev.rain
    const isRaining = !!session.is_raining
    const intensity = session.rain_intensity || 0
    const prevIntensity = this._prev.rainIntensity || 0

    if (wasRaining !== undefined) {
      // Rain started
      if (!wasRaining && isRaining) {
        this._notify('weather', `Rain has started on track (intensity: ${Math.round(intensity * 100)}%)`, {
          severity: intensity > 0.5 ? 'critical' : 'warning',
          icon: '🌧',
        })
      }
      // Rain stopped
      else if (wasRaining && !isRaining) {
        this._notify('weather', 'Rain has stopped — track is drying', {
          severity: 'info',
          icon: '☀',
        })
      }
      // Intensity changed significantly (>20% delta)
      else if (isRaining && Math.abs(intensity - prevIntensity) > 0.20) {
        const dir = intensity > prevIntensity ? 'increasing' : 'decreasing'
        this._notify('weather', `Rain intensity ${dir} (${Math.round(intensity * 100)}%)`, {
          severity: intensity > 0.7 ? 'critical' : 'info',
          icon: intensity > prevIntensity ? '🌧' : '🌦',
        })
      }
    }

    this._prev.rain = isRaining
    this._prev.rainIntensity = intensity
  }

  // ── FLAGS (Safety Car, FCY, VSC, Yellow) ──

  _checkFlags(session) {
    const prevFlag = this._prev.flagState
    const currFlag = session.flag_state
    const prevYellow = this._prev.yellowFlag
    const currYellow = session.yellow_flag

    if (currFlag != null && prevFlag !== undefined) {
      // flag_state meanings (LMU):
      // 0 = green, 1 = pending, 2 = yellow/SC, 3+ = various states
      if (prevFlag < 2 && currFlag >= 2) {
        this._notify('safety_car', 'Safety Car / Full Course Yellow deployed', {
          severity: 'critical',
          icon: '🟡',
          sound: true,
        })
      } else if (prevFlag >= 2 && currFlag < 2) {
        this._notify('flag', 'Green flag — racing resumed', {
          severity: 'info',
          icon: '🟢',
        })
      }
    }

    // Yellow flag state changes
    if (currYellow != null && prevYellow !== undefined) {
      // yellow_flag: 0=none, 1=pending, 2=pitClosed, 3=pitLeadLap, 4=pitOpen, 5=lastLap, 6=resume, 7=raceHalt
      if (currYellow >= 2 && prevYellow < 2) {
        this._notify('flag', this._yellowFlagMessage(currYellow), {
          severity: 'warning',
          icon: '🟡',
        })
      } else if (currYellow === 6 && prevYellow !== 6) {
        this._notify('flag', 'Race will resume — prepare for restart', {
          severity: 'info',
          icon: '🟢',
        })
      } else if (currYellow === 7 && prevYellow !== 7) {
        this._notify('flag', 'Race halted (red flag)', {
          severity: 'critical',
          icon: '🔴',
          sound: true,
        })
      }
    }

    this._prev.flagState = currFlag
    this._prev.yellowFlag = currYellow
  }

  _yellowFlagMessage(state) {
    switch (state) {
      case 2: return 'Yellow flag — pit lane closed'
      case 3: return 'Yellow flag — pit open for lead lap only'
      case 4: return 'Yellow flag — pit lane open'
      case 5: return 'Safety car — last lap before restart'
      default: return 'Yellow flag active'
    }
  }

  // ── SESSION TYPE CHANGE ──

  _checkSessionChange(session) {
    const prev = this._prev.sessionType
    const curr = session.session_type
    if (curr != null && prev !== undefined && prev !== curr) {
      const labels = {
        0:'Test Day',1:'Practice 1',2:'Practice 2',3:'Practice 3',4:'Practice 4',
        5:'Qualifying',6:'Qualifying 2',7:'Qualifying 3',8:'Qualifying 4',
        9:'Warm Up',10:'Race',11:'Race 2',12:'Race 3',13:'Race 4'
      }
      this._notify('flag', `Session changed: ${labels[curr] || 'Unknown'}`, {
        severity: 'info',
        icon: '🏁',
      })
      // Reset tracking on session change
      this._lapTimes = []
      this._bestLap = null
      this._gapHistory.clear()
    }
    this._prev.sessionType = curr
  }

  // ── PIT STATUS (our car) ──

  _checkPitStatus(driver) {
    const was = this._prev.inPits
    const now = !!driver.in_pits

    if (was !== undefined && was !== now) {
      if (now) {
        this._notify('pit_entry', 'Car entered the pits', {
          severity: 'info',
          icon: '⬛',
          meta: { lap: driver.lap_number, fuel: driver.fuel_liters },
        })
      } else {
        this._notify('pit_exit', 'Car exited the pits', {
          severity: 'info',
          icon: '🟩',
          meta: { lap: driver.lap_number, fuel: driver.fuel_liters },
        })
      }
    }
    this._prev.inPits = now
  }

  // ── FUEL ──

  _checkFuel(driver) {
    if (driver.fuel_liters == null || this._fuelPerLap <= 0) return

    const fuelLaps = driver.fuel_liters / this._fuelPerLap

    if (fuelLaps <= this._fuelCriticalLaps && fuelLaps > 0) {
      this._notify('fuel_critical', `FUEL CRITICAL — only ${fuelLaps.toFixed(1)} laps remaining!`, {
        severity: 'critical',
        icon: '⛽',
        sound: true,
      })
    } else if (fuelLaps <= this._fuelWarningLaps) {
      this._notify('fuel_warning', `Fuel low — ${fuelLaps.toFixed(1)} laps remaining`, {
        severity: 'warning',
        icon: '⛽',
      })
    }
  }

  // ── LAP PERFORMANCE ──

  _checkLapPerformance(driver) {
    if (!driver.last_lap || driver.last_lap <= 0 || driver.in_pits) return

    const lap = driver.last_lap

    // Track laps for average calculation
    if (!this._lapTimes.length || this._lapTimes[this._lapTimes.length - 1] !== lap) {
      this._lapTimes.push(lap)
      if (this._lapTimes.length > 50) this._lapTimes.shift()

      // Calculate avg (skip outliers)
      const sorted = [...this._lapTimes].sort((a, b) => a - b)
      const trimmed = sorted.slice(Math.floor(sorted.length * 0.1), Math.ceil(sorted.length * 0.9))
      this._avgLap = trimmed.length ? trimmed.reduce((a, b) => a + b, 0) / trimmed.length : null
    }

    // New personal best
    if (!this._bestLap || lap < this._bestLap) {
      if (this._bestLap) {
        const delta = this._bestLap - lap
        this._notify('fast_lap', `New best lap: ${this._fmtLap(lap)} (${delta > 0 ? '-' : '+'}${delta.toFixed(3)}s)`, {
          severity: 'info',
          icon: '⚡',
        })
      }
      this._bestLap = lap
    }

    // Unusually slow lap (outlier detection)
    if (this._avgLap && lap > this._avgLap * this._slowLapThreshold && this._lapTimes.length > 5) {
      const delta = lap - this._avgLap
      this._notify('slow_lap', `Slow lap detected: ${this._fmtLap(lap)} (+${delta.toFixed(3)}s vs avg)`, {
        severity: 'warning',
        icon: '🐢',
      })
    }
  }

  // ── POSITION CHANGES (our car in standings) ──

  _checkPositionChanges(standings) {
    // Find our player in standings
    const player = standings.find(c => c.is_player)
    if (!player) return

    const prevPos = this._prev.position
    const currPos = player.position

    if (prevPos !== undefined && currPos !== undefined && prevPos !== currPos && !player.in_pits) {
      const delta = prevPos - currPos
      const absDelta = Math.abs(delta)
      const direction = delta > 0 ? 'gained' : 'lost'
      const plural = absDelta > 1 ? 'positions' : 'position'

      this._notify('position_change',
        `${direction === 'gained' ? '↑' : '↓'} ${direction} ${absDelta} ${plural} — now P${currPos}`, {
        severity: delta > 0 ? 'info' : 'warning',
        icon: delta > 0 ? '🟢' : '🔻',
        meta: { from: prevPos, to: currPos },
      })
    }

    // In-class position tracking
    if (player.vehicle_class) {
      const classStandings = standings
        .filter(c => c.vehicle_class === player.vehicle_class)
        .sort((a, b) => a.position - b.position)
      const classPos = classStandings.findIndex(c => c.is_player) + 1

      if (classPos > 0 && this._prev.positionClass !== undefined && this._prev.positionClass !== classPos && !player.in_pits) {
        const delta = this._prev.positionClass - classPos
        const dir = delta > 0 ? 'gained' : 'lost'
        this._notify('position_class',
          `${dir === 'gained' ? '↑' : '↓'} ${dir} a position in class — now P${classPos} in ${player.vehicle_class}`, {
          severity: delta > 0 ? 'info' : 'warning',
          icon: delta > 0 ? '🟢' : '🔻',
        })
      }
      this._prev.positionClass = classPos
      this._vehicleClass = player.vehicle_class
    }

    this._prev.position = currPos
  }

  // ── RIVAL PITS ──

  _checkRivalPits(standings) {
    const player = standings.find(c => c.is_player)
    if (!player) return

    const prevMap = this._prev.standings
    const playerPos = player.position

    standings.forEach(car => {
      if (car.is_player) return
      const key = car.id ?? car.vehicle ?? car.name
      if (key == null) return
      const prev = prevMap.get(key)
      if (!prev) return

      // Rival near us (within 3 positions) entered pits
      const nearUs = Math.abs(car.position - playerPos) <= 3
      if (nearUs && !prev.in_pits && car.in_pits) {
        this._notify('rival_pit',
          `#${car.num || this._shortName(car.name || car.vehicle)} P${car.position} entered pits`, {
          severity: 'info',
          icon: '🔧',
        })
      }
    })
  }

  // ── CRASHES / INCIDENTS ──

  _checkCrashes(standings) {
    const prevMap = this._prev.standings

    standings.forEach(car => {
      const key = car.id ?? car.vehicle ?? car.name
      if (key == null) return
      const prev = prevMap.get(key)
      if (!prev) return

      // finish_status: 0=none, 1=finished, 2=dnf, 3=dq
      if (car.finish_status >= 2 && prev.finish_status < 2) {
        const status = car.finish_status === 2 ? 'DNF' : 'DQ'
        const isUs = car.is_player || this._teamVehicles.has(key)

        if (isUs) {
          this._notify('crash', `Your car ${status}!`, {
            severity: 'critical',
            icon: '💥',
            sound: true,
          })
        } else {
          this._notify('rival_crash',
            `#${car.num || this._shortName(car.name || car.vehicle)} ${status} (was P${prev.position})`, {
            severity: 'info',
            icon: '⚠',
          })
        }
      }

      // Detect sudden position loss (>5 places in one update) as potential incident
      if (!car.in_pits && prev.position && car.position && !prev.in_pits) {
        const posLoss = car.position - prev.position
        if (posLoss >= 5) {
          const isUs = car.is_player || this._teamVehicles.has(key)
          if (isUs) {
            this._notify('crash', `Lost ${posLoss} positions suddenly — possible incident`, {
              severity: 'critical',
              icon: '💥',
            })
          } else if (Math.abs(car.position - (this._prev.position || 0)) <= 5) {
            // Only notify about rivals near us
            this._notify('rival_crash',
              `#${car.num || this._shortName(car.name || car.vehicle)} lost ${posLoss} positions (possible incident)`, {
              severity: 'info',
              icon: '⚠',
            })
          }
        }
      }
    })
  }

  // ── GAP TRENDS (closing / opening on car ahead / behind) ──

  _checkGapTrends(standings) {
    const player = standings.find(c => c.is_player)
    if (!player || !player.time_behind_next) return

    // Track gap to car ahead
    const gapKey = 'gap_ahead'
    if (!this._gapHistory.has(gapKey)) this._gapHistory.set(gapKey, [])
    const history = this._gapHistory.get(gapKey)
    history.push(player.time_behind_next)
    if (history.length > this._GAP_HISTORY_SIZE) history.shift()

    if (history.length >= this._GAP_HISTORY_SIZE) {
      const first = history[0]
      const last = history[history.length - 1]
      const trend = first - last  // positive = closing

      if (trend > this._gapThreshold && last < 5) {
        this._notify('gap_closing',
          `Closing on car ahead — gap: ${last.toFixed(1)}s (was ${first.toFixed(1)}s)`, {
          severity: 'info',
          icon: '📈',
        })
      } else if (trend < -this._gapThreshold && first < 5) {
        this._notify('gap_opening',
          `Car behind closing — gap: ${last.toFixed(1)}s (was ${first.toFixed(1)}s)`, {
          severity: 'warning',
          icon: '📉',
        })
      }
    }
  }

  // ── LEADER CHANGES ──

  _checkLeaderChanges(standings) {
    const prevMap = this._prev.standings

    // Overall leader change
    const leader = standings.find(c => c.position === 1)
    if (leader) {
      const lKey = leader.id ?? leader.vehicle ?? leader.name
      let prevLeaderKey = null
      prevMap.forEach((v, k) => { if (v.position === 1) prevLeaderKey = k })

      if (prevLeaderKey && lKey !== prevLeaderKey) {
        this._notify('new_leader',
          `New race leader: ${this._shortName(leader.name || leader.vehicle)}`, {
          severity: 'info',
          icon: '👑',
        })
      }
    }

    // Class leader change
    if (this._vehicleClass) {
      const classLeader = standings
        .filter(c => c.vehicle_class === this._vehicleClass)
        .sort((a, b) => a.position - b.position)[0]

      if (classLeader) {
        const clKey = classLeader.id ?? classLeader.vehicle ?? classLeader.name
        let prevClassLeaderKey = null
        prevMap.forEach((v, k) => {
          const prevCar = standings.find(c => (c.id ?? c.vehicle ?? c.name) === k)
          if (v.position === 1 && prevCar?.vehicle_class === this._vehicleClass) prevClassLeaderKey = k
        })

        // Check if class leader changed
        const classStandings = standings.filter(c => c.vehicle_class === this._vehicleClass).sort((a,b) => a.position - b.position)
        const prevClassStandings = []
        prevMap.forEach((v, k) => {
          const car = standings.find(c => (c.id ?? c.vehicle ?? c.name) === k)
          if (car?.vehicle_class === this._vehicleClass) prevClassStandings.push({ key: k, ...v })
        })
        prevClassStandings.sort((a, b) => a.position - b.position)

        if (prevClassStandings.length && classStandings.length) {
          const prevLeadKey = prevClassStandings[0]?.key
          const currLeadKey = classStandings[0]?.id ?? classStandings[0]?.vehicle ?? classStandings[0]?.name
          if (prevLeadKey && currLeadKey && prevLeadKey !== currLeadKey) {
            this._notify('class_leader',
              `New ${this._vehicleClass} leader: ${this._shortName(classStandings[0].name || classStandings[0].vehicle)}`, {
              severity: 'info',
              icon: '👑',
            })
          }
        }
      }
    }
  }

  // ── UPDATE STANDINGS STATE ──

  _updateStandingsState(standings) {
    const newMap = new Map()
    standings.forEach(car => {
      const key = car.id ?? car.vehicle ?? car.name
      if (key != null) {
        newMap.set(key, {
          position: car.position,
          in_pits: !!car.in_pits,
          last_lap: car.last_lap,
          finish_status: car.finish_status || 0,
          vehicle_class: car.vehicle_class,
        })
      }
    })
    this._prev.standings = newMap
  }

  // ── NOTIFICATION DISPATCH ──

  _notify(type, message, options = {}) {
    // Check cooldown
    const now = Date.now()
    const cooldown = this._cooldownMs[type] || 10000
    if (this._cooldowns[type] && now - this._cooldowns[type] < cooldown) return
    this._cooldowns[type] = now

    // Map internal types to Notifications categories
    const categoryMap = {
      weather: 'weather',
      flag: 'weather',
      safety_car: 'crash',
      pit_entry: 'pit_stop',
      pit_exit: 'pit_stop',
      fuel_warning: 'pit_stop',
      fuel_critical: 'pit_stop',
      position_change: 'position_change',
      position_class: 'position_change',
      rival_pit: 'pit_stop',
      crash: 'crash',
      rival_crash: 'crash',
      gap_closing: 'position_change',
      gap_opening: 'position_change',
      new_leader: 'position_change',
      class_leader: 'position_change',
      slow_lap: 'position_change',
      fast_lap: 'position_change',
    }

    const category = categoryMap[type] || 'position_change'

    // Push to the Notifications system from pitwall.js
    if (typeof Notifications !== 'undefined') {
      Notifications.push(category, message, {
        subtype: type,
        severity: options.severity || 'info',
        icon: options.icon,
        ...options.meta,
      })
    }

    // Sound notification for critical alerts
    if (options.sound && typeof Audio !== 'undefined') {
      try { new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=').play().catch(() => {}) }
      catch {}
    }

    // Dispatch custom event for pages that want to react (e.g. stint-plan live alerts)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pitwall-notification', {
        detail: { type, category, message, ...options }
      }))
    }
  }

  // ── HELPERS ──

  _shortName(str) {
    if (!str) return '?'
    // "Romain Marchand" -> "R. Marchand"
    const parts = str.split(/\s+/)
    if (parts.length >= 2) return parts[0][0] + '. ' + parts.slice(1).join(' ')
    return str.substring(0, 20)
  }

  _fmtLap(s) {
    if (!s || s <= 0) return '—'
    return `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, '0')}`
  }
}
