const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const app = express();
const PORT = 3000;

// === 設定項目 ===
const DATA_DIR = path.join(__dirname, 'data');
const INITIAL_DATA_PATH = path.join(DATA_DIR, 'initial_data.json');
const LAYOUT_DATA_PATH = path.join(DATA_DIR, 'layout_data.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backup'); // バックアップ用ディレクトリ
const MAX_BACKUPS = 10; // 保持するバックアップの最大世代数

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// === バックアップ管理関数 ===
/**
 * ファイルのバックアップを作成し、古いバックアップを削除（ローテーション）する
 * @param {string} filePath バックアップ対象のファイルパス
 */
async function createBackupAndRotate(filePath) {
    console.log(`[Backup] Starting backup process for: ${filePath}`);
    try {
        // バックアップディレクトリの存在を再度確認（念のため）
        await fs.ensureDir(BACKUP_DIR);

        // バックアップ元のファイルが存在するかチェック
        const sourceExists = await fs.pathExists(filePath);
        if (!sourceExists) {
            console.log(`[Backup] Source file not found, skipping backup: ${filePath}`);
            return;
        }

        const { name, ext } = path.parse(filePath);

        // ファイルシステムで安全なタイムスタンプ付きのバックアップファイル名を生成
        const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
        const backupFileName = `${name}_${timestamp}${ext}`;
        const backupFilePath = path.join(BACKUP_DIR, backupFileName);

        // ファイルをバックアップディレクトリにコピー
        await fs.copy(filePath, backupFilePath);
        console.log(`[Backup] SUCCESS: Created backup -> ${backupFileName}`);

        // --- ローテーション処理 ---
        const allFiles = await fs.readdir(BACKUP_DIR);
        // 同じ種類のバックアップファイル（例: layout_data_...）を抽出してソート
        const backups = allFiles
            .filter(file => file.startsWith(name + '_') && file.endsWith(ext))
            .sort();

        // 最大保持数を超えていれば、古いものから削除
        if (backups.length > MAX_BACKUPS) {
            const backupsToDelete = backups.slice(0, backups.length - MAX_BACKUPS);
            for (const backupToDelete of backupsToDelete) {
                await fs.remove(path.join(BACKUP_DIR, backupToDelete));
                console.log(`[Backup] ROTATED: Deleted old backup -> ${backupToDelete}`);
            }
        }
    } catch (error) {
        console.error(`[Backup] FAILED to create or rotate backup for ${filePath}:`, error);
    }
}

// === データ保存・読込ヘルパー関数 ===

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
        await createBackupAndRotate(INITIAL_DATA_PATH);
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
        await createBackupAndRotate(LAYOUT_DATA_PATH);
        await fs.writeJson(LAYOUT_DATA_PATH, data, { spaces: 2 });
    } catch (error) {
        console.error('Error saving layout data:', error);
        throw error;
    }
}

// === API エンドポイント ===
app.get('/api/initial-data', async (req, res) => {
    try {
        const initialData = await getInitialData();
        res.setHeader('Cache-Control', 'no-store');
        res.json(initialData);
    } catch (error) {
        res.status(500).json({ message: "Server error: Could not get initial data.", error: error.message });
    }
});

app.post('/api/initial-data', async (req, res) => {
    const newData = req.body;
    if (!newData || typeof newData !== 'object' || !newData.employeeData || !newData.teamColors || !newData.departmentColors) {
         return res.status(400).json({ message: 'Bad request: JSON data is missing or invalid.' });
    }
    try {
        await saveInitialData(newData);
        console.log('[API] Initial data saved successfully.');
        res.status(200).json({ message: 'Initial data saved successfully.' });
    } catch (error) {
        console.error('[API] Failed to save initial data:', error);
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
        console.log(`[API] Layout data saved successfully. Version incremented to ${newVersion}.`);
        res.json({
            message: 'Layout saved successfully.',
            _newVersion: newVersion,
        });
    } catch (error) {
        console.error('[API] Error during layout save process:', error);
        res.status(500).send('Server error: Could not save layout.');
    }
});

// SPAフォールバック
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// サーバー起動
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    
    // ★★★ 修正: サーバー起動時にディレクトリを同期的に作成 ★★★
    try {
        fs.ensureDirSync(DATA_DIR);
        fs.ensureDirSync(BACKUP_DIR);
        console.log(`[Startup] Data directory is ready at: ${DATA_DIR}`);
        console.log(`[Startup] Backup directory is ready at: ${BACKUP_DIR}`);
    } catch (err) {
        console.error(`[Startup] CRITICAL: Could not create data or backup directory.`, err);
        // エラーが発生した場合はプロセスを終了して問題を明確にする
        process.exit(1);
    }
    
    // 初回起動時にレイアウトファイルがなければ作成
    fs.pathExists(LAYOUT_DATA_PATH).then(exists => {
        if (!exists) {
            console.log('[Startup] layout_data.json not found, creating a new one...');
            // 初回作成時にはバックアップは不要なので、fs.writeJsonを直接使用
            fs.writeJson(LAYOUT_DATA_PATH, { _version: 0, layout: {} }, { spaces: 2 })
                .then(() => console.log('[Startup] Successfully created layout_data.json.'))
                .catch(err => console.error('[Startup] Failed to create initial layout_data.json:', err));
        }
    });
});
