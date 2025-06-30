const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const { compare, applyPatch } = require('fast-json-patch');

const app = express();
const PORT = 9000;

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
function validateEmployeeData(data) {
    const allowedFields = ['empNo', 'name', 'title', 'dept', 'team', 'ext', 'ctstage'];
    const maxLength = {
        empNo: 20,
        name: 50,
        title: 30,
        dept: 50,
        team: 50,
        ext: 20,
        ctstage: 30
    };
    
    // HTMLタグ検出パターン
    const htmlPattern = /<[^>]*>/g;
    const scriptPattern = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
    
    for (const empNo in data.employeeData) {
        const employee = data.employeeData[empNo];
        
        // 社員番号の検証
        if (typeof empNo !== 'string' || empNo.length === 0 || empNo.length > 20) {
            throw new Error(`Invalid employee number: ${empNo}`);
        }
        
        // HTMLタグやスクリプトの検出
        if (htmlPattern.test(empNo) || scriptPattern.test(empNo)) {
            throw new Error(`HTML/Script tags not allowed in employee number: ${empNo}`);
        }
        
        // 各フィールドの検証
        for (const key in employee) {
            if (!allowedFields.includes(key)) {
                throw new Error(`Invalid field: ${key} for employee ${empNo}`);
            }
            
            const value = employee[key];
            if (value !== null && value !== undefined) {
                // 文字列型チェック
                if (typeof value !== 'string') {
                    throw new Error(`Field ${key} must be string for employee ${empNo}`);
                }
                
                // 長さ制限
                if (value.length > maxLength[key]) {
                    throw new Error(`Field ${key} too long for employee ${empNo} (max: ${maxLength[key]})`);
                }
                
                // HTMLタグ検出
                if (htmlPattern.test(value)) {
                    throw new Error(`HTML tags not allowed in field ${key} for employee ${empNo}`);
                }
                
                // スクリプトタグの検出
                if (scriptPattern.test(value)) {
                    throw new Error(`Script tags not allowed in field ${key} for employee ${empNo}`);
                }
                
                // 危険な文字列パターンの検出
                const dangerousPatterns = [
                    /javascript:/i,
                    /vbscript:/i,
                    /on\w+\s*=/i,
                    /data:text\/html/i
                ];
                
                for (const pattern of dangerousPatterns) {
                    if (pattern.test(value)) {
                        throw new Error(`Dangerous pattern detected in field ${key} for employee ${empNo}`);
                    }
                }
            }
        }
    }
    
    // 部署カラーとチームカラーの検証
    if (data.departmentColors) {
        for (const [dept, color] of Object.entries(data.departmentColors)) {
            if (typeof dept !== 'string' || dept.length > 50) {
                throw new Error(`Invalid department name: ${dept}`);
            }
            if (htmlPattern.test(dept)) {
                throw new Error(`HTML tags not allowed in department name: ${dept}`);
            }
            if (typeof color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(color)) {
                throw new Error(`Invalid color format for department ${dept}: ${color}`);
            }
        }
    }
    
    if (data.teamColors) {
        for (const [team, color] of Object.entries(data.teamColors)) {
            if (typeof team !== 'string' || team.length > 50) {
                throw new Error(`Invalid team name: ${team}`);
            }
            if (htmlPattern.test(team)) {
                throw new Error(`HTML tags not allowed in team name: ${team}`);
            }
            if (typeof color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(color)) {
                throw new Error(`Invalid color format for team ${team}: ${color}`);
            }
        }
    }
}

async function saveInitialData(data) {
    try {
        // 基本構造のバリデーション
        if (!data || typeof data.employeeData !== 'object' || data.employeeData === null) {
            throw new Error("Invalid data structure: employeeData is missing or not an object.");
        }
        
        // 詳細なバリデーション
        validateEmployeeData(data);
        
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
    try {
        const initialData = await getInitialData();
        res.json(initialData);
    } catch (error) {
        console.error('Server error in /api/initial-data:', error);
        res.status(500).json({ message: "Server error: Could not get initial data.", error: error.message });
    }
});

app.post('/api/initial-data', async (req, res) => {
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
        console.error('Error during layout save process:', error);
        res.status(500).send('Server error: Could not save layout.');
    }
});

// Serve index.html for root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', async () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
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

// マスタデータダウンロード用エンドポイント
app.get('/api/download-initial-data', async (req, res) => {
    try {
        const initialData = await getInitialData();
        
        // ファイル名にタイムスタンプを追加
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `initial_data_${timestamp}.json`;
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.json(initialData);
    } catch (error) {
        console.error('Server error in /api/download-initial-data:', error);
        res.status(500).json({ message: "Server error: Could not download initial data.", error: error.message });
    }
});
