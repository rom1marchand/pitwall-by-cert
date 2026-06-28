// pitwall.js — Shared core for all Pitwall pages
// Auth, WebSocket, utils, navigation, i18n, assets

const API = 'https://pitwall.cert-team.fr'

// ─── I18N ─────────────────────────────────────────────────────────────────────
// Translations are loaded from translations.json at startup (via synchronous XHR).
// The built-in object below is the fallback if the file is unavailable.

let TRANSLATIONS = (function () {
  try {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', 'translations.json', false) // synchronous
    xhr.send()
    if (xhr.status === 200 || xhr.status === 0) { // 0 = file:// OK in Electron
      const parsed = JSON.parse(xhr.responseText)
      if (parsed && parsed.en && parsed.fr) return parsed
    }
  } catch (_) {}
  return null // will be overwritten by built-in below
})() || {
  en: {
    // Header / Nav
    dashboard: 'Dashboard', myTeams: 'My Teams', schedule: 'Schedule',
    drivers: 'Drivers', races: 'Races', settings: 'Settings',
    pitwall: 'Pitwall', workspace: 'Workspace', liveTiming: 'Live Timing',
    trackMap: 'Track Map', liveTelemetry: 'Telemetry',
    stintPlan: 'Stint Plan', setups: 'Setups', pricing: 'Plans',
    // Dashboard
    soloMode: 'Solo', localPitwall: 'Local Pitwall',
    localPitwallDesc: 'Connect directly to your game — no lineup needed',
    createTeam: 'Create a team', createTeamDesc: 'Start your own team',
    joinTeam: 'Join a team', joinTeamDesc: 'Enter a team code',
    // Auth / index
    signInSteam: 'Sign in with Steam',
    loginSub: 'Live race data for your team. Connect with Steam to access your pitwall.',
    // Common
    cancel: 'Cancel', save: 'Save', delete: 'Delete', edit: 'Edit',
    create: 'Create', close: 'Close', copy: 'Copy', leave: 'Leave', join: 'Join',
    loading: 'Loading', connecting: 'Connecting', saveChanges: 'Save changes',
    clickToCopy: 'Click to copy', copied: '✓ Copied!', noData: 'No data',
    // Team
    teamCode: 'Team Code', members: 'Members', events: 'Events',
    lineups: 'Lineups', tier: 'Tier', newEvent: 'New Event',
    newLineup: 'New Lineup', inviteCode: 'Invite code',
    inviteCodeDesc: 'Share this code with anyone you want to invite to your team.',
    dangerZone: 'Danger zone', leaveTeam: 'Leave / Delete team',
    teamName: 'Team name', circuit: 'Circuit', series: 'Series',
    notes: 'Notes', eventName: 'Event name',
    general: 'General', role: 'Role', lineupAccess: 'Lineup Access', since: 'Since',
    noEvents: 'No events yet.', noMembers: 'No members.', noLineups: 'No lineups yet.',
    lineupName: 'Lineup name', editLineup: 'Edit Lineup', deleteLineup: 'Delete Lineup',
    membersRoles: 'Members & roles', confirmDeleteLineup: 'All stint assignments in this lineup will be permanently lost.',
    // Pricing
    plans: 'Plans & Pricing', free: 'Free', plus: 'Plus', premium: 'Premium',
    currentPlan: 'Current plan', upgrade: 'Upgrade', monthly: '/month',
    choosePlan: 'Choose your Pitwall', noHiddenFees: 'No hidden fees.',
    alwaysFree: 'Always free', mostPopular: 'Most popular',
    // Roles
    founder: 'Founder', manager: 'Manager', driver: 'Driver', spectator: 'Spectator',
    // Logo
    teamLogo: 'Team Logo', uploadLogo: 'Upload logo', removeLogo: 'Remove',
    logoHint: 'PNG, JPG or SVG · Max 1MB',
    logoDesc: 'Your logo appears in the header and on your team pages.',
    // Driver profile & settings
    driverProfile: 'Driver Profile', firstName: 'First Name', lastName: 'Last Name',
    carNumber: 'Car Number', steamAccount: 'Steam account',
    notificationsSection: 'Notifications', positionChange: 'Position change',
    positionChangeSub: 'Alert when your position changes (not in pits)',
    pitStop: 'Pit stop', pitStopSub: 'Alert when a car enters or exits the pits',
    weatherChange: 'Weather change', weatherChangeSub: 'Alert when rain starts or stops',
    crash: 'Crash / incident', crashSub: 'Alert on detected track incidents',
    stintPlanUpdate: 'Stint plan update', stintPlanUpdateSub: 'Alert when strategy recommendation changes',
    appSection: 'App', language: 'Language', languageSub: 'Switch interface language',
    // Telemetry
    recording: 'Recording', backendOffline: 'Backend offline',
    waitingForLap: 'Waiting for lap data…',
    premiumFeature: 'Premium Feature',
    upgradeWallSub: 'Lap-by-lap telemetry traces are available on Premium plans.',
    seePlans: 'See plans →',
    // Workspace panels
    leaderboard: 'Leaderboard', speedGear: 'Speed & Gear', tyres: 'Tyres',
    tyreTelemetry: 'Tyre Telemetry',
    speed: 'Speed (km/h)', throttleBrake: 'Throttle & Brake (%)', gear: 'Gear', rpm: 'RPM',
    // Dashboard
    quickAccess: 'Quick Access', welcomeBack: 'Welcome back',
    // Settings page
    settingsSub: 'Manage your display name, language, local folders and account',
    displayNameSection: 'Display Name', displayName: 'Display Name',
    renameAvailable: 'You can change your display name.',
    renameCooldown: 'Next rename available in', days: 'days',
    renameSaved: 'Display name updated!',
    nameTooShort: 'Name must be at least 2 characters',
    nameTooLong: 'Name must be 24 characters or less',
    languageSection: 'Language',
    languageDesc: 'Choose your interface language. You can contribute translations by editing translations.json.',
    localFolders: 'Local Folders',
    localFoldersDesc: 'Assign local folders for MoTeC data import/export and LMU car setups.',
    motecFolder: 'MoTeC Data Folder', setupFolder: 'LMU Setup Folder',
    noFolderSelected: 'No folder selected', browse: 'Browse',
    folderSaved: 'Folder saved', enterFolderPath: 'Enter folder path:',
    motecHint: 'Folder where MoTeC .ld/.ldx files are stored for import and export.',
    setupHint: 'Default LMU path:',
    deleteAccount: 'Delete Account',
    deleteAccountDesc: 'Permanently delete your Pitwall account and all associated data. This action cannot be undone.',
    deleteConfirmText: 'Type DELETE to confirm permanent account deletion:',
    deleteAccountConfirm: 'Delete my account',
  },
  fr: {
    // Header / Nav
    dashboard: 'Tableau de bord', myTeams: 'Mes équipes', schedule: 'Planning',
    drivers: 'Pilotes', races: 'Courses', settings: 'Paramètres',
    pitwall: 'Pitwall', workspace: 'Workspace', liveTiming: 'Temps réels',
    trackMap: 'Carte piste', liveTelemetry: 'Télémétrie',
    stintPlan: 'Stratégie', setups: 'Réglages', pricing: 'Abonnements',
    // Dashboard
    soloMode: 'Solo', localPitwall: 'Pitwall local',
    localPitwallDesc: 'Connexion directe au jeu — sans lineup',
    createTeam: 'Créer une équipe', createTeamDesc: 'Fonder votre propre équipe',
    joinTeam: 'Rejoindre', joinTeamDesc: 'Entrer un code équipe',
    // Auth / index
    signInSteam: 'Se connecter avec Steam',
    loginSub: 'Données de course en direct pour votre équipe. Connectez-vous avec Steam.',
    // Common
    cancel: 'Annuler', save: 'Enregistrer', delete: 'Supprimer', edit: 'Modifier',
    create: 'Créer', close: 'Fermer', copy: 'Copier', leave: 'Quitter', join: 'Rejoindre',
    loading: 'Chargement', connecting: 'Connexion', saveChanges: 'Enregistrer',
    clickToCopy: 'Cliquer pour copier', copied: '✓ Copié !', noData: 'Aucune donnée',
    // Team
    teamCode: 'Code équipe', members: 'Membres', events: 'Événements',
    lineups: 'Lineups', tier: 'Tier', newEvent: 'Nouvel événement',
    newLineup: 'Nouveau lineup', inviteCode: 'Code d\'invitation',
    inviteCodeDesc: 'Partagez ce code avec les personnes que vous souhaitez inviter.',
    dangerZone: 'Zone dangereuse', leaveTeam: 'Quitter / Supprimer l\'équipe',
    teamName: 'Nom de l\'équipe', circuit: 'Circuit', series: 'Championnat',
    notes: 'Notes', eventName: 'Nom de l\'événement',
    general: 'Général', role: 'Rôle', lineupAccess: 'Accès lineup', since: 'Depuis',
    noEvents: 'Pas encore d\'événements.', noMembers: 'Aucun membre.', noLineups: 'Pas encore de lineup.',
    lineupName: 'Nom du lineup', editLineup: 'Modifier le lineup', deleteLineup: 'Supprimer le lineup',
    membersRoles: 'Membres & rôles', confirmDeleteLineup: 'Tous les créneaux seront définitivement perdus.',
    // Pricing
    plans: 'Abonnements', free: 'Gratuit', plus: 'Plus', premium: 'Premium',
    currentPlan: 'Plan actuel', upgrade: 'Upgrader', monthly: '/mois',
    choosePlan: 'Choisissez votre Pitwall', noHiddenFees: 'Pas de frais cachés.',
    alwaysFree: 'Toujours gratuit', mostPopular: 'Le plus populaire',
    // Roles
    founder: 'Fondateur', manager: 'Manager', driver: 'Pilote', spectator: 'Spectateur',
    // Logo
    teamLogo: 'Logo équipe', uploadLogo: 'Envoyer un logo', removeLogo: 'Supprimer',
    logoHint: 'PNG, JPG ou SVG · Max 1 Mo',
    logoDesc: 'Le logo apparaît dans l\'en-tête et sur les pages de votre équipe.',
    // Driver profile & settings
    driverProfile: 'Profil pilote', firstName: 'Prénom', lastName: 'Nom',
    carNumber: 'Numéro de voiture', steamAccount: 'Compte Steam',
    notificationsSection: 'Notifications', positionChange: 'Changement de position',
    positionChangeSub: 'Alerte quand votre position change (hors pits)',
    pitStop: 'Arrêt aux pits', pitStopSub: 'Alerte quand une voiture entre ou sort des pits',
    weatherChange: 'Changement météo', weatherChangeSub: 'Alerte quand la pluie commence ou s\'arrête',
    crash: 'Accident / incident', crashSub: 'Alerte sur les incidents détectés',
    stintPlanUpdate: 'Mise à jour stratégie', stintPlanUpdateSub: 'Alerte quand la recommandation change',
    appSection: 'Application', language: 'Langue', languageSub: 'Changer la langue de l\'interface',
    // Telemetry
    recording: 'Enregistrement', backendOffline: 'Backend hors ligne',
    waitingForLap: 'En attente des données de tour…',
    premiumFeature: 'Fonction Premium',
    upgradeWallSub: 'Les traces de télémétrie sont disponibles sur les plans Premium.',
    seePlans: 'Voir les plans →',
    // Workspace panels
    leaderboard: 'Classement', speedGear: 'Vitesse & Rapport', tyres: 'Pneus',
    tyreTelemetry: 'Télémétrie pneus',
    speed: 'Vitesse (km/h)', throttleBrake: 'Accélérateur & Frein (%)', gear: 'Rapport', rpm: 'Régime',
    // Dashboard
    quickAccess: 'Accès rapide', welcomeBack: 'Bon retour',
    // Settings page
    settingsSub: 'Gérez votre nom d\'affichage, langue, dossiers locaux et compte',
    displayNameSection: 'Nom d\'affichage', displayName: 'Nom d\'affichage',
    renameAvailable: 'Vous pouvez changer votre nom d\'affichage.',
    renameCooldown: 'Prochain changement dans', days: 'jours',
    renameSaved: 'Nom d\'affichage mis à jour !',
    nameTooShort: 'Le nom doit faire au moins 2 caractères',
    nameTooLong: 'Le nom doit faire 24 caractères maximum',
    languageSection: 'Langue',
    languageDesc: 'Choisissez la langue de l\'interface. Vous pouvez contribuer en éditant translations.json.',
    localFolders: 'Dossiers locaux',
    localFoldersDesc: 'Assignez des dossiers pour l\'import/export MoTeC et les setups LMU.',
    motecFolder: 'Dossier MoTeC', setupFolder: 'Dossier setups LMU',
    noFolderSelected: 'Aucun dossier sélectionné', browse: 'Parcourir',
    folderSaved: 'Dossier enregistré', enterFolderPath: 'Entrez le chemin du dossier :',
    motecHint: 'Dossier où les fichiers MoTeC .ld/.ldx sont stockés.',
    setupHint: 'Chemin LMU par défaut :',
    deleteAccount: 'Supprimer le compte',
    deleteAccountDesc: 'Supprimez définitivement votre compte Pitwall. Cette action est irréversible.',
    deleteConfirmText: 'Tapez DELETE pour confirmer la suppression :',
    deleteAccountConfirm: 'Supprimer mon compte',
  },
  de: {
    dashboard:'Dashboard', myTeams:'Meine Teams', schedule:'Kalender',
    drivers:'Fahrer', races:'Rennen', settings:'Einstellungen',
    pitwall:'Pitwall', workspace:'Arbeitsbereich', liveTiming:'Live-Timing',
    trackMap:'Streckenkarte', liveTelemetry:'Telemetrie', stintPlan:'Stintstrategie',
    setups:'Setups', pricing:'Pläne',
    soloMode:'Solo', localPitwall:'Lokale Pitwall',
    localPitwallDesc:'Direkte Verbindung zum Spiel — kein Lineup nötig',
    createTeam:'Team erstellen', createTeamDesc:'Gründe dein eigenes Team',
    joinTeam:'Team beitreten', joinTeamDesc:'Teamcode eingeben',
    signInSteam:'Mit Steam anmelden', loginSub:'Live-Renndaten für dein Team.',
    cancel:'Abbrechen', save:'Speichern', delete:'Löschen', edit:'Bearbeiten',
    create:'Erstellen', close:'Schließen', copy:'Kopieren', leave:'Verlassen', join:'Beitreten',
    loading:'Laden', connecting:'Verbinden', saveChanges:'Änderungen speichern',
    clickToCopy:'Zum Kopieren klicken', copied:'✓ Kopiert!', noData:'Keine Daten',
    teamCode:'Teamcode', members:'Mitglieder', events:'Veranstaltungen',
    lineups:'Lineups', tier:'Stufe', newEvent:'Neue Veranstaltung',
    newLineup:'Neues Lineup', inviteCode:'Einladungscode',
    dangerZone:'Gefahrenzone', leaveTeam:'Team verlassen / löschen',
    teamName:'Teamname', circuit:'Strecke', series:'Meisterschaft',
    notes:'Notizen', eventName:'Veranstaltungsname',
    general:'Allgemein', role:'Rolle', lineupAccess:'Lineup-Zugriff', since:'Seit',
    noEvents:'Noch keine Veranstaltungen.', noMembers:'Keine Mitglieder.', noLineups:'Noch keine Lineups.',
    lineupName:'Lineup-Name', editLineup:'Lineup bearbeiten', deleteLineup:'Lineup löschen',
    membersRoles:'Mitglieder & Rollen', confirmDeleteLineup:'Alle Stint-Zuweisungen gehen dauerhaft verloren.',
    plans:'Pläne & Preise', free:'Kostenlos', plus:'Plus', premium:'Premium',
    currentPlan:'Aktueller Plan', upgrade:'Upgraden', monthly:'/Monat',
    choosePlan:'Wähle deine Pitwall', noHiddenFees:'Keine versteckten Gebühren.',
    alwaysFree:'Immer kostenlos', mostPopular:'Am beliebtesten',
    founder:'Gründer', manager:'Manager', driver:'Fahrer', spectator:'Zuschauer',
    teamLogo:'Team-Logo', uploadLogo:'Logo hochladen', removeLogo:'Entfernen',
    logoHint:'PNG, JPG oder SVG · Max 1 MB',
    logoDesc:'Dein Logo erscheint im Header und auf den Teamseiten.',
    driverProfile:'Fahrerprofil', firstName:'Vorname', lastName:'Nachname',
    carNumber:'Startnummer', steamAccount:'Steam-Konto',
    notificationsSection:'Benachrichtigungen', positionChange:'Positionswechsel',
    positionChangeSub:'Benachrichtigung bei Positionsänderung (nicht in der Box)',
    pitStop:'Boxenstopp', pitStopSub:'Benachrichtigung wenn ein Auto die Box ein- oder ausfährt',
    weatherChange:'Wetterwechsel', weatherChangeSub:'Benachrichtigung wenn Regen beginnt oder aufhört',
    crash:'Unfall / Zwischenfall', crashSub:'Benachrichtigung bei erkannten Zwischenfällen',
    stintPlanUpdate:'Strategie-Update', stintPlanUpdateSub:'Benachrichtigung wenn sich die Strategie ändert',
    appSection:'App', language:'Sprache', languageSub:'Oberflächensprache wechseln',
    recording:'Aufzeichnung', backendOffline:'Backend offline',
    waitingForLap:'Warte auf Rundendaten…', premiumFeature:'Premium-Funktion',
    upgradeWallSub:'Telemetrie-Daten pro Runde sind in Premium-Plänen verfügbar.',
    seePlans:'Pläne ansehen →',
    leaderboard:'Rangliste', speedGear:'Geschwindigkeit & Gang', tyres:'Reifen',
    tyreTelemetry:'Reifentelemetrie', speed:'Geschwindigkeit (km/h)',
    throttleBrake:'Gas & Bremse (%)', gear:'Gang', rpm:'Drehzahl',
    quickAccess:'Schnellzugriff', welcomeBack:'Willkommen zurück',
  },
  no: {
    dashboard:'Jeg Er Stian', myTeams:'Tusen Takk', schedule:'Timeplan',
    drivers:'Sjåfører', races:'Løp', settings:'Innstillinger',
    pitwall:'Hvor', workspace:'Arbeidsområde', liveTiming:'Live Timing',
    trackMap:'Banekart', liveTelemetry:'Telemetri', stintPlan:'Stint-plan',
    setups:'Oppsett', pricing:'Planer',
    soloMode:'Solo', localPitwall:'Lokal Pitwall',
    localPitwallDesc:'Koble direkte til spillet — ingen lineup nødvendig',
    createTeam:'Opprett team', createTeamDesc:'Start ditt eget team',
    joinTeam:'Bli med i team', joinTeamDesc:'Skriv inn teamkode',
    signInSteam:'Logg inn med Steam', loginSub:'Live race-data for teamet ditt.',
    cancel:'Avbryt', save:'Lagre', delete:'Slett', edit:'Rediger',
    create:'Opprett', close:'Lukk', copy:'Kopier', leave:'Forlat', join:'Bli med',
    loading:'Laster', connecting:'Kobler til', saveChanges:'Lagre endringer',
    clickToCopy:'Klikk for å kopiere', copied:'✓ Kopiert!', noData:'Ingen data',
    teamCode:'Teamkode', members:'Medlemmer', events:'Arrangementer',
    lineups:'Lineups', tier:'Nivå', newEvent:'Nytt arrangement',
    newLineup:'Ny lineup', inviteCode:'Invitasjonskode',
    dangerZone:'Faresone', leaveTeam:'Forlat / slett team',
    teamName:'Teamnavn', circuit:'Bane', series:'Mesterskap',
    notes:'Notater', eventName:'Arrangementsnavn',
    general:'Generelt', role:'Rolle', lineupAccess:'Lineup-tilgang', since:'Siden',
    noEvents:'Ingen arrangementer ennå.', noMembers:'Ingen medlemmer.', noLineups:'Ingen lineups ennå.',
    lineupName:'Lineup-navn', editLineup:'Rediger lineup', deleteLineup:'Slett lineup',
    membersRoles:'Medlemmer & roller', confirmDeleteLineup:'Alle stint-tildelinger vil gå tapt permanent.',
    plans:'Planer & priser', free:'Gratis', plus:'Plus', premium:'Premium',
    currentPlan:'Nåværende plan', upgrade:'Oppgrader', monthly:'/måned',
    choosePlan:'Velg din Pitwall', noHiddenFees:'Ingen skjulte avgifter.',
    alwaysFree:'Alltid gratis', mostPopular:'Mest populær',
    founder:'Grunnlegger', manager:'Manager', driver:'Sjåfør', spectator:'Tilskuer',
    teamLogo:'Teamlogo', uploadLogo:'Last opp logo', removeLogo:'Fjern',
    logoHint:'PNG, JPG eller SVG · Maks 1 MB',
    logoDesc:'Logoen din vises i headeren og på teamsidene dine.',
    driverProfile:'Sjåførprofil', firstName:'Fornavn', lastName:'Etternavn',
    carNumber:'Bilnummer', steamAccount:'Steam-konto',
    notificationsSection:'Varsler', positionChange:'Posisjonsendring',
    positionChangeSub:'Varsel når posisjonen din endres (ikke i pit)',
    pitStop:'Pitstop', pitStopSub:'Varsel når en bil kjører inn eller ut av pit',
    weatherChange:'Værskifte', weatherChangeSub:'Varsel når regn starter eller stopper',
    crash:'Ulykke / hendelse', crashSub:'Varsel ved oppdagede hendelser',
    stintPlanUpdate:'Stint-plan oppdatering', stintPlanUpdateSub:'Varsel når strategianbefalingen endres',
    appSection:'App', language:'Språk', languageSub:'Bytt grensesnittspråk',
    recording:'Opptak', backendOffline:'Backend offline',
    waitingForLap:'Venter på rundedata…', premiumFeature:'Premium-funksjon',
    upgradeWallSub:'Telemetridata per runde er tilgjengelig i Premium-planer.',
    seePlans:'Se planer →',
    leaderboard:'Resultatliste', speedGear:'Hastighet & Gir', tyres:'Dekk',
    tyreTelemetry:'Dekktelemetri', speed:'Hastighet (km/t)',
    throttleBrake:'Gass & Brems (%)', gear:'Gir', rpm:'Turtall',
    quickAccess:'Hurtigtilgang', welcomeBack:'Velkommen tilbake',
  },
}

const I18n = {
  _lang: localStorage.getItem('pw_lang') || 'en',

  get lang() { return this._lang },

  set lang(l) {
    // Validate against available languages, fall back to 'en'
    this._lang = TRANSLATIONS[l] ? l : 'en'
    localStorage.setItem('pw_lang', this._lang)
    document.documentElement.lang = this._lang
  },

  // All language codes available in the loaded TRANSLATIONS
  get availableLangs() {
    return Object.keys(TRANSLATIONS)
  },

  t(key) {
    return TRANSLATIONS[this._lang]?.[key] ?? TRANSLATIONS['en']?.[key] ?? key
  },

  // Call once per page after DOM ready to translate static [data-i18n] elements
  apply() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n
      el.textContent = this.t(key)
    })
  },
}

// Init lang on load
document.documentElement.lang = I18n.lang

// ─── ASSETS ───────────────────────────────────────────────────────────────────

const Assets = {
  // ── CIRCUITS ──
  // Maps a circuit name string (from session data) to an asset key
  CIRCUIT_MAP: {
    // Exact or partial matches (lowercase)
    'bahrain':       'bahrainwec',
    'barcelona':     'barcelonaelms',
    'barcelone':     'barcelonaelms',
    'catalunya':     'barcelonaelms',
    'montmelo':      'barcelonaelms',
    'cota':          'cotawec',
    'austin':        'cotawec',
    'fuji':          'fujiwec',
    'imola':         'imolawec',
    'interlagos':    'interlagoswec',
    'sao paulo':     'interlagoswec',
    'le mans':       'lemanswec',
    'lemans':        'lemanswec',
    'sarthe':        'lemanswec',
    'monza':         'monzawec',
    'paul ricard':   'paulricardelms',
    'ricard':        'paulricardelms',
    'portimao':      'portimaowec',
    'algarve':       'portimaowec',
    'qatar':         'qatarwec',
    'lusail':        'qatarwec',
    'sebring':       'sebringwec',
    'silverstone':   'silverstoneelms',
    'spa':           'spawec',
    'spa-francorchamps': 'spawec',
  },

  _resolveCircuit(name) {
    if (!name) return null
    const lower = name.toLowerCase()
    for (const [key, val] of Object.entries(this.CIRCUIT_MAP)) {
      if (lower.includes(key)) return val
    }
    return null
  },

  circuitBackground(name) {
    const key = this._resolveCircuit(name)
    return key ? `assets/tracks/backgrounds/${key}.webp` : null
  },

  circuitLogo(name) {
    const key = this._resolveCircuit(name)
    return key ? `assets/tracks/logos/${key}.svg` : 'assets/tracks/logos/Circuit=Default.svg'
  },

  // ── CAR BRANDS ──
  // Maps vehicle string keywords to brand asset filename
  BRAND_MAP: [
    ['alpine',          'Brand=Alpine'],
    ['aston martin',    'Brand=Aston Martin'],
    ['bmw',             'Brand=BMW'],
    ['cadillac',        'Brand=Cadillac'],
    ['chevrolet',       'Brand=Chevrolet'],
    ['corvette',        'Brand=Corvette'],
    ['duqueine',        'Brand=Duqueine'],
    ['ferrari',         'Brand=Ferrari'],
    ['ford',            'Brand=Ford'],
    ['genesis',         'Brand=Genesis'],
    ['ginetta',         'Brand=Ginetta'],
    ['glickenhaus',     'Brand=Glickenhaus'],
    ['isotta',          'Brand=Isotta Fraschini'],
    ['lamborghini',     'Brand=Lamborghini'],
    ['lexus',           'Brand=Lexus'],
    ['ligier',          'Brand=Ligier'],
    ['mclaren',         'Brand=McLaren'],
    ['mercedes',        'Brand=Mercedes-AMG'],
    ['amg',             'Brand=Mercedes-AMG'],
    ['oreca',           'Brand=Oreca'],
    ['peugeot',         'Brand=Peugeot'],
    ['porsche',         'Brand=Porsche'],
    ['toyota',          'Brand=Toyota'],
    ['vanwall',         'Brand=Vanwall'],
  ],

  carLogo(vehicleString, dark = false) {
    if (!vehicleString) return `assets/cars/Brand=Default.svg`
    const lower = vehicleString.toLowerCase()
    for (const [key, file] of this.BRAND_MAP) {
      if (lower.includes(key)) {
        const suffix = dark ? ' Dark.svg' : '.svg'
        return `assets/cars/${file}${suffix}`
      }
    }
    return `assets/cars/Brand=Default.svg`
  },

  // ── TEAM LOGO ──
  // Stored per-team in localStorage as base64 data URL
  teamLogoKey(teamId) { return `pw_team_logo_${teamId}` },

  getTeamLogo(teamId) {
    return localStorage.getItem(this.teamLogoKey(teamId)) || null
  },

  setTeamLogo(teamId, dataUrl) {
    if (dataUrl) localStorage.setItem(this.teamLogoKey(teamId), dataUrl)
    else         localStorage.removeItem(this.teamLogoKey(teamId))
  },

  // Returns a <img> element or null
  teamLogoImg(teamId, cls = '') {
    const src = this.getTeamLogo(teamId)
    if (!src) return null
    const img = document.createElement('img')
    img.src = src
    img.className = cls
    img.alt = 'Team logo'
    return img
  },
}

// ─── AUTH ────────────────────────────────────────────────────────────────────

const Auth = {
  getToken()      { return localStorage.getItem('pw_token') },
  setToken(t)     { localStorage.setItem('pw_token', t) },
  clearToken()    { localStorage.removeItem('pw_token'); localStorage.removeItem('pw_lineup_token') },

  async getUser() {
    const token = this.getToken()
    if (!token) return null
    try {
      const res = await fetch(`${API}/auth/me?token=${token}`)
      if (!res.ok) { this.clearToken(); return null }
      return await res.json()
    } catch { return null }
  },

  async getLineupToken(lineupId) {
    const cached = localStorage.getItem('pw_lineup_token')
    if (cached) {
      try {
        const p = JSON.parse(atob(cached.split('.')[1]))
        if (p.exp > Date.now() / 1000 + 60 && p.lineup_id === lineupId) return cached
      } catch {}
    }
    const res = await fetch(`${API}/api/lineups/${lineupId}/token?token=${this.getToken()}`)
    if (!res.ok) return null
    const { token } = await res.json()
    localStorage.setItem('pw_lineup_token', token)
    return token
  },

  requireAuth() {
    const hash = location.hash
    if (hash.startsWith('#token=')) {
      this.setToken(hash.slice(7))
      history.replaceState(null, '', location.pathname)
    }
    if (!this.getToken()) { _navigate('index.html'); return false }
    return true
  },

  steamLoginUrl() { return `${API}/auth/steam?source=electron` },
  logout()        { this.clearToken(); _navigate('index.html') },
}

// ─── NAV STATE ───────────────────────────────────────────────────────────────

const Nav = {
  get(key)     { return localStorage.getItem(`pw_nav_${key}`) },
  set(key, v)  { localStorage.setItem(`pw_nav_${key}`, v) },
  clear(key)   { localStorage.removeItem(`pw_nav_${key}`) },

  getParam(key) {
    const params = new URLSearchParams(location.search)
    const urlVal = params.get(key)
    if (urlVal) {
      localStorage.setItem(`pw_nav_${key}`, urlVal)
      return urlVal
    }
    return localStorage.getItem(`pw_nav_${key}`)
  },

  goTeam(teamId, teamName) {
    localStorage.setItem('pw_nav_team_id', teamId)
    localStorage.setItem('pw_nav_team_name', teamName)
    _navigate(`team.html?team_id=${encodeURIComponent(teamId)}&team_name=${encodeURIComponent(teamName)}`)
  },
  goEvent(eventId, eventName) {
    localStorage.setItem('pw_nav_event_id', eventId)
    localStorage.setItem('pw_nav_event_name', eventName)
    _navigate(`event.html?event_id=${encodeURIComponent(eventId)}&event_name=${encodeURIComponent(eventName)}`)
  },
  goLineup(lineupId, lineupName) {
    localStorage.setItem('pw_nav_lineup_id', lineupId)
    localStorage.setItem('pw_nav_lineup_name', lineupName)
    _navigate(`pitwall.html?lineup_id=${encodeURIComponent(lineupId)}&lineup_name=${encodeURIComponent(lineupName)}`)
  },
}

// ─── WEBSOCKET ────────────────────────────────────────────────────────────────

class PitwallSocket {
  constructor(lineupId, handlers = {}) {
    this.lineupId    = lineupId
    this.handlers    = handlers
    this.ws          = null
    this.reconnect   = true
    this._retries    = 0
    this._pollTimer  = null
    this._wsOk       = false
  }

  async connect() {
    const tok = await Auth.getLineupToken(this.lineupId)
    if (!tok) {
      console.warn('[PitwallSocket] No lineup token — falling back to REST poll')
      this._startRestPoll()
      return
    }

    const url = `wss://pitwall.cert-team.fr/ws/watch?token=${tok}&lineup_id=${this.lineupId}`
    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      this._retries = 0
      this._wsOk    = true
      this._stopRestPoll()
      this.handlers.onStatus?.('connected')
    }

    this.ws.onmessage = ({ data }) => {
      try {
        const msg = JSON.parse(data)
        if (msg.type === 'snapshot') {
          this.handlers.onSnapshot?.(msg)
          if (msg.data?.session)   this.handlers.onSession?.(msg.data.session)
          if (msg.data?.driver)    this.handlers.onDriver?.(msg.data.driver)
          if (msg.data?.standings) this.handlers.onStandings?.(msg.data.standings)
          this.handlers.onPublisher?.(msg.publisher)
        } else if (msg.type === 'update') {
          if (msg.topic === 'session')   this.handlers.onSession?.(msg.data)
          if (msg.topic === 'driver')    this.handlers.onDriver?.(msg.data)
          if (msg.topic === 'standings') this.handlers.onStandings?.(msg.data)
          if (msg.topic === 'strategy')  this.handlers.onStrategy?.(msg.data)
        } else if (msg.type === 'status') {
          this.handlers.onPublisher?.(msg.publisher)
        }
      } catch {}
    }

    this.ws.onclose = () => {
      this._wsOk = false
      this.handlers.onStatus?.('disconnected')
      if (this.reconnect) {
        // After 2 failed attempts, also start REST polling as fallback
        if (this._retries >= 2) this._startRestPoll()
        const delay = Math.min(1000 * 2 ** this._retries, 30000)
        this._retries++
        setTimeout(() => this.connect(), delay)
      }
    }

    this.ws.onerror = () => {
      this._wsOk = false
      this.handlers.onStatus?.('error')
      // Start REST polling immediately on WS error
      this._startRestPoll()
    }
  }

  // ── REST polling fallback — reads /state on the VPS ──
  _startRestPoll() {
    if (this._pollTimer) return  // already polling
    console.info('[PitwallSocket] Starting REST poll fallback')
    this._poll()
    this._pollTimer = setInterval(() => this._poll(), 2000)
  }

  _stopRestPoll() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer)
      this._pollTimer = null
    }
  }

  async _poll() {
    try {
      const res = await fetch(`${API}/state`, { cache: 'no-store' })
      if (!res.ok) return
      const raw = await res.json()

      // State is keyed by lineupId, or falls back to "default"
      const state = raw[this.lineupId] || raw['default'] || raw

      if (state.session)   this.handlers.onSession?.(state.session)
      if (state.driver)    this.handlers.onDriver?.(state.driver)
      if (state.standings) this.handlers.onStandings?.(state.standings)

      // Signal publisher alive if we have real session data
      const hasData = state.session && Object.keys(state.session).length > 0
      this.handlers.onPublisher?.(hasData)
      if (hasData) this.handlers.onStatus?.('connected')
    } catch (e) {
      console.warn('[PitwallSocket] REST poll failed:', e)
      this.handlers.onStatus?.('disconnected')
    }
  }

  close() {
    this.reconnect = false
    this._stopRestPoll()
    this.ws?.close()
  }
}

// ─── LOCAL SOCKET (pilote présent — ws://localhost:54345 via native WebSocket) ─────
// Messages are plain JSON in the same format as the VPS /ws/watch:
//   {type: "snapshot", data: {session, driver, standings, strategy}, publisher}
//   {type: "update",   topic: "session|driver|standings|strategy", data: ...}
//   {type: "event",    event: "new_lap|pit_in|engineer", data: ...}

class LocalSocket {
  constructor(handlers = {}) {
    this.handlers = handlers
    this._ws      = null
    this._retries = 0
    this.reconnect = true
  }

  connect() {
    this._connectWS()
  }

  _connectWS() {
    try {
      this._ws = new WebSocket((window.PITWALL && window.PITWALL.WS_URL) || 'ws://localhost:54345')

      this._ws.onopen = () => {
        this._retries = 0
        this._stopRestPoll()
        this.handlers.onStatus?.('connected')
        this.handlers.onPublisher?.(true)
        console.info('[LocalSocket] Connected to PIT Wall backend')
      }

      this._ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          this._handleMessage(msg)
        } catch (e) {
          console.warn('[LocalSocket] Parse error:', e)
        }
      }

      this._ws.onclose = () => {
        this.handlers.onStatus?.('disconnected')
        this.handlers.onPublisher?.(false)
        this._scheduleReconnect()
      }

      this._ws.onerror = () => {
        this.handlers.onStatus?.('error')
      }
    } catch (e) {
      console.warn('[LocalSocket] WebSocket init failed:', e)
      this._startRestPoll()
    }
  }

  _handleMessage(msg) {
    const type = msg.type

    if (type === 'snapshot') {
      // Full state on connect: {session, driver, standings, strategy}
      const d = msg.data || {}
      this.handlers.onPublisher?.(msg.publisher ?? true)
      if (d.session)    this.handlers.onSession?.(d.session)
      if (d.driver)     this.handlers.onDriver?.(d.driver)
      if (d.standings)  this.handlers.onStandings?.(d.standings)
      if (d.strategy)   this.handlers.onStrategy?.(d.strategy)
    }

    if (type === 'update') {
      const topic = msg.topic
      const data  = msg.data
      if (topic === 'session')    this.handlers.onSession?.(data)
      if (topic === 'driver')     this.handlers.onDriver?.(data)
      if (topic === 'standings')  this.handlers.onStandings?.(data)
      if (topic === 'strategy')   this.handlers.onStrategy?.(data)
    }

    if (type === 'event') {
      if (msg.event === 'engineer') this.handlers.onEngineer?.(msg.data)
      this.handlers.onEvent?.(msg.event, msg.data)
    }
  }

  _scheduleReconnect() {
    if (!this.reconnect) return
    this._retries++
    const delay = Math.min(10000, 1000 * Math.pow(1.5, this._retries))
    console.info(`[LocalSocket] Reconnecting in ${Math.round(delay/1000)}s...`)
    setTimeout(() => {
      if (this.reconnect) this._connectWS()
    }, delay)
    this._startRestPoll()
  }

  // ── REST polling fallback — reads /api/cache on local backend ──
  _pollTimer = null

  _startRestPoll() {
    if (this._pollTimer) return
    console.info('[LocalSocket] Starting REST poll fallback')
    this._poll()
    this._pollTimer = setInterval(() => this._poll(), 2000)
  }

  _stopRestPoll() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer)
      this._pollTimer = null
    }
  }

  async _poll() {
    try {
      const res = await fetch('http://localhost:5000/api/cache', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()

      // Cache layout: { fast:{}, slow:{}, standings:[], rest:{} }
      const combined = { ...data.slow, ...data.fast, ...data.rest }
      if (Object.keys(combined).length) {
        this.handlers.onSession?.(combined)
        this.handlers.onDriver?.(combined)
      }
      if (Array.isArray(data.standings) && data.standings.length) {
        this.handlers.onStandings?.(data.standings)
      }
      const hasData = Object.keys(data.fast || {}).length > 0
      this.handlers.onPublisher?.(hasData)
      if (hasData) this.handlers.onStatus?.('connected')
    } catch {
      // local backend not running — silently ignore
    }
  }

  close() {
    this.reconnect = false
    this._stopRestPoll()
    if (this._ws) {
      this._ws.close()
      this._ws = null
    }
  }
}

// ─── UTILS ───────────────────────────────────────────────────────────────────

function fmtTime(s) {
  if (!s || s <= 0) return '0:00:00'
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = Math.floor(s%60)
  return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
}
function fmtLap(s) {
  if (!s || s <= 0) return '—'
  return `${Math.floor(s/60)}:${(s%60).toFixed(3).padStart(6,'0')}`
}
function esc(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}
function setText(id, val) { const el=document.getElementById(id); if(el) el.textContent=val }
function classColor(vc) {
  const c=(vc||'').toLowerCase()
  if(c.includes('hyper')) return '#e11d48'
  if(c.includes('lmp2'))  return '#3b8fff'
  if(c.includes('lmp3'))  return '#a855f7'
  if(c.includes('gte'))   return '#22c55e'
  if(c.includes('gt3'))   return '#ff8c00'
  return '#666'
}

// ─── LANG SWITCHER WIDGET ────────────────────────────────────────────────────

function renderLangSwitcher() {
  const wrap = document.createElement('div')
  wrap.className = 'lang-switcher'
  const langs = I18n.availableLangs
  wrap.innerHTML = langs.map((l, i) =>
    (i > 0 ? '<span style="color:var(--border)">|</span>' : '') +
    `<button class="lang-btn${I18n.lang===l?' active':''}" onclick="setLang('${l}')">${l.toUpperCase()}</button>`
  ).join('')
  return wrap
}

function setLang(l) {
  I18n.lang = l
  document.body.classList.remove('pw-ready')
  document.body.classList.add('pw-out')
  setTimeout(() => location.reload(), 130)
}

// ─── TEAM LOGO UPLOAD WIDGET ─────────────────────────────────────────────────

// Returns HTML string for logo upload area inside a modal/settings section
function renderLogoUploader(teamId, canEdit) {
  const existing = Assets.getTeamLogo(teamId)
  if (!canEdit) {
    // Read-only display
    return existing
      ? `<div class="logo-display"><img src="${existing}" class="team-logo-preview" alt="Team logo"></div>`
      : ''
  }
  return `
    <div class="logo-uploader" id="logo-uploader">
      ${existing ? `<img src="${existing}" class="team-logo-preview" id="logo-preview" alt="">` : `<div class="logo-placeholder" id="logo-preview">🏁</div>`}
      <div class="logo-upload-actions">
        <label class="btn-ghost" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px">
          <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp"
            style="display:none" onchange="handleLogoUpload(event,'${teamId}')">
          ↑ ${I18n.t('uploadLogo')}
        </label>
        ${existing ? `<button class="btn-ghost" style="border-color:var(--red);color:var(--red)" onclick="removeLogo('${teamId}')">✕ ${I18n.t('removeLogo')}</button>` : ''}
      </div>
      <div style="font-size:10px;color:var(--muted);margin-top:4px">${I18n.t('logoHint')}</div>
    </div>`
}

function handleLogoUpload(e, teamId) {
  const file = e.target.files[0]
  if (!file || file.size > 1_048_576) { alert('File too large (max 1MB)'); return }
  const reader = new FileReader()
  reader.onload = ev => {
    Assets.setTeamLogo(teamId, ev.target.result)
    // Update preview in page
    const preview = document.getElementById('logo-preview')
    if (preview) {
      preview.outerHTML = `<img src="${ev.target.result}" class="team-logo-preview" id="logo-preview" alt="">`
    }
    // Refresh header logo if visible
    const headerLogo = document.getElementById('header-team-logo')
    if (headerLogo) headerLogo.src = ev.target.result
  }
  reader.readAsDataURL(file)
}

function removeLogo(teamId) {
  Assets.setTeamLogo(teamId, null)
  const uploader = document.getElementById('logo-uploader')
  if (uploader) uploader.innerHTML = renderLogoUploader(teamId, true)
  const headerLogo = document.getElementById('header-team-logo')
  if (headerLogo) headerLogo.remove()
}

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────

function _timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60)   return `${s}s ago`
  if (s < 3600) return `${Math.floor(s/60)}m ago`
  return `${Math.floor(s/3600)}h ago`
}

const Notifications = {
  _key:      'pw_notifications',
  _prefsKey: 'pw_notif_prefs',
  _dndKey:   'pw_dnd',
  _volKey:   'pw_notif_volume',

  // ── Do Not Disturb ──
  // Manual DND (user toggle) persisted in localStorage
  // Auto DND (driving) is runtime-only — set by PitNotifier.update()
  _autoDND: false,

  get isDND() {
    if (this._autoDND) return true
    return localStorage.getItem(this._dndKey) === '1'
  },

  setDND(on) { localStorage.setItem(this._dndKey, on ? '1' : '0'); this._updateBadge() },
  get manualDND() { return localStorage.getItem(this._dndKey) === '1' },
  toggleDND() {
    this.setDND(!this.manualDND)
    // Re-render panel header if open
    const panel = document.getElementById('notif-panel')
    if (panel && panel.style.display === 'block') this._refreshPanel()
  },

  setAutoDND(driving) { this._autoDND = !!driving },

  // ── Volume (0–1) ──
  get volume() {
    const v = parseFloat(localStorage.getItem(this._volKey))
    return isNaN(v) ? 0.5 : Math.max(0, Math.min(1, v))
  },
  setVolume(v) { localStorage.setItem(this._volKey, String(Math.max(0, Math.min(1, v)))) },

  // ── Sound files per notification type ──
  _sounds: {
    position_change: 'assets/sounds/notifs/position_change.mp3',
    pit_stop:        'assets/sounds/notifs/pit_stop.mp3',
    weather:         'assets/sounds/notifs/weather.mp3',
    crash:           'assets/sounds/notifs/crash.mp3',
    stint_plan:      'assets/sounds/notifs/stint_plan.mp3',
    flag:            'assets/sounds/notifs/flag.mp3',
    fuel:            'assets/sounds/notifs/fuel.mp3',
    rival:           'assets/sounds/notifs/rival.mp3',
    performance:     'assets/sounds/notifs/performance.mp3',
  },

  _audioCache: {},

  _playSound(type) {
    if (this.isDND) return
    const src = this._sounds[type]
    if (!src) return
    try {
      // Reuse or create Audio element per type
      let audio = this._audioCache[type]
      if (!audio) {
        audio = new Audio(src)
        this._audioCache[type] = audio
      }
      audio.volume = this.volume
      audio.currentTime = 0
      audio.play().catch(() => {}) // ignore autoplay restrictions
    } catch (_) {}
  },

  // ── System notification (Windows toast via Electron) ──
  _systemNotify(type, message) {
    if (this.isDND) return
    // Electron Notification API (from preload)
    if (window.electronAPI?.showNotification) {
      window.electronAPI.showNotification({
        title: 'Pitwall',
        body: message,
        icon: 'assets/icon.png',
      })
      return
    }
    // Web fallback — browser Notification API
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification('Pitwall', { body: message, icon: 'assets/icon.png', silent: true })
    } else if (typeof Notification !== 'undefined' && Notification.permission !== 'denied') {
      Notification.requestPermission()
    }
  },

  defaultPrefs: {
    position_change: true,
    pit_stop:        true,
    weather:         true,
    crash:           true,
    stint_plan:      true,
    flag:            true,
    fuel:            true,
    rival:           true,
    performance:     true,
  },

  getPrefs() {
    try { return { ...this.defaultPrefs, ...JSON.parse(localStorage.getItem(this._prefsKey) || '{}') } }
    catch { return { ...this.defaultPrefs } }
  },

  setPrefs(p) { localStorage.setItem(this._prefsKey, JSON.stringify(p)) },

  get() {
    try { return JSON.parse(localStorage.getItem(this._key) || '[]') } catch { return [] }
  },

  push(type, message, meta = {}) {
    if (!this.getPrefs()[type]) return
    const all = this.get()
    all.unshift({ id: Date.now(), type, message, meta, ts: Date.now(), read: false })
    localStorage.setItem(this._key, JSON.stringify(all.slice(0, 50)))
    this._updateBadge()

    // Sound + system notification (suppressed by DND)
    this._playSound(type)
    this._systemNotify(type, message)
  },

  markAllRead() {
    const all = this.get().map(n => ({ ...n, read: true }))
    localStorage.setItem(this._key, JSON.stringify(all))
    this._updateBadge()
  },

  unreadCount() { return this.get().filter(n => !n.read).length },

  _updateBadge() {
    const badge = document.getElementById('notif-badge')
    const count = this.unreadCount()
    if (badge) {
      badge.textContent  = count > 9 ? '9+' : count
      badge.style.display = count > 0 ? 'flex' : 'none'
    }
    // Update DND indicator if present
    const dndDot = document.getElementById('dnd-dot')
    if (dndDot) dndDot.style.display = this.isDND ? 'block' : 'none'
  },

  _icons: { position_change:'↑↓', pit_stop:'⬛', weather:'🌧', crash:'💥', stint_plan:'≡', flag:'🏁', fuel:'⛽', rival:'🔧', performance:'⚡' },

  _renderPanelHTML() {
    const all = this.get()
    if (!all.length) return '<div style="padding:20px;color:var(--muted);text-align:center;font-size:12px;letter-spacing:.1em;text-transform:uppercase">No notifications</div>'
    return all.slice(0, 30).map(n => `
      <div class="notif-item${n.read ? '' : ' unread'}">
        <div class="notif-icon">${this._icons[n.type] || '•'}</div>
        <div class="notif-body">
          <div class="notif-msg">${esc(n.message)}</div>
          <div class="notif-time">${_timeAgo(n.ts)}</div>
        </div>
      </div>`).join('')
  },

  togglePanel() {
    let panel = document.getElementById('notif-panel')
    if (!panel) {
      panel = document.createElement('div')
      panel.id = 'notif-panel'
      panel.className = 'notif-panel'
      document.body.appendChild(panel)
      document.addEventListener('click', (e) => {
        const bell = document.getElementById('notif-bell')
        if (panel.style.display === 'block' && !panel.contains(e.target) && !bell?.contains(e.target)) {
          panel.style.display = 'none'
        }
      })
    }
    if (panel.style.display === 'block') {
      panel.style.display = 'none'
      return
    }
    this._refreshPanel()
    panel.style.display = 'block'
    this.markAllRead()
    this._updateBadge()
  },

  _refreshPanel() {
    const panel = document.getElementById('notif-panel')
    if (!panel) return
    const dndOn = this.manualDND
    const autoDnd = this._autoDND
    const dndLabel = autoDnd ? 'DND (Driving)' : (dndOn ? 'DND On' : 'DND Off')
    const dndCls = (dndOn || autoDnd) ? ' on' : ''
    const dndDisabled = autoDnd ? 'disabled title="Auto DND while driving"' : `onclick="Notifications.toggleDND()"`
    panel.innerHTML = `
      <div class="notif-panel-header">
        <span>Notifications</span>
        <div style="display:flex;align-items:center;gap:8px">
          <button class="notif-dnd-btn${dndCls}" ${dndDisabled}>${dndLabel}</button>
          <button onclick="Notifications.clearAll()" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:10px;letter-spacing:.1em;text-transform:uppercase">Clear all</button>
        </div>
      </div>
      <div class="notif-list">${this._renderPanelHTML()}</div>`
  },

  clearAll() {
    localStorage.removeItem(this._key)
    const panel = document.getElementById('notif-panel')
    if (panel) panel.style.display = 'none'
    this._updateBadge()
  },
}

// ── PitNotifier — delegates to NotificationEngine if available, else basic fallback ──
class PitNotifier {
  constructor(options) {
    if (typeof NotificationEngine !== 'undefined') {
      this._engine = new NotificationEngine(options)
    } else {
      this._engine = null
      this._s = {}
    }
  }

  update(session, driver, standings) {
    // Auto DND: silence notifications when the player is actively driving
    if (driver) {
      const isDriving = !!driver.is_driving || (driver.in_pits === false && driver.speed > 5)
      Notifications.setAutoDND(isDriving)
    }

    if (this._engine) {
      this._engine.update(session, driver, standings)
      return
    }
    // Fallback: basic checks
    if (session) this._checkWeather(session)
    if (driver) this._checkPit(driver)
  }

  setFuelPerLap(fpl) { this._engine?.setFuelPerLap(fpl) }
  setTeamVehicles(ids) { this._engine?.setTeamVehicles(ids) }

  _checkWeather(s) {
    const was = this._s.rain, now = !!s.is_raining
    if (was !== undefined && was !== now)
      Notifications.push('weather', now ? 'Rain has started on track' : 'Rain has stopped')
    this._s.rain = now
  }

  _checkPit(d) {
    const was = this._s.inPits, now = !!d.in_pits
    if (was !== undefined && was !== now)
      Notifications.push('pit_stop', now ? 'Car entered the pits' : 'Car exited the pits')
    this._s.inPits = now
  }

  reset() { this._engine ? this._engine.reset() : (this._s = {}) }
}

// ─── HEADER ──────────────────────────────────────────────────────────────────

const HEADER_MODES = {
  dashboard: (ctx) => [
    { label: I18n.t('dashboard'), href: 'main.html', id: 'dashboard' },
    { label: I18n.t('pricing'),   href: 'main-subscription.html',   id: 'pricing'   },
  ],
  team: (ctx) => [
    { label: ctx.teamName || I18n.t('myTeams'), href: 'team.html', id: 'team', accent: true },
    { label: I18n.t('drivers'),  href: 'team.html#drivers',  id: 'drivers'  },
    { label: I18n.t('races'),    href: 'team.html#races',    id: 'races'    },
    { label: I18n.t('settings'), href: 'team.html#settings', id: 'settings' },
  ],
  event: (ctx) => [
    { label: ctx.teamName || I18n.t('myTeams'), href: 'team.html', accent: true },
  ],
  lineup: (ctx) => [
    { label: ctx.teamName || I18n.t('myTeams'), href: 'team.html', accent: true },
    { label: I18n.t('pitwall'), href: 'pitwall.html', id: 'pitwall', group: 'pitwall', popout: true, children: [
        { label: I18n.t('workspace'),  href: 'pitwall-workspace.html', id: 'pitwall-workspace', popout: true },
        { label: I18n.t('liveTiming'), href: 'pitwall-livetiming.html', id: 'pitwall-livetiming',       popout: true },
        { label: I18n.t('trackMap'),   href: 'pitwall-trackmap.html',   id: 'pitwall-trackmap',         popout: true },
    ]},
    { label: I18n.t('setups'),    href: 'setups.html',      id: 'setups',      group: 'setups',    popout: true },
    { label: I18n.t('stintPlan'), href: 'pitwall_setup.html', id: 'stint-plan',  group: 'stint',     popout: true, children: [
        { label: I18n.t('Summary') || 'Summary',       href: 'stint-summary.html', id: 'stint-summary', popout: true },
        { label: I18n.t('Stint Table') || 'Plan',              href: 'stint-plan.html',    id: 'stint-plan-view', popout: true },
        { label: I18n.t('Tyres Allocation') || 'Tyres',       href: 'stint-tyres.html',   id: 'stint-tyres',  popout: true },
    ]},
    { label: I18n.t('liveTelemetry'), href: 'telemetry.html', id: 'telemetry', group: 'telemetry', popout: true, children: [
        { label: I18n.t('Analyse') || 'Analyse',  href: 'telemetry-analyse.html', id: 'telemetry-analyse', popout: true },
        { label: I18n.t('Record') || 'Record',    href: 'telemetry-record.html',  id: 'telemetry-record',  popout: true },
    ]},
  ],
  local: () => [
    { label: I18n.t('pitwall'), href: 'pitwall.html', id: 'pitwall', group: 'pitwall', popout: true, children: [
        { label: I18n.t('workspace'),  href: 'pitwall-workspace.html', id: 'pitwall-workspace', popout: true },
        { label: I18n.t('liveTiming'), href: 'pitwall-livetiming.html', id: 'pitwall-livetiming',       popout: true },
        { label: I18n.t('trackMap'),   href: 'pitwall-trackmap.html',   id: 'pitwall-trackmap',         popout: true },
    ]},
    { label: I18n.t('stintPlan'), href: 'stint-setup.html', id: 'stint-plan', group: 'stint', popout: true, children: [
        { label: I18n.t('summary') || 'Summary',       href: 'stint-summary.html', id: 'stint-summary', popout: true },
        { label: I18n.t('plan') || 'Plan',              href: 'stint-plan.html',    id: 'stint-plan-view', popout: true },
        { label: I18n.t('tyresAlloc') || 'Tyres',       href: 'stint-tyres.html',   id: 'stint-tyres',  popout: true },
    ]},
    { label: I18n.t('liveTelemetry'), href: 'telemetry.html', id: 'telemetry', group: 'telemetry', popout: true, children: [
        { label: I18n.t('analyse') || 'Analyse',  href: 'telemetry-analyse.html', id: 'telemetry-analyse', popout: true },
        { label: I18n.t('record') || 'Record',    href: 'telemetry-record.html',  id: 'telemetry-record',  popout: true },
    ]},
  ],
}

const _TB_HOME_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>'
const _TB_LANG_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>'
const _TB_MIN_SVG  = '<svg width="12" height="12" viewBox="0 0 12 12"><rect y="5" width="12" height="2" fill="currentColor"/></svg>'
const _TB_MAX_SVG  = '<svg width="12" height="12" viewBox="0 0 12 12"><rect x="1" y="1" width="10" height="10" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>'
const _TB_RESTORE_SVG = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="8" height="8"/><path d="M3 3V1h8v8h-2"/></svg>'
const _TB_CLOSE_SVG= '<svg width="12" height="12" viewBox="0 0 12 12"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.5"/></svg>'
const _TB_POPOUT_SVG= '<svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4.5 1.5H2a1 1 0 0 0-1 1V10a1 1 0 0 0 1 1h7.5a1 1 0 0 0 1-1V7.5"/><path d="M7 1h4v4"/><path d="M11 1L5.5 6.5"/></svg>'
const _TB_CHEVRON_SVG= '<svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 3l2 2 2-2"/></svg>'
const _TB_HAMBURGER_SVG= '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 5h12M3 9h12M3 13h12"/></svg>'
const _TB_BELL_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>'
const _TB_BELL_OFF_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.91-4.5"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'

// Window controls (Electron)
function _tbMinimize() { if (window.electronAPI) window.electronAPI.minimize() }
function _tbMaximize() { if (window.electronAPI) window.electronAPI.maximize() }
function _tbClose()    { if (window.electronAPI) window.electronAPI.close() }

// Swap the max/restore icon when window state changes
// 2 squares (restore icon) when windowed, 1 square when maximized
function _tbUpdateMaxIcon(isMax) {
  const btn = document.getElementById('tb-max-btn')
  if (btn) btn.innerHTML = isMax ? _TB_MAX_SVG : _TB_RESTORE_SVG
}
if (window.electronAPI?.onMaximizeChange) {
  window.electronAPI.onMaximizeChange(_tbUpdateMaxIcon)
}

// ── Pop-out window management ──
const _poppedOutPages = new Set(JSON.parse(sessionStorage.getItem('pw_popouts') || '[]'))

function _isPagePoppedOut(pageId) { return _poppedOutPages.has(pageId) }

function _togglePopout(pageId, href) {
  if (_poppedOutPages.has(pageId)) {
    // Close this popout
    if (window.electronAPI?.closePopout) window.electronAPI.closePopout(pageId)
    _poppedOutPages.delete(pageId)
    _syncPopoutState()
    // If we're on this page, remove overlay and reload
    if (_currentActivePage === pageId) { location.reload(); return }
    renderHeader(_currentHeaderMode, _currentActivePage)
  } else {
    // Build href with current lineup params so the popout has context
    const lineupId = localStorage.getItem('pw_active_lineup') || ''
    const lineupName = localStorage.getItem('pw_active_lineup_name') || ''
    const sep = href.includes('?') ? '&' : '?'
    const fullHref = lineupId
      ? `${href}${sep}lineup_id=${encodeURIComponent(lineupId)}&lineup_name=${encodeURIComponent(lineupName)}`
      : href
    if (window.electronAPI?.openPopout) {
      window.electronAPI.openPopout({ view: pageId, href: fullHref })
    } else {
      console.warn('[Popout] electronAPI.openPopout not available')
    }
    _poppedOutPages.add(pageId)
    _syncPopoutState()
    // If we're currently on the page being popped out, show overlay
    if (_currentActivePage === pageId) { location.reload(); return }
    renderHeader(_currentHeaderMode, _currentActivePage)
  }
}

function _syncPopoutState() {
  sessionStorage.setItem('pw_popouts', JSON.stringify([..._poppedOutPages]))
}

// Listen for popout status changes from main process
if (window.electronAPI?.onPopoutStatusChange) {
  window.electronAPI.onPopoutStatusChange((event, data) => {
    if (data.isOpen) _poppedOutPages.add(data.view)
    else _poppedOutPages.delete(data.view)
    _syncPopoutState()
    if (typeof renderHeader === 'function' && _currentHeaderMode) renderHeader(_currentHeaderMode, _currentActivePage)
  })
}

// Track current header state for re-renders
let _currentHeaderMode = ''
let _currentActivePage = ''

// Popout mode detection — popout windows get a minimal fixed header
const _isPopoutMode = new URLSearchParams(location.search).get('mode') === 'popout'

// ── Mobile menu ──
function _toggleMobileMenu() {
  const el = document.getElementById('mobile-menu')
  if (el) el.classList.toggle('open')
}

// ── Dropdown management ──
function _toggleDropdown(groupId) {
  const el = document.getElementById('dropdown-' + groupId)
  if (!el) return
  const wasOpen = el.classList.contains('open')
  // Close all dropdowns first
  document.querySelectorAll('.titlebar-dropdown.open').forEach(d => d.classList.remove('open'))
  if (!wasOpen) el.classList.add('open')
}

// Close dropdowns & mobile menu on click outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.titlebar-tab-group')) {
    document.querySelectorAll('.titlebar-dropdown.open').forEach(d => d.classList.remove('open'))
  }
  if (!e.target.closest('.titlebar-hamburger') && !e.target.closest('.mobile-menu')) {
    const mm = document.getElementById('mobile-menu')
    if (mm) mm.classList.remove('open')
  }
})

// Profile dropdown
function _tbToggleProfile() { document.getElementById('profile-dropdown')?.classList.toggle('open') }
function _openOverlayDesigner() {
  if (window.electronAPI?.overlays?.openDesigner) {
    window.electronAPI.overlays.openDesigner()
    document.getElementById('profile-dropdown')?.classList.remove('open')
  }
}
document.addEventListener('click', (e) => {
  const dd = document.getElementById('profile-dropdown')
  if (dd && !dd.contains(e.target) && !e.target.closest('.profile-trigger')) {
    dd.classList.remove('open')
  }
})

async function renderHeader(mode, activePage) {
  _currentHeaderMode = mode
  _currentActivePage = activePage

  // Popout mode — minimal non-navigable header
  if (_isPopoutMode) {
    const el = document.getElementById('app-header')
    if (el) el.innerHTML = `
      <div class="titlebar-left">
        <div class="titlebar-logo">⬡ PITWALL</div>
      </div>
      <div class="titlebar-center">
        <span class="titlebar-tab active" style="cursor:default">${esc(I18n.t(activePage) || activePage)}</span>
        <span style="font-size:9px;color:var(--muted);letter-spacing:.1em;text-transform:uppercase;margin-left:8px">POP-OUT</span>
      </div>
      <div class="titlebar-right">
        <div class="live-dot" id="live-dot"></div>
        <div class="window-controls">
          <div class="window-btn" onclick="_tbMinimize()">${_TB_MIN_SVG}</div>
          <div class="window-btn" id="tb-max-btn" onclick="_tbMaximize()">${_TB_RESTORE_SVG}</div>
          <div class="window-btn close" onclick="_tbClose()">${_TB_CLOSE_SVG}</div>
        </div>
      </div>`
    return
  }

  const data = await Auth.getUser()
  if (!data) { Auth.logout(); return }
  const { user } = data

  const ctx = {
    teamName:   Nav.get('team_name'),
    eventName:  Nav.get('event_name'),
    lineupName: Nav.get('lineup_name'),
  }

  // Build tabs from HEADER_MODES
  const links = (HEADER_MODES[mode]?.(ctx) || [])

  // Check if activePage belongs to a group (parent or child)
  function _isGroupActive(l) {
    if (activePage === l.id) return true
    if (l.children) return l.children.some(c => activePage === c.id)
    return false
  }

  const tabsHTML = links.map(l => {
    if (l.action) return `<button class="titlebar-tab" onclick="${l.action.toString().replace(/"/g,"'")}">${l.label}</button>`
    const accent = l.accent ? ' accent' : ''

    // Simple tab (no children, no group)
    if (!l.children) {
      const active = _isGroupActive(l) ? ' active' : ''
      const poppedOut = l.popout && _isPagePoppedOut(l.id) ? ' popped-out' : ''
      const hashIdx = l.href.indexOf('#')
      const isHashLink = hashIdx !== -1 && l.href.substring(0, hashIdx) === location.pathname.split('/').pop()
      const hash = isHashLink ? l.href.substring(hashIdx + 1) : null
      const onclick = hash
        ? `if(typeof switchTab==='function'){switchTab('${hash}',this)}else{location.hash='${hash}'};document.querySelectorAll('.titlebar-tab').forEach(t=>t.classList.remove('active'));this.classList.add('active')`
        : `_navigate('${l.href}')`
      const popoutBtn = l.popout
        ? `<span class="popout-btn${_isPagePoppedOut(l.id) ? ' active' : ''}" title="Open in new window" onclick="event.stopPropagation();_togglePopout('${l.id}','${l.href}')">${_TB_POPOUT_SVG}</span>`
        : ''
      return `<button class="titlebar-tab${active}${accent}${poppedOut}" onclick="${onclick}">${esc(l.label)}${popoutBtn}</button>`
    }

    // Tab with dropdown children
    const groupActive = _isGroupActive(l) ? ' active' : ''
    const groupId = l.group || l.id
    const dropdownItems = [
      // Parent page as first item
      l,
      ...l.children
    ].map(c => {
      const cActive = activePage === c.id ? ' active' : ''
      const cPopped = c.popout && _isPagePoppedOut(c.id) ? ' popped-out' : ''
      const popBtn = c.popout
        ? `<span class="popout-btn${_isPagePoppedOut(c.id) ? ' active' : ''}" title="Pop out" onclick="event.stopPropagation();_togglePopout('${c.id}','${c.href}')">${_TB_POPOUT_SVG}</span>`
        : ''
      return `<div class="dropdown-item${cActive}${cPopped}" onclick="_navigate('${c.href}')">${esc(c.label)}${popBtn}</div>`
    }).join('')

    return `<div class="titlebar-tab-group">
      <button class="titlebar-tab${groupActive}" onclick="_navigate('${l.href}')">
        ${esc(l.label)}
        <span class="dropdown-arrow" onclick="event.stopPropagation();_toggleDropdown('${groupId}')">${_TB_CHEVRON_SVG}</span>
      </button>
      <div class="titlebar-dropdown" id="dropdown-${groupId}">${dropdownItems}</div>
    </div>`
  }).join('')

  const el = document.getElementById('app-header')
  if (!el) return
  // Build mobile menu items (flat list of all pages including children)
  const mobileItems = links.filter(l => !l.action && l.href).flatMap(l => {
    const items = [l]
    if (l.children) items.push(...l.children)
    return items
  }).map(c => {
    const cActive = activePage === c.id ? ' active' : ''
    const popBtn = c.popout
      ? `<span class="popout-btn${_isPagePoppedOut(c.id) ? ' active' : ''}" title="Pop out" onclick="event.stopPropagation();_togglePopout('${c.id}','${c.href}')">${_TB_POPOUT_SVG}</span>`
      : ''
    const indent = links.some(l => l.children?.some(ch => ch.id === c.id)) ? ' sub' : ''
    return `<div class="mobile-menu-item${cActive}${indent}" onclick="_navigate('${c.href}')">${esc(c.label)}${popBtn}</div>`
  }).join('')

  el.innerHTML = `
    <div class="titlebar-left">
      <div class="titlebar-logo">⬡ PITWALL</div>
      <div class="titlebar-hamburger" onclick="_toggleMobileMenu()">${_TB_HAMBURGER_SVG}</div>
    </div>
    <div class="titlebar-center">
      <button class="titlebar-tab" onclick="_navigate('main.html')">${_TB_HOME_SVG}</button>
      ${tabsHTML}
    </div>
    <div class="titlebar-right">
      <button class="header-icon-btn notif-bell-btn" id="notif-bell" title="Notifications" onclick="Notifications.togglePanel()">
        ${_TB_BELL_SVG}
        <span class="notif-badge" id="notif-badge" style="display:none">0</span>
        <span class="dnd-dot" id="dnd-dot" style="display:none" title="Do Not Disturb"></span>
      </button>
      <div class="live-dot" id="live-dot"></div>
      <div class="profile-trigger" onclick="_tbToggleProfile()">
        ${user.steam_avatar ? `<img class="avatar" src="${esc(user.steam_avatar)}" alt="">` : '<div class="avatar" style="display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--muted)">?</div>'}
      </div>
      <div class="profile-dropdown" id="profile-dropdown">
        <div class="profile-dd-header">
          ${user.steam_avatar ? `<img class="profile-dd-avatar" src="${esc(user.steam_avatar)}" alt="">` : ''}
          <div>
            <div class="profile-dd-name">${esc(user.steam_name || user.display_name || 'Driver')}</div>
            <div class="profile-dd-sub">Steam</div>
          </div>
        </div>
        <div class="profile-dd-sep"></div>
        <div class="profile-dd-item" onclick="_navigate('main-settings.html')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          Settings
        </div>
        <div class="profile-dd-item" onclick="_openOverlayDesigner()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
          Layout Designer
        </div>
        <div class="profile-dd-item dd-danger" onclick="Auth.logout()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Logout
        </div>
      </div>
      <div class="window-controls">
        <div class="window-btn" onclick="_tbMinimize()">${_TB_MIN_SVG}</div>
        <div class="window-btn" id="tb-max-btn" onclick="_tbMaximize()">${_TB_RESTORE_SVG}</div>
        <div class="window-btn close" onclick="_tbClose()">${_TB_CLOSE_SVG}</div>
      </div>
    </div>
    <div class="mobile-menu" id="mobile-menu">
      <div class="mobile-menu-item" onclick="_navigate('main.html')">${_TB_HOME_SVG} Home</div>
      ${mobileItems}
    </div>`

  // Refresh notification badge
  Notifications._updateBadge()
}

function setLiveDot(on) {
  const el = document.getElementById('live-dot')
  if (el) el.className = 'live-dot' + (on ? ' on' : '')
}

// ─── MODAL HELPER ────────────────────────────────────────────────────────────

function showModal(id) {
  const el = document.getElementById(id)
  if (el) el.style.display = 'flex'
}
function hideModal(id) {
  const el = document.getElementById(id)
  if (el) el.style.display = 'none'
}

// ─── SHARED CSS ───────────────────────────────────────────────────────────────

const SHARED_CSS = `
:root {
  --lime:#C8FF00; --lime-dim:#8fba00; --black:#0a0a0a; --surface:#111;
  --card:#161616; --border:#222; --muted:#555; --text:#e8e8e8;
  --red:#ff3b3b; --blue:#3b8fff; --orange:#ff8c00;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:var(--black);color:var(--text);
  font-family:'Barlow',sans-serif;font-size:14px;overflow-x:hidden}

/* ── TITLEBAR ── */
#app-header{
  height:48px;background:var(--surface);display:flex;align-items:center;
  justify-content:space-between;padding:0 16px;
  -webkit-app-region:drag;border-bottom:1px solid var(--border);
  position:sticky;top:0;z-index:100;
}
.titlebar-left{display:flex;align-items:center;gap:16px}
.titlebar-logo{font-family:'Barlow Condensed',sans-serif;font-size:18px;font-weight:900;
  text-transform:uppercase;letter-spacing:.1em;color:var(--lime)}
.titlebar-center{position:absolute;left:50%;transform:translateX(-50%);
  display:flex;gap:4px;-webkit-app-region:no-drag}
.titlebar-tab{padding:8px 16px;background:transparent;color:var(--muted);border:none;
  border-radius:8px;font-family:'Barlow',sans-serif;font-size:14px;font-weight:600;
  cursor:pointer;transition:all .2s;-webkit-app-region:no-drag;display:flex;align-items:center;gap:6px}
.titlebar-tab:hover{color:var(--text);background:rgba(255,255,255,.05)}
.titlebar-tab.active{background:var(--card);color:var(--text)}
.titlebar-tab.accent{color:var(--lime);font-weight:700}
.titlebar-tab.popped-out{opacity:.45;position:relative}
.popout-btn{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;
  border-radius:3px;margin-left:4px;opacity:.4;transition:opacity .15s,background .15s;flex-shrink:0}
.popout-btn:hover{opacity:1;background:rgba(255,255,255,.1)}
.popout-btn.active{opacity:1;color:var(--lime)}

/* ── Tab group with dropdown ── */
.titlebar-tab-group{position:relative;display:flex;align-items:center}
.dropdown-arrow{display:inline-flex;align-items:center;justify-content:center;
  width:16px;height:16px;margin-left:2px;border-radius:3px;opacity:.5;transition:opacity .15s,transform .2s}
.dropdown-arrow:hover{opacity:1;background:rgba(255,255,255,.1)}
.titlebar-dropdown{display:none;position:absolute;top:100%;left:0;min-width:180px;
  background:var(--card);border:1px solid var(--border);border-radius:6px;
  padding:4px;box-shadow:0 8px 24px rgba(0,0,0,.6);z-index:200;margin-top:4px}
.titlebar-dropdown.open{display:block}
.dropdown-item{display:flex;align-items:center;justify-content:space-between;
  padding:8px 12px;border-radius:4px;font-family:'Barlow',sans-serif;font-size:13px;
  font-weight:600;color:var(--muted);cursor:pointer;transition:background .15s,color .15s;
  white-space:nowrap;gap:8px}
.dropdown-item:hover{background:rgba(255,255,255,.08);color:var(--text)}
.dropdown-item.active{color:var(--text);background:rgba(200,255,0,.08)}
.dropdown-item.popped-out{opacity:.45}

/* ── Hamburger & mobile menu ── */
.titlebar-hamburger{display:none;width:32px;height:32px;align-items:center;justify-content:center;
  cursor:pointer;border-radius:6px;transition:background .2s;color:var(--muted);-webkit-app-region:no-drag}
.titlebar-hamburger:hover{background:rgba(255,255,255,.1);color:var(--text)}
.mobile-menu{display:none;position:absolute;top:48px;left:0;right:0;
  background:var(--card);border-bottom:1px solid var(--border);
  padding:8px;z-index:199;box-shadow:0 8px 24px rgba(0,0,0,.6);
  max-height:calc(100vh - 48px);overflow-y:auto}
.mobile-menu.open{display:block}
.mobile-menu-item{display:flex;align-items:center;justify-content:space-between;
  padding:10px 14px;border-radius:4px;font-family:'Barlow',sans-serif;font-size:14px;
  font-weight:600;color:var(--muted);cursor:pointer;transition:background .15s,color .15s;gap:8px}
.mobile-menu-item:hover{background:rgba(255,255,255,.08);color:var(--text)}
.mobile-menu-item.active{color:var(--text);background:rgba(200,255,0,.08)}
.mobile-menu-item.sub{padding-left:32px;font-size:13px}

@media(max-width:860px){
  .titlebar-center{display:none!important}
  .titlebar-hamburger{display:flex}
}
.popout-overlay{position:fixed;inset:0;top:48px;z-index:50;background:var(--black);
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px}
.popout-overlay svg{opacity:.3}
.popout-overlay-text{font-family:'Barlow Condensed',sans-serif;font-size:18px;font-weight:700;
  letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.popout-overlay-btn{margin-top:8px}
.titlebar-right{display:flex;align-items:center;gap:8px;-webkit-app-region:no-drag}
.titlebar-icon{width:32px;height:32px;display:flex;align-items:center;justify-content:center;
  cursor:pointer;border-radius:6px;transition:background .2s;color:var(--muted)}
.titlebar-icon:hover{background:rgba(255,255,255,.1);color:var(--text)}
.window-controls{display:flex;gap:4px;margin-left:4px}
.window-btn{width:46px;height:32px;display:flex;align-items:center;justify-content:center;
  cursor:pointer;transition:background .2s;color:var(--muted);font-size:12px}
.window-btn:hover{background:rgba(255,255,255,.1);color:var(--text)}
.window-btn.close:hover{background:#e81123;color:white}
.avatar{width:26px;height:26px;border-radius:50%;object-fit:cover;background:var(--border);cursor:pointer}
.live-dot{width:7px;height:7px;border-radius:50%;background:var(--muted);transition:background .3s}
.live-dot.on{background:var(--lime);box-shadow:0 0 8px var(--lime)}

/* ── PROFILE DROPDOWN ── */
.profile-trigger{position:relative;cursor:pointer;-webkit-app-region:no-drag}
.profile-dropdown{position:fixed;top:48px;right:60px;background:var(--card);border:1px solid var(--border);
  border-radius:8px;padding:0;min-width:220px;box-shadow:0 8px 24px rgba(0,0,0,.6);
  display:none;z-index:999;overflow:hidden}
.profile-dropdown.open{display:block}
.profile-dd-header{display:flex;align-items:center;gap:12px;padding:14px 16px}
.profile-dd-avatar{width:36px;height:36px;border-radius:50%;object-fit:cover;background:var(--border)}
.profile-dd-name{font-family:'Barlow Condensed',sans-serif;font-size:15px;font-weight:700;color:var(--text)}
.profile-dd-sub{font-size:10px;color:var(--muted)}
.profile-dd-sep{height:1px;background:var(--border);margin:0}
.profile-dd-item{display:flex;align-items:center;gap:10px;padding:11px 16px;cursor:pointer;
  font-size:13px;color:var(--text);transition:background .15s}
.profile-dd-item:hover{background:rgba(255,255,255,.06)}
.profile-dd-item svg{color:var(--muted);flex-shrink:0}
.profile-dd-item.dd-danger{color:#e5484d}
.profile-dd-item.dd-danger svg{color:#e5484d}

/* ── Common ── */
.section-label{font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;
  color:var(--muted);margin-bottom:12px}
.card{background:var(--card);border:1px solid var(--border);border-radius:4px}
.tag{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
  padding:2px 7px;border-radius:2px}
.tag-lime{background:rgba(200,255,0,.12);color:var(--lime)}
.tag-gray{background:var(--border);color:var(--muted)}
.tag-blue{background:rgba(59,143,255,.15);color:var(--blue)}
.tag-red{background:rgba(255,59,59,.15);color:var(--red)}

.btn-primary{background:var(--lime);color:var(--black);font-family:'Barlow Condensed',sans-serif;
  font-size:14px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;
  padding:10px 20px;border:none;border-radius:2px;cursor:pointer;transition:background .15s}
.btn-primary:hover{background:#d9ff26}
.btn-secondary{background:transparent;border:1px solid var(--border);color:var(--muted);
  font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:600;
  letter-spacing:.08em;text-transform:uppercase;padding:8px 16px;border-radius:2px;
  cursor:pointer;transition:border-color .15s,color .15s;width:100%}
.btn-secondary:hover{border-color:var(--lime);color:var(--lime)}
.btn-ghost{background:transparent;border:1px solid var(--border);color:var(--muted);
  font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:600;
  letter-spacing:.07em;text-transform:uppercase;padding:8px 16px;border-radius:2px;
  cursor:pointer;transition:border-color .15s,color .15s}
.btn-ghost:hover{border-color:var(--lime);color:var(--lime)}
.btn-danger{background:transparent;border:1px solid var(--red);color:var(--red);
  font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:600;
  letter-spacing:.07em;text-transform:uppercase;padding:8px 16px;border-radius:2px;
  cursor:pointer;transition:background .15s}
.btn-danger:hover{background:rgba(255,59,59,.1)}

.connecting{display:flex;flex-direction:column;align-items:center;justify-content:center;
  min-height:160px;gap:12px;color:var(--muted);font-family:'Barlow Condensed',sans-serif;
  font-size:14px;font-weight:600;letter-spacing:.1em;text-transform:uppercase}
.spinner{width:22px;height:22px;border:2px solid var(--border);
  border-top-color:var(--lime);border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}

/* Modal */
.modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);
  z-index:1000;align-items:center;justify-content:center}
.modal{background:var(--card);border:1px solid var(--border);border-radius:4px;
  padding:28px;min-width:360px;max-width:480px;width:90%}
.modal-title{font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:900;
  text-transform:uppercase;margin-bottom:20px}
.modal-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:20px}

/* Form */
.form-group{display:flex;flex-direction:column;gap:5px;margin-bottom:14px}
.form-label{font-size:9px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:var(--muted)}
.form-input{background:var(--surface);border:1px solid var(--border);border-radius:2px;
  color:var(--text);font-family:'Barlow Condensed',sans-serif;font-size:15px;
  padding:9px 11px;width:100%;outline:none;transition:border-color .15s}
.form-input:focus{border-color:var(--lime)}
textarea.form-input{resize:vertical;min-height:70px;font-size:13px;font-family:'Barlow',sans-serif}

/* ── TEAM LOGO ── */
.team-logo-preview{width:64px;height:64px;object-fit:contain;border-radius:4px;
  background:var(--surface);border:1px solid var(--border);padding:4px}
.logo-placeholder{width:64px;height:64px;display:flex;align-items:center;justify-content:center;
  font-size:28px;background:var(--surface);border:1px solid var(--border);border-radius:4px}
.logo-uploader{display:flex;align-items:center;gap:14px;padding:12px;
  background:var(--surface);border:1px dashed var(--border);border-radius:4px;}
.logo-upload-actions{display:flex;flex-direction:column;gap:6px}

/* ── CIRCUIT HERO ── */
.circuit-hero{position:relative;border-radius:4px;overflow:hidden;margin-bottom:24px;
  min-height:140px;display:flex;align-items:flex-end}
.circuit-hero-bg{position:absolute;inset:0;background-size:cover;background-position:center;
  filter:brightness(.35) saturate(.6)}
.circuit-hero-content{position:relative;z-index:1;padding:20px 24px;
  display:flex;align-items:flex-end;justify-content:space-between;width:100%;gap:16px}
.circuit-hero-logo{height:56px;width:auto;object-fit:contain;filter:brightness(0) invert(1);opacity:.85}

/* ── HEADER ICON BUTTONS (settings, bell) ── */
.header-icon-btn{position:relative;background:none;border:none;color:var(--muted);
  cursor:pointer;font-size:14px;padding:4px 6px;border-radius:2px;
  text-decoration:none;transition:color .15s;display:flex;align-items:center}
.header-icon-btn:hover{color:var(--text)}
.notif-bell{font-size:16px}
.notif-bell-btn{margin-right:4px}
.dnd-dot{position:absolute;bottom:-1px;right:-1px;width:8px;height:8px;border-radius:50%;
  background:var(--orange);border:1.5px solid var(--black);pointer-events:none}
.notif-dnd-btn{background:none;border:1px solid var(--border);color:var(--muted);cursor:pointer;
  font-family:'Barlow Condensed',sans-serif;font-size:10px;font-weight:700;letter-spacing:.1em;
  text-transform:uppercase;padding:3px 8px;border-radius:2px;transition:all .15s}
.notif-dnd-btn:hover:not(:disabled){color:var(--text);border-color:var(--muted)}
.notif-dnd-btn.on{background:var(--orange);color:var(--black);border-color:var(--orange)}
.notif-dnd-btn:disabled{cursor:not-allowed;opacity:.7}

/* ── NOTIFICATION BADGE ── */
.notif-badge{position:absolute;top:-2px;right:-2px;min-width:16px;height:16px;
  background:var(--red);color:#fff;border-radius:8px;font-size:10px;font-weight:700;
  display:flex;align-items:center;justify-content:center;padding:0 3px;
  font-family:'Barlow Condensed',sans-serif;pointer-events:none}

/* ── NOTIFICATION PANEL ── */
.notif-panel{display:none;position:fixed;top:52px;right:16px;width:320px;
  background:var(--card);border:1px solid var(--border);border-radius:4px;
  z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,.6);overflow:hidden}
.notif-panel-header{display:flex;align-items:center;justify-content:space-between;
  padding:10px 14px;border-bottom:1px solid var(--border);
  font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:700;
  letter-spacing:.15em;text-transform:uppercase;color:var(--muted)}
.notif-list{max-height:340px;overflow-y:auto}
.notif-item{display:flex;align-items:flex-start;gap:10px;padding:10px 14px;
  border-bottom:1px solid rgba(34,34,34,.5);transition:background .1s}
.notif-item:last-child{border-bottom:none}
.notif-item:hover{background:var(--surface)}
.notif-item.unread{background:rgba(200,255,0,.03)}
.notif-item.unread .notif-msg{color:var(--text)}
.notif-icon{font-size:14px;color:var(--lime);margin-top:1px;flex-shrink:0;width:16px;text-align:center}
.notif-body{flex:1;min-width:0}
.notif-msg{font-size:12px;color:var(--muted);line-height:1.4}
.notif-time{font-size:10px;color:var(--border);margin-top:3px;
  font-family:'Barlow Condensed',sans-serif;letter-spacing:.05em}

/* Scrollbar */
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px}
::-webkit-scrollbar-thumb:hover{background:var(--muted)}

/* ── Page transitions ── */
body {
  opacity: 0;
  filter: blur(4px);
  transition: opacity .18s ease, filter .18s ease;
}
body.pw-ready {
  opacity: 1;
  filter: blur(0px);
}
body.pw-out {
  opacity: 0;
  filter: blur(4px);
  transition: opacity .12s ease, filter .12s ease;
  pointer-events: none;
}
`

function injectSharedCSS() {
  const style = document.createElement('style')
  style.textContent = SHARED_CSS
  document.head.insertBefore(style, document.head.firstChild)
  // Trigger entrance: double rAF ensures initial opacity:0 is painted first
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add('pw-ready')))
}

// ── Page navigation with fade-out transition ──
function _navigate(url) {
  // Close all pop-out windows when navigating away from lineup pages
  const lineupPages = ['pitwall.html','pitwall-workspace.html','pitwall-livetiming.html','pitwall-trackmap.html','telemetry.html','stint-setup.html','stint-plan.html','stint-summary.html','stint-tyres.html','setups.html','telemetry-analyse.html','telemetry-record.html']
  const isLineupTarget = lineupPages.some(p => url.includes(p))
  if (!isLineupTarget && _poppedOutPages.size > 0) {
    if (window.electronAPI?.closeAllPopouts) window.electronAPI.closeAllPopouts()
    _poppedOutPages.clear()
    _syncPopoutState()
  }
  document.body.classList.remove('pw-ready')
  document.body.classList.add('pw-out')
  setTimeout(() => { location.href = url }, 130)
}

// Check if current page is open in a popout — show overlay instead of content
function _checkPopoutOverlay(pageId) {
  if (!_isPagePoppedOut(pageId)) return false
  const content = document.querySelector('.pw-layout, .page-content, #lt-main, .lt-topbar, .tm-layout, .pw-workspace')
  if (content) content.style.display = 'none'
  const overlay = document.createElement('div')
  overlay.className = 'popout-overlay'
  overlay.innerHTML = `
    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M9 3H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-5"/>
      <path d="M14 3h7v7"/><path d="M21 3l-9 9"/>
    </svg>
    <div class="popout-overlay-text">${esc(I18n.t(pageId) || pageId)} is open in a separate window</div>
    <button class="btn-ghost popout-overlay-btn" onclick="_closePopoutAndReload('${pageId}')">Close popup &amp; show here</button>`
  document.body.appendChild(overlay)
  return true
}

function _closePopoutAndReload(pageId) {
  if (window.electronAPI?.closePopout) window.electronAPI.closePopout(pageId)
  _poppedOutPages.delete(pageId)
  _syncPopoutState()
  location.reload()
}