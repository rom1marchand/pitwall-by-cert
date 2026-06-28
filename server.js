// frontend/server.js
const express = require('express');
const path = require('path');
const fs = require('fs'); // Nécessaire pour écrire des fichiers
const app = express();
const port = 3000;
const { exec, spawn } = require('child_process');

// Permet de lire le JSON envoyé par le frontend
app.use(express.json());

// Sert tous les fichiers statiques
app.use(express.static(path.join(__dirname, '')));

// --- NOUVELLE ROUTE API ---
// C'est ici que le frontend va envoyer les données
app.post('/api/save-discord-config', (req, res) => {
    const configData = req.body;

    // On définit le chemin vers le dossier backend (supposé être au même niveau que frontend)
    const configPath = path.join(__dirname, '../backend/discord_config.json');

    fs.writeFile(configPath, JSON.stringify(configData, null, 4), (err) => {
        if (err) {
            console.error("Erreur sauvegarde config:", err);
            return res.status(500).json({ message: 'Erreur lors de la sauvegarde.' });
        }
        console.log("Config Discord sauvegardée dans :", configPath);
        res.json({ message: 'Configuration sauvegardée avec succès !' });
    });
});

app.listen(port, () => {
  console.log(`Serveur local démarré sur http://localhost:${port}`);
});


// Route pour lancer le bot Python
app.post('/api/start-discord-bot', (req, res) => {
    console.log("Tentative de lancement du bot...");

    // Commande pour Windows : Ouvre une nouvelle fenêtre CMD et lance le script
    // Assure-toi que le chemin est bon relative à server.js
    const command = 'start cmd.exe /K "python ../backend/discord_bot.py"';

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Erreur exec: ${error}`);
            return res.status(500).json({ success: false, message: 'Erreur lancement script' });
        }
        res.json({ success: true, message: 'Bot lancé dans une nouvelle fenêtre' });
    });
});

// Route pour importer les setups SVM
app.post('/api/import-svm', (req, res) => {
    const { plannerData, svmContent } = req.body;

    const pythonScriptPath = path.join(__dirname, '../backend/import_svm_api.py');
    const child = spawn('python', [pythonScriptPath]);

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
        if (code !== 0) {
            console.error(`Erreur lors de l'exécution du script Python pour l'import SVM (code: ${code})`);
            console.error(`Stderr: ${stderr}`);
            return res.status(500).json({ message: 'Erreur lors de l\'importation du setup SVM', error: stderr });
        }
        try {
            res.json(JSON.parse(stdout));
        } catch (e) {
            console.error(`Erreur parsing JSON from python script: ${e}`);
            res.status(500).json({ message: 'Erreur lecture réponse du script Python', error: stdout });
        }
    });

    child.stdin.write(JSON.stringify({ plannerData, svmContent }));
    child.stdin.end();
});

// Route pour exporter les setups SVM
app.post('/api/export-svm', (req, res) => {
    const plannerData = req.body;

    const pythonScriptPath = path.join(__dirname, '../backend/export_svm_api.py');
    const child = spawn('python', [pythonScriptPath]);

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
        if (code !== 0) {
            console.error(`Erreur lors de l'exécution du script Python pour l'export SVM (code: ${code})`);
            console.error(`Stderr: ${stderr}`);
            return res.status(500).json({ message: 'Erreur lors de l\'exportation du setup SVM', error: stderr });
        }
        res.setHeader('Content-Type', 'text/plain');
        res.send(stdout);
    });

    child.stdin.write(JSON.stringify(plannerData));
    child.stdin.end();
});