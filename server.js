const express = require('express');
const cors = require('cors');
const fs = require('fs'); // fs-extraから標準のfsに変更（readStreamを使うため）
const fsPromises = require('fs').promises; // fs.pathExistsの代わりに使う
const path = require('path');
const csv = require('csv-parser'); // ★ 追加：CSVパーサー

const app = express();
const PORT = 3000;

// ★ 3つのCSVファイルのパスを定義
const EMPLOYEE_DATA_PATH = path.join(__dirname, 'data', 'employee_data.csv');
const TEAM_COLORS_PATH = path.join(__dirname, 'data', 'team_colors.csv');
const DEPARTMENT_COLORS_PATH = path.join(__dirname, 'data', 'department_colors.csv');
const LAYOUT_DATA_PATH = path.join(__dirname, 'data', 'layout_data.json');

console.log("--- CSV-ready server.js is being executed ---");

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));


// Helper Functions

/**
 * CSVファイルを読み込み、指定された形式のオブジェクトに変換します。
 * @param {string} filePath ファイルパス
 * @param {boolean} isEmployeeData 社員データ形式（empNoをキーとするオブジェクト）かどうか
 * @returns {Promise<Object>} パースされたデータ
 */
function readCsvFile(filePath, isEmployeeData = false) {
    return new Promise((resolve, reject) => {
        const results = isEmployeeData ? {} : {};
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (data) => {
                if (isEmployeeData) {
                    // 社員データの場合: empNoをキーにしてオブジェクトを格納
                    if (data.empNo) {
                        results[data.empNo] = data;
                    }
                } else {
                    // カラーデータの場合: keyとvalueのペアを格納
                    if (data.key) {
                        results[data.key] = data.value;
                    }
                }
            })
            .on('end', () => {
                resolve(results);
            })
            .on('error', (error) => {
                reject(error);
            });
    });
}


/**
 * 3つのCSVファイルから初期データを非同期で読み込みます。
 */
async function getInitialData() {
    console.log("getInitialData (from CSV) called");
    try {
        // 3つのCSVファイルがすべて存在するかチェック
        await Promise.all([
            fsPromises.access(EMPLOYEE_DATA_PATH),
            fsPromises.access(TEAM_COLORS_PATH),
            fsPromises.access(DEPARTMENT_COLORS_PATH)
        ]);

        // 3つのファイルを並行して読み込む
        const [employeeData, teamColors, departmentColors] = await Promise.all([
            readCsvFile(EMPLOYEE_DATA_PATH, true),
            readCsvFile(TEAM_COLORS_PATH),
            readCsvFile(DEPARTMENT_COLORS_PATH)
        ]);

        return { employeeData, teamColors, departmentColors };

    } catch (error) {
        console.error('Error reading one or more initial CSV data files:', error);
        // ファイルが存在しない、または読み込めない場合は空のデータを返す
        return { employeeData: {}, teamColors: {}, departmentColors: {} };
    }
}


async function getLayoutData() {
    console.log("getLayoutData called");
    try {
        await fsPromises.access(LAYOUT_DATA_PATH);
        const data = JSON.parse(await fsPromises.readFile(LAYOUT_DATA_PATH));
        if (data && typeof data._version === 'number' && data.layout) {
            return data;
        }
        console.warn(`${LAYOUT_DATA_PATH} has invalid format. Creating default layout.`);
        return { _version: 0, layout: {} };
    } catch (error) {
        // ファイルが存在しない場合もここに来る
        console.warn(`${LAYOUT_DATA_PATH} not found or error reading. Creating default layout.`);
        return { _version: 0, layout: {} };
    }
}

async function saveLayoutData(data) {
    console.log("saveLayoutData called with data version:", data._version);
    try {
        await fsPromises.writeFile(LAYOUT_DATA_PATH, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error saving layout data:', error);
        throw error;
    }
}

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

// Wildcard route for SPA
app.get(/.*/, (req, res) => {
    console.log(`GET (regex .*) hit for path: ${req.path}. Sending index.html.`);
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, async () => {
    console.log(`Server listening on port ${PORT}`);
    // 起動時にレイアウトファイルがなければ作成
    try {
        await fsPromises.access(LAYOUT_DATA_PATH);
    } catch {
        console.log(`${LAYOUT_DATA_PATH} does not exist. Creating initial file.`);
        await saveLayoutData({ _version: 0, layout: {} })
            .catch(err => console.error('Failed to create initial layout_data.json:', err));
    }
});
