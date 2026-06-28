// telemetry-motec.js
// 
// Parseur autonome pour les espaces de travail MoTeC i2 Pro.
// Convertit un dossier de profil MoTeC en un JSON compatible Pitwall.
//
// UTILISATION :
// const pitwallWorkspace = await MotecParser.loadFromFiles(event.target.files);
// console.log(pitwallWorkspace.worksheets);

;(function (root) {
  'use strict';

  // Palette de couleurs standard MoTeC (DisplayColorIndex) mappée vers le thème Pitwall
  const MOTEC_COLORS = {
    0: '#e8e8e8', // Blanc/Gris clair
    1: '#ff3b3b', // Rouge
    2: '#C8FF00', // Vert/Lime (Pitwall Lime)
    3: '#3b8fff', // Bleu
    4: '#ff8c00', // Orange
    5: '#a855f7', // Violet
    6: '#ffff00', // Jaune
    7: '#00ffff'  // Cyan
  };

  /**
   * Normalise un nom de canal MoTeC pour l'utiliser comme clé JSON
   * Ex: "Ground Speed" -> "ground_speed"
   */
  function _normalizeChannelName(name) {
    if (!name) return '';
    return name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  }

  /**
   * Parse le fichier Overrides.xml pour récupérer les couleurs et les échelles
   */
  function _parseOverrides(xmlText) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlText, "text/xml");
    const overrides = {};

    const nodes = xml.querySelectorAll('Override');
    nodes.forEach(node => {
      const id = node.getAttribute('Id');
      if (!id) return;
      
      const safeId = id.toLowerCase();
      const colorIndex = node.getAttribute('DisplayColorIndex');
      const dMin = node.getAttribute('DisplayMin');
      const dMax = node.getAttribute('DisplayMax');

      overrides[safeId] = {};
      
      if (colorIndex !== null && MOTEC_COLORS[colorIndex]) {
        overrides[safeId].color = MOTEC_COLORS[colorIndex];
      }
      if (dMin !== null) overrides[safeId].yMin = parseFloat(dMin);
      if (dMax !== null) overrides[safeId].yMax = parseFloat(dMax);
    });

    return overrides;
  }

  /**
   * Parse un fichier Workbook (.wkb ou .xml) pour extraire les onglets et graphiques
   */
  function _parseWorkbook(xmlText, overrides = {}) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlText, "text/xml");
    const worksheets = [];

    const sheetNodes = xml.querySelectorAll('Worksheet');
    sheetNodes.forEach(sheet => {
      const sheetName = sheet.getAttribute('Name') || 'Untitled';
      const groups = [];

      const graphs = sheet.querySelectorAll('Graph');
      graphs.forEach((graph, index) => {
        
        // 1. Calcul de la hauteur
        let heightPx = 150; // Hauteur par défaut
        const edge = graph.querySelector('Edges[Mode="0"]');
        if (edge) {
          const top = parseFloat(edge.getAttribute('TopEdge') || 0);
          const bottom = parseFloat(edge.getAttribute('BottomEdge') || 1000);
          // MoTeC utilise une base 1000. On la convertit pour un écran d'environ 800px de haut.
          heightPx = Math.max(60, Math.round((bottom - top) * 0.8));
        }

        // 2. Échelles par défaut du groupe
        const groupScaleMin = parseFloat(graph.getAttribute('ScaleMin')) || 0;
        const groupScaleMax = parseFloat(graph.getAttribute('ScaleMax')) || 100;

        // 3. Extraction des traces
        const traces = [];
        const traceNodes = graph.querySelectorAll('Trace[Id]');
        
        traceNodes.forEach(t => {
          const originalId = t.getAttribute('Id');
          const safeId = originalId.toLowerCase();
          const visible = t.getAttribute('Visible') !== '0';

          if (!visible) return; // On ignore les traces masquées

          // On vérifie s'il y a un Override (Couleur/Échelle) pour ce canal
          const override = overrides[safeId] || {};
          
          traces.push({
            key: _normalizeChannelName(originalId),
            original_name: originalId,
            label: originalId,
            unit: t.getAttribute('DisplayUnit') || '',
            color: override.color || '#C8FF00', // Lime par défaut
            yMin: override.yMin !== undefined ? override.yMin : groupScaleMin,
            yMax: override.yMax !== undefined ? override.yMax : groupScaleMax
          });
        });

        // 4. Lignes de référence (ex: ligne rouge à 100°C)
        const refLines = [];
        const lineNodes = graph.querySelectorAll('Line');
        lineNodes.forEach(l => {
          if (l.getAttribute('Enabled') === '1') {
            const val = parseFloat(l.getAttribute('Value'));
            const rgb = l.getAttribute('Color'); // Ex: "248,0,0"
            if (!isNaN(val)) {
              refLines.push({
                value: val,
                color: rgb ? `rgb(${rgb})` : 'rgba(255,255,255,0.5)'
              });
            }
          }
        });

        if (traces.length > 0) {
          groups.push({
            id: `group_${sheetName.replace(/[^a-z0-9]/gi, '')}_${index}`,
            label: traces.map(t => t.label).join(' / '),
            height: heightPx,
            visible: true,
            traces: traces,
            reference_lines: refLines
          });
        }
      });

      if (groups.length > 0) {
        worksheets.push({
          name: sheetName,
          groups: groups
        });
      }
    });

    return worksheets;
  }

  /**
   * Convertit une formule mathématique MoTeC en fonction Javascript
   * (Utile si tu veux calculer des math channels côté front-end)
   */
  function _compileMath(scriptString) {
    if (!scriptString) return null;
    
    // Remplace 'Nom du Canal' [Unité] par sample['nom_du_canal']
    const regex = /'([^']+)'\s*\[[^\]]*\]/g;
    let jsCode = scriptString.replace(regex, (match, channelName) => {
      const safeKey = _normalizeChannelName(channelName);
      return `(sample['${safeKey}'] || 0)`;
    });

    // Remplacements basiques des fonctions MoTeC vers Math JS
    jsCode = jsCode.replace(/abs\(/gi, 'Math.abs(');
    jsCode = jsCode.replace(/sqr\(/gi, 'Math.pow(').replace(/\)/g, ', 2)'); // sqr(x) -> Math.pow(x, 2) approximatif
    jsCode = jsCode.replace(/sgn\(/gi, 'Math.sign(');

    try {
      return new Function('sample', `return ${jsCode};`);
    } catch (e) {
      console.warn("Impossible de compiler la math MoTeC :", scriptString);
      return null;
    }
  }

  // --- API PUBLIQUE ---
  
  root.MotecParser = {
    /**
     * Point d'entrée principal. Reçoit une FileList (issue d'un <input webkitdirectory>)
     * et retourne un objet Workspace structuré.
     */
    async loadFromFiles(files) {
      let overridesText = "";
      const workbooksTexts = [];
      const mathsTexts = []; // Gardé de côté si tu veux ajouter le parseur de Maths plus tard

      // 1. Lecture de l'arborescence
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const path = file.webkitRelativePath.toLowerCase();

        if (path.includes('overrides.xml')) {
          overridesText = await file.text();
        } else if (path.includes('/workbooks/') && (path.endsWith('.wkb') || path.endsWith('.xml'))) {
          workbooksTexts.push(await file.text());
        } else if (path.includes('/maths/') && path.endsWith('.xml')) {
          mathsTexts.push(await file.text());
        }
      }

      // 2. Parsing des Overrides (Couleurs, Min/Max globaux)
      const overrides = overridesText ? _parseOverrides(overridesText) : {};

      // 3. Parsing des Workbooks (Onglets et Graphiques)
      let allWorksheets = [];
      for (let wkbText of workbooksTexts) {
        const sheets = _parseWorkbook(wkbText, overrides);
        allWorksheets = allWorksheets.concat(sheets);
      }

      // Retourne l'objet final
      return {
        source: 'motec',
        worksheets: allWorksheets,
        _rawOverrides: overrides
      };
    },

    // Expose les fonctions internes si besoin d'un traitement manuel
    parseOverrides: _parseOverrides,
    parseWorkbook: _parseWorkbook,
    compileMath: _compileMath
  };

})(typeof window !== 'undefined' ? window : globalThis);