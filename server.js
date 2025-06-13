const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const app = express();
const PORT = 3000;

const INITIAL_DATA_PATH = path.join(__dirname, 'data', 'initial_data.json');
const LAYOUT_DATA_PATH = path.join(__dirname, 'data', 'layout_data.json');

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Helper Functions
async function getInitialData() {
    try {
        if (await fs.pathExists(INITIAL_DATA_PATH)) {
            return await fs.readJson(INITIAL_DATA_PATH);
        }
        return { employeeData: {}, teamColors: {}, departmentColors: {} };
    } catch (error) {
        console.error('Error reading initial data:', error);
        throw error;
    }
}

async function saveInitialData(data) {
    try {
        await fs.writeJson(INITIAL_DATA_PATH, data, { spaces: 2 });
    } catch (error) {
        console.error('Error saving initial data:', error);
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
        return { _version: 0, layout: {} };
    } catch (error) {
        console.error('Error reading layout data:', error);
        return { _version: 0, layout: {} };
    }
}

async function saveLayoutData(data) {
    try {
        await fs.writeJson(LAYOUT_DATA_PATH, data, { spaces: 2 });
    } catch (error) {
        console.error('Error saving layout data:', error);
        throw error;
    }
}

// API Endpoints
app.get('/api/initial-data', async (req, res) => {
    try {
        const initialData = await getInitialData();
        res.setHeader('Cache-Control', 'no-store');
        res.json(initialData);
    } catch (error) {
        res.status(500).json({ message: "Server error: Could not get initial data.", error: error.message });
    }
});

// ★★★ 新しいAPIエンドポイントを追加 ★★★
app.post('/api/initial-data', async (req, res) => {
    const newData = req.body;

    if (!newData || typeof newData !== 'object') {
        return res.status(400).json({ message: 'Bad request: Invalid JSON data.' });
    }
    // 簡単な内容の検証（必要に応じてより厳密に）
    if (!newData.employeeData || !newData.teamColors || !newData.departmentColors) {
         return res.status(400).json({ message: 'Bad request: JSON data is missing required keys (employeeData, teamColors, departmentColors).' });
    }

    try {
        await saveInitialData(newData);
        console.log('Initial data saved successfully.');
        res.status(200).json({ message: 'Initial data saved successfully.' });
    } catch (error) {
        console.error('Failed to save initial data:', error);
        res.status(500).json({ message: 'Server error: Could not save initial data.' });
    }
});


app.get('/api/layouts/default', async (req, res) => {
    try {
        const layoutData = await getLayoutData();
        res.json(layoutData);
    } catch (error) {
        res.status(500).send('Server error: Could not get layout data.');
    }
});

app.post('/api/layouts/default', async (req, res) => {
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
        res.json({
            message: 'Layout saved successfully.',
            _newVersion: newVersion,
            layout: clientLayout
        });

    } catch (error) {
        res.status(500).send('Server error: Could not save layout.');
    }
});

app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    fs.pathExists(LAYOUT_DATA_PATH).then(exists => {
        if (!exists) {
            saveLayoutData({ _version: 0, layout: {} })
                .catch(err => console.error('Failed to create initial layout_data.json:', err));
        }
    });
});
