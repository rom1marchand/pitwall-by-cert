/**
 * telemetry-3d.js — Pitwall TrackMap3D
 * Pure Vanilla JS + Three.js (CDN r128).
 * Dépendances : Three.js doit être chargé avant ce fichier.
 *
 * API publique :
 *   new TrackMap3D(containerId)   → instancie et monte le renderer
 *   .setTrackPoints(trackPoints)  → { main: [{x,z,type},...], pit: [...] }
 *   .updateCars(standings)        → [{pos_x, pos_z, is_player, vehicle_class, position, in_pits, ...}]
 *   .destroy()                    → nettoie toutes les ressources
 */

;(function (global) {
  'use strict'

  // ─── COULEURS PAR CLASSE (calquées sur pitwall-trackmap.html) ───────────────
  const CLASS_COLORS = {
    HY:   0xe11d48,
    LMP2: 0x3b8fff,
    LMP3: 0xa855f7,
    GTE:  0x22c55e,
    GT3:  0xff8c00,
  }
  const COLOR_DEFAULT  = 0x888888
  const COLOR_PLAYER   = 0xffffff
  const COLOR_LIME     = 0xc8ff00
  const COLOR_PIT_RING = 0xc8ff00

  function classColor (cls) {
    if (!cls) return COLOR_DEFAULT
    const key = (cls || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    for (const k of Object.keys(CLASS_COLORS)) {
      if (key.includes(k)) return CLASS_COLORS[k]
    }
    return COLOR_DEFAULT
  }

  // ─── LOADER THREE.JS CDN (si pas déjà chargé) ──────────────────────────────
  function loadThree () {
    return new Promise((resolve, reject) => {
      if (typeof THREE !== 'undefined') { resolve(); return }
      const s = document.createElement('script')
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
      s.onload  = resolve
      s.onerror = () => reject(new Error('[TrackMap3D] Impossible de charger Three.js r128'))
      document.head.appendChild(s)
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLASSE PRINCIPALE
  // ═══════════════════════════════════════════════════════════════════════════
  class TrackMap3D {
    /**
     * @param {string} containerId  — id du div hôte (ex: 'track-3d-container')
     */
    constructor (containerId) {
      this._containerId = containerId
      this._container   = document.getElementById(containerId)
      if (!this._container) throw new Error(`[TrackMap3D] Container #${containerId} introuvable`)

      // État interne
      this._ready        = false
      this._trackPoints  = null   // {main, pit} après setTrackPoints
      this._carMeshes    = {}     // carId → {body, ring, label, pitRing}
      this._trackMesh    = null
      this._pitMesh      = null
      this._startMarker  = null
      this._animFrame    = null
      this._clock        = null

      // Caméra orbit
      this._isDragging   = false
      this._isRightDrag  = false
      this._lastMouse    = { x: 0, y: 0 }
      this._spherical    = { theta: Math.PI / 4, phi: Math.PI / 3.5, radius: 1200 }
      this._target       = { x: 0, y: 0, z: 0 }
      this._camSmoothTarget = { x: 0, y: 0, z: 0 }  // lissage caméra

      // Afficher le spinner pendant le chargement
      this._showLoading()

      // Chargement async de Three.js puis init
      loadThree()
        .then(() => this._init())
        .catch(err => {
          console.error(err)
          this._showError('Three.js non disponible')
        })
    }

    // ─── LOADING UI ──────────────────────────────────────────────────────────
    _showLoading () {
      this._container.innerHTML = `
        <div style="
          position:absolute;inset:0;display:flex;align-items:center;
          justify-content:center;flex-direction:column;gap:12px;
          background:#0d0d0d;color:#444;
          font-family:'Barlow Condensed',sans-serif;font-size:12px;
          letter-spacing:.15em;text-transform:uppercase;">
          <div style="
            width:28px;height:28px;border:2px solid #222;
            border-top-color:#C8FF00;border-radius:50%;
            animation:tm3d-spin .7s linear infinite;"></div>
          <span>Chargement 3D…</span>
        </div>
        <style>@keyframes tm3d-spin{to{transform:rotate(360deg)}}</style>`
    }

    _showError (msg) {
      this._container.innerHTML = `
        <div style="
          position:absolute;inset:0;display:flex;align-items:center;
          justify-content:center;color:#e11d48;
          font-family:'Barlow',sans-serif;font-size:13px;">
          ⚠ ${msg}
        </div>`
    }

    // ─── INIT THREE.JS ────────────────────────────────────────────────────────
    _init () {
      const W = this._container.offsetWidth  || 800
      const H = this._container.offsetHeight || 600

      // Scene
      this._scene = new THREE.Scene()
      this._scene.background = new THREE.Color(0x0d0d0d)
      this._scene.fog = new THREE.FogExp2(0x0d0d0d, 0.00045)

      // Renderer
      this._renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
      this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      this._renderer.setSize(W, H)
      this._renderer.shadowMap.enabled = true
      this._renderer.shadowMap.type = THREE.PCFSoftShadowMap
      this._renderer.toneMapping = THREE.ACESFilmicToneMapping
      this._renderer.toneMappingExposure = 1.1

      // Vider le container et y insérer le canvas
      this._container.innerHTML = ''
      this._container.style.position = 'relative'
      this._container.appendChild(this._renderer.domElement)
      this._renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;'

      // Camera perspective
      this._camera = new THREE.PerspectiveCamera(45, W / H, 1, 50000)
      this._updateCamera()

      // Éclairage Pitwall-style
      this._buildLights()

      // Grille sol subtile
      this._buildGrid()

      // HUD canvas (labels 2D overlay)
      this._buildHUD(W, H)

      // Overlay CSS (minimap + contrôles)
      this._buildOverlay()

      // Évènements souris / touch / resize
      this._bindEvents()

      // Clock pour animations
      this._clock = new THREE.Clock()

      // Démarrer la boucle de rendu
      this._ready = true
      this._renderLoop()

      console.log('[TrackMap3D] Initialisé ✓')
    }

    // ─── ÉCLAIRAGE ────────────────────────────────────────────────────────────
    _buildLights () {
      // Ambient doux
      const ambient = new THREE.AmbientLight(0xffffff, 0.35)
      this._scene.add(ambient)

      // Directionnel principal (soleil bas)
      const sun = new THREE.DirectionalLight(0xffffff, 0.9)
      sun.position.set(500, 1000, 500)
      sun.castShadow = true
      sun.shadow.mapSize.set(2048, 2048)
      sun.shadow.camera.far = 5000
      sun.shadow.camera.left = -1500
      sun.shadow.camera.right = 1500
      sun.shadow.camera.top = 1500
      sun.shadow.camera.bottom = -1500
      this._scene.add(sun)

      // Remplissage côté opposé
      const fill = new THREE.DirectionalLight(0x4488cc, 0.25)
      fill.position.set(-400, 300, -400)
      this._scene.add(fill)

      // Hémisphère (sky/ground) pour le sol
      const hemi = new THREE.HemisphereLight(0x1a1a2e, 0x0d0d0d, 0.4)
      this._scene.add(hemi)
    }

    // ─── GRILLE SOL ───────────────────────────────────────────────────────────
    _buildGrid () {
      const grid = new THREE.GridHelper(8000, 60, 0x1a1a1a, 0x141414)
      grid.position.y = -2
      this._scene.add(grid)
      this._gridHelper = grid
    }

    // ─── HUD CANVAS (labels voitures) ─────────────────────────────────────────
    _buildHUD (W, H) {
      const hud = document.createElement('canvas')
      hud.width = W; hud.height = H
      hud.style.cssText = 'position:absolute;inset:0;pointer-events:none;width:100%;height:100%;'
      this._container.appendChild(hud)
      this._hudCanvas = hud
      this._hudCtx   = hud.getContext('2d')
    }

    // ─── OVERLAY HTML ─────────────────────────────────────────────────────────
    _buildOverlay () {
      const ov = document.createElement('div')
      ov.style.cssText = `
        position:absolute;bottom:14px;right:14px;z-index:10;
        display:flex;flex-direction:column;gap:6px;align-items:flex-end;`
      ov.innerHTML = `
        <div style="
          background:rgba(0,0,0,.6);border:1px solid #2a2a2a;border-radius:5px;
          backdrop-filter:blur(8px);padding:6px 10px;
          font-family:'Barlow Condensed',sans-serif;font-size:9px;
          letter-spacing:.12em;text-transform:uppercase;color:#555;line-height:1.9;">
          <div style="color:#C8FF00;font-weight:700;margin-bottom:2px;font-size:10px;">COMMANDES 3D</div>
          <div>Clic gauche&nbsp;·&nbsp;Orbite</div>
          <div>Clic droit&nbsp;·&nbsp;Pan</div>
          <div>Molette&nbsp;·&nbsp;Zoom</div>
          <div>Double-clic&nbsp;·&nbsp;Reset</div>
        </div>`
      this._container.appendChild(ov)
    }

    // ─── EVENTS ───────────────────────────────────────────────────────────────
    _bindEvents () {
      const el = this._renderer.domElement

      // Mouse
      el.addEventListener('mousedown',  e => this._onMouseDown(e))
      el.addEventListener('mousemove',  e => this._onMouseMove(e))
      el.addEventListener('mouseup',    ()  => { this._isDragging = false; this._isRightDrag = false })
      el.addEventListener('mouseleave', ()  => { this._isDragging = false; this._isRightDrag = false })
      el.addEventListener('wheel',      e => this._onWheel(e), { passive: false })
      el.addEventListener('dblclick',   ()  => this._resetCamera())
      el.addEventListener('contextmenu', e => e.preventDefault())

      // Touch
      el.addEventListener('touchstart',  e => this._onTouchStart(e),  { passive: false })
      el.addEventListener('touchmove',   e => this._onTouchMove(e),   { passive: false })
      el.addEventListener('touchend',    ()  => { this._isDragging = false })

      // Resize
      this._resizeObserver = new ResizeObserver(() => this._onResize())
      this._resizeObserver.observe(this._container)
    }

    _onMouseDown (e) {
      this._isDragging   = true
      this._isRightDrag  = e.button === 2
      this._lastMouse    = { x: e.clientX, y: e.clientY }
    }

    _onMouseMove (e) {
      if (!this._isDragging) return
      const dx = e.clientX - this._lastMouse.x
      const dy = e.clientY - this._lastMouse.y
      this._lastMouse = { x: e.clientX, y: e.clientY }

      if (this._isRightDrag) {
        // Pan : déplace la cible
        const panSpeed = this._spherical.radius * 0.001
        const right = new THREE.Vector3()
        const up    = new THREE.Vector3()
        this._camera.getWorldDirection(up)
        right.crossVectors(up, new THREE.Vector3(0, 1, 0)).normalize()
        up.set(0, 1, 0)
        this._target.x -= right.x * dx * panSpeed
        this._target.z -= right.z * dx * panSpeed
        this._target.x += up.x * dy * panSpeed
        this._target.z += up.z * dy * panSpeed
      } else {
        // Orbite
        this._spherical.theta -= dx * 0.005
        this._spherical.phi   -= dy * 0.005
        this._spherical.phi    = Math.max(0.08, Math.min(Math.PI / 2 - 0.05, this._spherical.phi))
      }
      this._updateCamera()
    }

    _onWheel (e) {
      e.preventDefault()
      const factor = e.deltaY > 0 ? 1.12 : 0.89
      this._spherical.radius = Math.max(80, Math.min(6000, this._spherical.radius * factor))
      this._updateCamera()
    }

    _onTouchStart (e) {
      if (e.touches.length === 1) {
        this._isDragging = true
        this._lastMouse  = { x: e.touches[0].clientX, y: e.touches[0].clientY }
        this._touchDist  = null
      } else if (e.touches.length === 2) {
        this._touchDist = this._getTouchDist(e)
      }
    }

    _onTouchMove (e) {
      e.preventDefault()
      if (e.touches.length === 1 && this._isDragging) {
        const dx = e.touches[0].clientX - this._lastMouse.x
        const dy = e.touches[0].clientY - this._lastMouse.y
        this._lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY }
        this._spherical.theta -= dx * 0.006
        this._spherical.phi   -= dy * 0.006
        this._spherical.phi    = Math.max(0.08, Math.min(Math.PI / 2 - 0.05, this._spherical.phi))
        this._updateCamera()
      } else if (e.touches.length === 2 && this._touchDist != null) {
        const d = this._getTouchDist(e)
        const factor = this._touchDist / d
        this._spherical.radius = Math.max(80, Math.min(6000, this._spherical.radius * factor))
        this._touchDist = d
        this._updateCamera()
      }
    }

    _getTouchDist (e) {
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      return Math.sqrt(dx * dx + dy * dy)
    }

    _onResize () {
      const W = this._container.offsetWidth
      const H = this._container.offsetHeight
      if (!W || !H) return
      this._camera.aspect = W / H
      this._camera.updateProjectionMatrix()
      this._renderer.setSize(W, H)
      this._hudCanvas.width  = W
      this._hudCanvas.height = H
    }

    _resetCamera () {
      this._spherical = { theta: Math.PI / 4, phi: Math.PI / 3.5, radius: 1200 }
      this._target    = { x: 0, y: 0, z: 0 }
      this._updateCamera()
    }

    _updateCamera () {
      const { theta, phi, radius } = this._spherical
      const sinPhi = Math.sin(phi)
      this._camera.position.set(
        this._target.x + radius * sinPhi * Math.sin(theta),
        this._target.y + radius * Math.cos(phi),
        this._target.z + radius * sinPhi * Math.cos(theta)
      )
      this._camera.lookAt(this._target.x, this._target.y, this._target.z)
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // API PUBLIQUE — TRACK POINTS
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * @param {{ main: Array<{x,z}>, pit: Array<{x,z}> }} trackPoints
     * Les points utilisent le système de coordonnées LMU (x, z).
     * On les projette sur le plan XZ de Three.js (Y = hauteur).
     */
    setTrackPoints (trackPoints) {
      if (!trackPoints || !trackPoints.main || !trackPoints.main.length) return
      this._trackPoints = trackPoints

      // Attendre que Three.js soit prêt
      if (!this._ready) {
        const wait = setInterval(() => {
          if (this._ready) { clearInterval(wait); this._buildTrack() }
        }, 50)
        return
      }
      this._buildTrack()
    }

    _buildTrack () {
      const tp = this._trackPoints
      if (!tp) return

      // Nettoyer l'ancien circuit
      if (this._trackMesh)  { this._scene.remove(this._trackMesh);  this._trackMesh  = null }
      if (this._pitMesh)    { this._scene.remove(this._pitMesh);    this._pitMesh    = null }
      if (this._startMarker){ this._scene.remove(this._startMarker); this._startMarker = null }

      // Centrage
      const all = [...tp.main, ...(tp.pit || [])]
      const cx  = (Math.min(...all.map(p => p.x)) + Math.max(...all.map(p => p.x))) / 2
      const cz  = (Math.min(...all.map(p => p.z)) + Math.max(...all.map(p => p.z))) / 2

      this._trackCenter = { x: cx, z: cz }

      // Ajuster la cible caméra au centre du circuit
      this._target = { x: 0, y: 0, z: 0 }
      // Rayon adaptatif à la taille du circuit
      const spanX = Math.max(...all.map(p => p.x)) - Math.min(...all.map(p => p.x))
      const spanZ = Math.max(...all.map(p => p.z)) - Math.min(...all.map(p => p.z))
      const span  = Math.max(spanX, spanZ)
      this._spherical.radius = span * 0.85
      this._updateCamera()

      // Déplacer la grille
      if (this._gridHelper) this._gridHelper.scale.setScalar(Math.max(1, span / 4000))

      // ── PISTE PRINCIPALE ──
      if (tp.main.length > 2) {
        this._trackMesh = this._buildRibbonMesh(tp.main, cx, cz, {
          width:       8.0,
          colorCenter: 0x222222,
          colorEdge:   0x1a1a1a,
          yOffset:     0,
        })
        this._scene.add(this._trackMesh)

        // Ligne centrale (trait blanc cassé)
        const centerLine = this._buildCenterLine(tp.main, cx, cz, 0x333333, 0.3)
        this._scene.add(centerLine)

        // Marqueur départ (ligne blanche)
        this._startMarker = this._buildStartMarker(tp.main[0], cx, cz)
        this._scene.add(this._startMarker)
      }

      // ── PIT LANE ──
      if (tp.pit && tp.pit.length > 1) {
        this._pitMesh = this._buildCenterLine(tp.pit, cx, cz, 0x444444, 0.8, true)
        this._scene.add(this._pitMesh)
      }

      // Supprimer les voitures hors piste si circuit change
      this._clearCarMeshes()
    }

    // ─── PROJECTION HELPER (symétrie Z identique à la 2D) ────────────────────
    // La 2D fait toZ = H - (...) ce qui inverse l'axe Z.
    // On reproduit : x' = p.x - cx,  z' = -(p.z - cz)
    _px (p, cx) { return p.x - cx }
    _pz (p, cz) { return -(p.z - cz) }

    // ─── RIBBON (surface de piste) ────────────────────────────────────────────
    _buildRibbonMesh (pts, cx, cz, opts = {}) {
      const { width = 8, yOffset = 0 } = opts
      const n = pts.length

      // Positions : 2 vertices par point (bord gauche / bord droit)
      const positions = new Float32Array(n * 2 * 3)
      const colors    = new Float32Array(n * 2 * 3)

      for (let i = 0; i < n; i++) {
        const p    = pts[i]
        const prev = pts[Math.max(0, i - 1)]
        const next = pts[Math.min(n - 1, i + 1)]

        const px = this._px(p, cx)
        const pz = this._pz(p, cz)

        // Tangente (calculée sur les coordonnées projetées)
        const tx = this._px(next, cx) - this._px(prev, cx)
        const tz = this._pz(next, cz) - this._pz(prev, cz)
        const tl = Math.sqrt(tx * tx + tz * tz) || 1
        // Normale perpendiculaire (XZ plan → normale latérale)
        const nx = -tz / tl
        const nz =  tx / tl

        const hw = width / 2

        // Vertex gauche
        positions[i * 6 + 0] = px + nx * hw
        positions[i * 6 + 1] = yOffset
        positions[i * 6 + 2] = pz + nz * hw

        // Vertex droit
        positions[i * 6 + 3] = px - nx * hw
        positions[i * 6 + 4] = yOffset
        positions[i * 6 + 5] = pz - nz * hw

        // Couleur : bords plus foncés
        const c = new THREE.Color(0x252525)
        colors[i * 6 + 0] = c.r; colors[i * 6 + 1] = c.g; colors[i * 6 + 2] = c.b
        colors[i * 6 + 3] = c.r; colors[i * 6 + 4] = c.g; colors[i * 6 + 5] = c.b
      }

      // Index : quads entre i et i+1
      const indices = []
      for (let i = 0; i < n - 1; i++) {
        const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1
        indices.push(a, b, c,  b, d, c)
      }
      // Fermeture
      const last = (n - 1) * 2
      indices.push(last, last + 1, 0,  last + 1, 1, 0)

      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3))
      geo.setIndex(indices)
      geo.computeVertexNormals()

      const mat = new THREE.MeshLambertMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
      })

      return new THREE.Mesh(geo, mat)
    }

    // ─── LIGNE CENTRALE ───────────────────────────────────────────────────────
    _buildCenterLine (pts, cx, cz, color = 0x333333, opacity = 1.0, dashed = false) {
      const points = pts.map(p => new THREE.Vector3(this._px(p, cx), 0.15, this._pz(p, cz)))
      // Fermer la boucle
      if (pts.length > 2) points.push(points[0].clone())

      const geo = new THREE.BufferGeometry().setFromPoints(points)
      const mat = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity })

      return new THREE.Line(geo, mat)
    }

    // ─── MARQUEUR DÉPART ──────────────────────────────────────────────────────
    _buildStartMarker (p, cx, cz) {
      const group = new THREE.Group()
      group.position.set(this._px(p, cx), 0.5, this._pz(p, cz))

      // Ligne blanche transversale (12m)
      const linePts = [new THREE.Vector3(-6, 0, 0), new THREE.Vector3(6, 0, 0)]
      const lineGeo = new THREE.BufferGeometry().setFromPoints(linePts)
      const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 })
      group.add(new THREE.Line(lineGeo, lineMat))

      // Petit poteau lime
      const poleGeo = new THREE.CylinderGeometry(0.4, 0.4, 6, 8)
      const poleMat = new THREE.MeshLambertMaterial({ color: 0xc8ff00, emissive: 0x446600 })
      const pole    = new THREE.Mesh(poleGeo, poleMat)
      pole.position.set(0, 3, 0)
      group.add(pole)

      return group
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // API PUBLIQUE — VOITURES (live standings)
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * @param {Array} standings  — tableau live Pitwall
     *   Chaque élément : { pos_x, pos_z, is_player, vehicle_class, position, name, in_pits }
     */
    updateCars (standings) {
      if (!this._ready || !this._scene) return

      const cx = this._trackCenter ? this._trackCenter.x : 0
      const cz = this._trackCenter ? this._trackCenter.z : 0

      const activeIds = new Set()

      standings.forEach(car => {
        if (car.pos_x == null || car.pos_z == null) return

        const id = car.is_player ? '__player__' : (car.name || String(car.position))
        activeIds.add(id)

        const x = car.pos_x - cx
        const z = -(car.pos_z - cz)
        const y = 0.6  // au-dessus de la piste

        if (!this._carMeshes[id]) {
          this._carMeshes[id] = this._createCarMesh(car)
          this._scene.add(this._carMeshes[id].group)
        }

        const mesh = this._carMeshes[id]
        mesh.group.position.set(x, y, z)

        // Mise à jour couleur / classe (au cas où)
        const col = car.is_player ? COLOR_PLAYER : classColor(car.vehicle_class)
        mesh.body.material.color.setHex(col)
        if (car.is_player) {
          mesh.body.material.emissive.setHex(0x222222)
        }

        // Anneau de pit
        if (mesh.pitRing) {
          mesh.pitRing.visible = !!car.in_pits
        }

        // Pulsation joueur
        mesh._isPlayer = car.is_player

        // Stocker le nom pour le HUD
        mesh._label    = car.is_player ? `P${car.position} ★` : `P${car.position}`
        mesh._class    = car.vehicle_class || ''
        mesh._isPlayer = car.is_player
      })

      // Supprimer les voitures disparues
      for (const id of Object.keys(this._carMeshes)) {
        if (!activeIds.has(id)) {
          this._scene.remove(this._carMeshes[id].group)
          delete this._carMeshes[id]
        }
      }
    }

    _createCarMesh (car) {
      const group = new THREE.Group()
      const isP   = car.is_player
      const col   = isP ? COLOR_PLAYER : classColor(car.vehicle_class)
      const r     = isP ? 5.5 : 3.5

      // Corps principal (sphère)
      const bodyGeo = new THREE.SphereGeometry(r, 16, 10)
      const bodyMat = new THREE.MeshLambertMaterial({
        color: col,
        emissive: isP ? 0x222222 : 0x000000,
      })
      const body = new THREE.Mesh(bodyGeo, bodyMat)
      body.castShadow = true
      group.add(body)

      // Anneau joueur (lime)
      let ring = null
      if (isP) {
        const ringGeo = new THREE.TorusGeometry(r + 2.5, 0.6, 8, 40)
        const ringMat = new THREE.MeshBasicMaterial({ color: COLOR_LIME })
        ring = new THREE.Mesh(ringGeo, ringMat)
        ring.rotation.x = Math.PI / 2
        group.add(ring)
      }

      // Anneau pit (affiché si in_pits)
      const pitGeo = new THREE.TorusGeometry(r + 4.5, 0.4, 8, 40)
      const pitMat = new THREE.MeshBasicMaterial({ color: COLOR_PIT_RING, transparent: true, opacity: 0.4 })
      const pitRing = new THREE.Mesh(pitGeo, pitMat)
      pitRing.rotation.x = Math.PI / 2
      pitRing.visible = false
      group.add(pitRing)

      // Lumière point pour le joueur
      let pointLight = null
      if (isP) {
        pointLight = new THREE.PointLight(COLOR_LIME, 1.2, 120)
        group.add(pointLight)
      }

      return { group, body, ring, pitRing, pointLight, _label: '', _isPlayer: isP, _class: '' }
    }

    _clearCarMeshes () {
      for (const id of Object.keys(this._carMeshes)) {
        this._scene.remove(this._carMeshes[id].group)
      }
      this._carMeshes = {}
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // BOUCLE DE RENDU
    // ═══════════════════════════════════════════════════════════════════════════
    _renderLoop () {
      this._animFrame = requestAnimationFrame(() => this._renderLoop())

      const dt = this._clock ? this._clock.getDelta() : 0.016
      const t  = this._clock ? this._clock.getElapsedTime() : 0

      // Animations : pulsation joueur
      for (const id of Object.keys(this._carMeshes)) {
        const mesh = this._carMeshes[id]
        if (mesh._isPlayer && mesh.ring) {
          const scale = 1.0 + 0.08 * Math.sin(t * 3.5)
          mesh.ring.scale.setScalar(scale)
        }
        // Rotation legere pit ring
        if (mesh.pitRing && mesh.pitRing.visible) {
          mesh.pitRing.rotation.z += dt * 0.8
        }
      }

      this._renderer.render(this._scene, this._camera)
      this._drawHUD()
    }

    // ─── HUD (labels voitures en overlay 2D) ──────────────────────────────────
    _drawHUD () {
      const ctx = this._hudCtx
      const W   = this._hudCanvas.width
      const H   = this._hudCanvas.height
      ctx.clearRect(0, 0, W, H)

      if (!Object.keys(this._carMeshes).length) return

      const vec = new THREE.Vector3()

      for (const id of Object.keys(this._carMeshes)) {
        const mesh = this._carMeshes[id]
        if (!mesh._label) continue

        // Projeter la position 3D en 2D
        vec.setFromMatrixPosition(mesh.group.matrixWorld)
        vec.project(this._camera)

        const sx = ( vec.x + 1) / 2 * W
        const sy = (-vec.y + 1) / 2 * H

        // Hors écran → skip
        if (vec.z > 1 || sx < -50 || sx > W + 50 || sy < -50 || sy > H + 50) continue

        // Décalage vertical (au-dessus de la sphère)
        const labelY = sy - (mesh._isPlayer ? 22 : 16)

        ctx.font = `${mesh._isPlayer ? '700' : '600'} ${mesh._isPlayer ? 11 : 9}px 'Barlow Condensed', sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        // Fond semi-transparent
        const tw = ctx.measureText(mesh._label).width
        ctx.fillStyle = mesh._isPlayer ? 'rgba(200,255,0,.18)' : 'rgba(0,0,0,.55)'
        ctx.beginPath()
        ctx.roundRect(sx - tw / 2 - 5, labelY - 8, tw + 10, 16, 3)
        ctx.fill()

        // Texte
        ctx.fillStyle = mesh._isPlayer ? '#C8FF00' : '#aaaaaa'
        ctx.fillText(mesh._label, sx, labelY)
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DESTROY
    // ═══════════════════════════════════════════════════════════════════════════
    destroy () {
      if (this._animFrame) cancelAnimationFrame(this._animFrame)
      if (this._resizeObserver) this._resizeObserver.disconnect()

      this._clearCarMeshes()
      if (this._renderer) {
        this._renderer.dispose()
        this._renderer.domElement.remove()
      }
      if (this._hudCanvas) this._hudCanvas.remove()

      this._ready = false
      console.log('[TrackMap3D] Destroyed')
    }
  }

  // ─── EXPORT GLOBAL ───────────────────────────────────────────────────────────
  global.TrackMap3D = TrackMap3D

})(window)
