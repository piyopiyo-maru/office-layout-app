const express = require('express');
const cors = require('cors'); // ★★★ この行を追加 ★★★
// (テスト)
const fs = require('fs-extra');
// (テスト)
const path = require('path');
// (テスト)
const { compare, applyPatch } = require('fast-json-patch');
// (テスト)
const app = express();
const PORT = 3000;

// const app = express(); // 既に最小構成にある
// const PORT = 3000;    // 既に最小構成にある
const INITIAL_DATA_PATH = path.join(__dirname, 'data', 'initial_data.json');
const LAYOUT_DATA_PATH = path.join(__dirname, 'data', 'layout_data.json');

// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
// ★ 起動確認用：このログがコンテナログの最初の方に出るか確認 ★
// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
console.log("--- MINIMAL SERVER.JS IS BEING EXECUTED (with cors require) ---");

// Middleware
try {
    app.use(cors());
    console.log("CORS middleware applied."); // ★
    app.use(express.json({ limit: '5mb' }));
    console.log("express.json middleware applied."); // ★
    app.use(express.static(path.join(__dirname, 'public')));
    console.log("express.static middleware applied for 'public' directory."); // ★
} catch (e) {
    console.error("Error applying middleware:", e); // ★ミドルウェア適用時のエラーキャッチ
    throw e; // エラーを再スローしてクラッシュさせる
}

// Helper Functions
async function getInitialData() {
    console.log("getInitialData called"); // ★
    try {
        // fs-extraのpathExistsとreadJsonは非同期なので、
        // この関数が呼び出されるたびにファイルシステムにアクセスします。
        if (await fs.pathExists(INITIAL_DATA_PATH)) {
            return await fs.readJson(INITIAL_DATA_PATH);
        }
        console.warn(`${INITIAL_DATA_PATH} not found.`);
        return { employeeData: {}, teamColors: {}, departmentColors: {} };
    } catch (error) {
        console.error('Error reading initial data:', error);
        throw error; // エラーを呼び出し元に伝播させる
    }
}

async function getLayoutData() {
    console.log("getLayoutData called"); // ★
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
        return { _version: 0, layout: {} }; // Return default on error
    }
}

async function saveLayoutData(data) {
    console.log("saveLayoutData called with data version:", data._version); // ★
    try {
        await fs.writeJson(LAYOUT_DATA_PATH, data, { spaces: 2 });
    } catch (error) {
        console.error('Error saving layout data:', error);
        throw error;
    }
}

// API Endpoints
console.log("Defining API endpoints..."); // ★
try {
    app.get('/api/initial-data', async (req, res) => {
        console.log('GET /api/initial-data hit'); // ★
        try {
            const initialData = await getInitialData(); // ★ リクエストごとに呼び出される
            res.json(initialData);
        } catch (error) {
            // エラーレスポンスを改善
            console.error('Server error in /api/initial-data:', error);
            res.status(500).json({ message: "Server error: Could not get initial data.", error: error.message });
        }
    });
    console.log("Defined GET /api/initial-data"); // ★
} catch (e) {
    console.error("Error defining GET /api/initial-data:", e);
    throw e;
}

try {
    app.get('/api/layouts/default', async (req, res) => {
        console.log('GET /api/layouts/default hit');
        try {
            const layoutData = await getLayoutData();
            res.json(layoutData);
        } catch (error) {
            res.status(500).send('Server error: Could not get layout data.');
        }
    });
    console.log("Defined GET /api/layouts/default");
} catch (e) {
    console.error("Error defining GET /api/layouts/default:", e);
    throw e;
}

try {
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
    console.log("Defined POST /api/layouts/default");
} catch (e) {
    console.error("Error defining POST /api/layouts/default:", e);
    throw e;
}

try {
    // Wildcard route for SPA - MUST BE LAST
    app.get(/.*/, (req, res) => { // ★★★ '*' を正規表現 /.*/ に変更 ★★★
        console.log(`GET (regex .*) hit for path: ${req.path}. Sending index.html.`);
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });
    console.log("Defined GET .*/ (wildcard regex route)");

} catch (e) {
    console.error("Error defining GET .*/ (wildcard regex route):", e);
    throw e;
}

app.get('/', (req, res) => {
  console.log("Minimal GET / route hit"); // このルートが叩かれるかの確認用
  res.send('Minimal Express server is running!');
});

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`); // "Minimal" を削除または変更
    // Initialize layout_data.json if it doesn't exist
    fs.pathExists(LAYOUT_DATA_PATH).then(exists => {
        if (!exists) {
            console.log(`${LAYOUT_DATA_PATH} does not exist. Creating initial file.`);
            // saveLayoutData 関数がこのスコープで利用可能であることを確認してください。
            // もし saveLayoutData が未定義なら、この部分はコメントアウトするか、
            // 先に saveLayoutData 関数の定義を server.js に追加する必要があります。
            // ここでは、saveLayoutData が定義されている前提で進めます。
            saveLayoutData({ _version: 0, layout: {} })
                .catch(err => console.error('Failed to create initial layout_data.json:', err));
        }
    });
});

// エラーハンドリング (念のため)
app.on('error', (err) => {
  console.error('Express app error:', err);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1); // エラーで終了させる
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1); // エラーで終了させる
});
