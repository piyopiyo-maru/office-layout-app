const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const { compare, applyPatch } = require('fast-json-patch');

const app = express();
const PORT = 3000;

const DATA_DIR = path.join(__dirname, 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backup');
const INITIAL_DATA_PATH = path.join(DATA_DIR, 'initial_data.json');
const LAYOUT_DATA_PATH = path.join(DATA_DIR, 'layout_data.json');
const MAX_BACKUPS = 10;

console.log("--- Server starting ---");

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ▼▼▼ 変更箇所 ▼▼▼
/**
 * Creates a timestamped backup of a file and manages backup rotation.
 * @param {string} filePath The full path to the file to be backed up.
 */
async function createBackup(filePath) {
    try {
        if (!(await fs.pathExists(filePath))) {
            console.log(`Backup skipped: Source file does not exist at ${filePath}`);
            return;
        }

        await fs.ensureDir(BACKUP_DIR);

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = path.basename(filePath);
        const backupFileName = `${timestamp}-${fileName}`;
        const backupFilePath = path.join(BACKUP_DIR, backupFileName);

        await fs.copy(filePath, backupFilePath);
        console.log(`Successfully created backup: ${backupFileName}`);

        // Manage backup rotation
        const files = await fs.readdir(BACKUP_DIR);
        const fileBackups = files
            .filter(f => f.endsWith(`-${fileName}`))
            .sort()
            .map(f => path.join(BACKUP_DIR, f));

        if (fileBackups.length > MAX_BACKUPS) {
            const backupsToDelete = fileBackups.slice(0, fileBackups.length - MAX_BACKUPS);
            for (const oldBackup of backupsToDelete) {
                await fs.remove(oldBackup);
                console.log(`Removed old backup: ${path.basename(oldBackup)}`);
            }
        }
    } catch (error) {
        console.error(`Failed to create or manage backup for ${filePath}:`, error);
    }
}
// ▲▲▲ 変更箇所 ▲▲▲

// Helper Functions
async function getInitialData() {
    try {
        if (await fs.pathExists(INITIAL_DATA_PATH)) {
            return await fs.readJson(INITIAL_DATA_PATH);
        }
        console.warn(`${INITIAL_DATA_PATH} not found.`);
        return { employeeData: {}, teamColors: {}, departmentColors: {} };
    } catch (error) {
        console.error('Error reading initial data:', error);
        throw error;
    }
}

async function getLayoutData() {
    try {
        if (await fs.pathExists(LAYOUT_DATA_PATH)) {
            const data = await fs.readJson(LAYOUT_DATA_PATH);
            if (data && typeof data._version === 'number' && data.layout) {
                return data;
            }
        }
        console.warn(`${LAYOUT_DATA_PATH} not found or invalid format. Creating default layout.`);
        return { _version: 0, layout: {} };
    } catch (error) {
        console.error('Error reading layout data:', error);
        return { _version: 0, layout: {} };
    }
}

// ▼▼▼ 変更箇所 ▼▼▼
async function saveLayoutData(data) {
    try {
        await createBackup(LAYOUT_DATA_PATH); // バックアップを作成
        await fs.writeJson(LAYOUT_DATA_PATH, data, { spaces: 2 });
    } catch (error) {
        console.error('Error saving layout data:', error);
        throw error;
    }
}
// ▲▲▲ 変更箇所 ▲▲▲

// ▼▼▼ 変更箇所 ▼▼▼
async function saveInitialData(data) {
    try {
        // 簡単なバリデーション
        if (!data || typeof data.employeeData !== 'object' || data.employeeData === null) {
            throw new Error("Invalid data structure: employeeData is missing or not an object.");
        }
        await createBackup(INITIAL_DATA_PATH); // バックアップを作成
        await fs.writeJson(INITIAL_DATA_PATH, data, { spaces: 2 });
        console.log("Initial data saved successfully.");
    } catch (error) {
        console.error('Error saving initial data:', error);
        throw error;
    }
}
// ▲▲▲ 変更箇所 ▲▲▲

// API Endpoints
app.get('/api/initial-data', async (req, res) => {
    console.log('GET /api/initial-data hit');
    try {
        const initialData = await getInitialData();
        res.json(initialData);
    } catch (error) {
        console.error('Server error in /api/initial-data:', error);
        res.status(500).json({ message: "Server error: Could not get initial data.", error: error.message });
    }
});

app.post('/api/initial-data', async (req, res) => {
    console.log('POST /api/initial-data hit');
    const newData = req.body;
    try {
        await saveInitialData(newData);
        res.status(200).json({ message: 'Initial data successfully overwritten.' });
    } catch (error) {
        console.error('Failed to save initial data:', error);
        res.status(500).json({ message: "Server error: Could not save initial data.", error: error.message });
    }
});

app.get('/api/layouts/default', async (req, res) => {
    console.log('GET /api/layouts/default hit');
    try {
        const layoutData = await getLayoutData();
        res.json(layoutData);
    } catch (error) {
        res.status(500).send('Server error: Could not get layout data.');
    }
});

app.post('/api/layouts/default', async (req, res) => {
    console.log('POST /api/layouts/default hit with version:', req.body._version);
    const clientData = req.body;
    const clientVersion = clientData._version;
    const clientLayout = clientData.layout;

    if (typeof clientVersion !== 'number' || !clientLayout) {
        return res.status(400).send('Bad request: Missing version or layout data.');
    }

    try {
        let currentServerData = await getLayoutData();
        const serverVersion = currentServerData._version;

        if (clientVersion !== serverVersion) {
            console.warn(`Conflict detected: Client version ${clientVersion}, Server version ${serverVersion}`);
            return res.status(409).json({
                message: 'Conflict: Layout updated by another user.',
                serverVersion: serverVersion,
            });
        }

        const newVersion = serverVersion + 1;
        const newDataToSave = {
            _version: newVersion,
            layout: clientLayout
        };

        await saveLayoutData(newDataToSave);
        console.log(`Layout saved successfully: Version ${serverVersion} -> ${newVersion}`);
        res.json({
            message: 'Layout saved successfully.',
            _newVersion: newVersion,
            layout: clientLayout
        });

    } catch (error) {
        console.error('Error during layout save process:', error);
        res.status(500).send('Server error: Could not save layout.');
    }
});

// Wildcard route for SPA - MUST BE LAST
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, async () => {
    console.log(`Server listening on port ${PORT}`);
    try {
        // Ensure data directory exists
        await fs.ensureDir(path.join(__dirname, 'data'));
        
        // Initialize layout_data.json if it doesn't exist
        if (!(await fs.pathExists(LAYOUT_DATA_PATH))) {
            console.log(`${LAYOUT_DATA_PATH} does not exist. Creating initial file.`);
            await fs.writeJson(LAYOUT_DATA_PATH, { _version: 0, layout: {} }, { spaces: 2 });
        }
        // Initialize initial_data.json if it doesn't exist
        if (!(await fs.pathExists(INITIAL_DATA_PATH))) {
            console.log(`${INITIAL_DATA_PATH} does not exist. Creating empty file.`);
            await fs.writeJson(INITIAL_DATA_PATH, { employeeData: {}, teamColors: {}, departmentColors: {} }, { spaces: 2 });
        }
    } catch (err) {
        console.error('Failed during server startup initialization:', err);
    }
});

// Error handling
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
