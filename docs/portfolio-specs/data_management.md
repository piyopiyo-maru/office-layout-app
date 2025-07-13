# データ管理設計仕様

## 概要

オフィスレイアウト管理システムのデータ管理は、**JSONファイルベース**の軽量アーキテクチャを採用しています。  
データベースを使用せず、ファイルシステムを活用した堅牢なデータ永続化・バックアップ・整合性管理を実現します。

## データ管理アーキテクチャ

### 設計思想

#### **1. シンプリシティ優先**
- **データベースサーバー不要**: 運用コストとメンテナンス負荷の削減
- **人間可読形式**: JSONファイルによる直接確認・編集可能
- **ファイルベース操作**: 標準的なファイル操作ツールでの管理

#### **2. 安全性確保**
- **自動バックアップ**: データ変更前の自動世代保存
- **バージョン管理**: 楽観的ロックによる競合制御
- **データ検証**: 厳格な入力値バリデーション

#### **3. 運用効率**
- **ゼロダウンタイム**: ファイル操作による瞬時更新
- **簡単復旧**: ファイルコピーでの即座バックアップ復元
- **監査可能**: 全変更履歴の永続保存

## データ構造設計

### ディレクトリ構造
```
data/
├── initial_data.json           # 社員マスターデータ
├── layout_data.json            # レイアウト・配置データ
└── backup/                     # 自動バックアップディレクトリ
    ├── 2025-01-13T09-30-15-initial_data.json
    ├── 2025-01-13T09-30-15-layout_data.json
    ├── 2025-01-13T10-45-22-initial_data.json
    ├── 2025-01-13T10-45-22-layout_data.json
    ├── 2025-01-13T11-20-08-initial_data.json
    ├── 2025-01-13T11-20-08-layout_data.json
    └── ...（最大10世代保持）
```

### 1. 社員マスターデータ（initial_data.json）

#### **データスキーマ**
```json
{
  "employeeData": {
    "[社員番号]": {
      "empNo": "string(20)",      // 社員番号（一意）
      "name": "string(50)",       // 氏名
      "title": "string(30)",      // 役職
      "dept": "string(50)",       // 部署名
      "team": "string(50)",       // チーム名
      "ext": "string(20)",        // 内線番号
      "ctstage": "string(30)"     // 雇用形態
    }
  },
  "departmentColors": {
    "[部署名]": "string(#RRGGBB)" // 部署表示色（HEX形式）
  },
  "teamColors": {
    "[チーム名]": "string(#RRGGBB)" // チーム表示色（HEX形式）
  }
}
```

#### **実装例**
```json
{
  "employeeData": {
    "EMP001": {
      "empNo": "EMP001",
      "name": "田中太郎",
      "title": "シニアエンジニア",
      "dept": "システム部",
      "team": "開発チーム",
      "ext": "1001",
      "ctstage": "正社員"
    },
    "EMP002": {
      "empNo": "EMP002",
      "name": "佐藤花子",
      "title": "UIデザイナー",
      "dept": "マーケティング部",
      "team": "UIチーム",
      "ext": "1002",
      "ctstage": "契約社員"
    },
    "EMP003": {
      "empNo": "EMP003",
      "name": "鈴木一郎",
      "title": "営業マネージャー",
      "dept": "営業部",
      "team": "法人営業チーム",
      "ext": "2001",
      "ctstage": "正社員"
    }
  },
  "departmentColors": {
    "システム部": "#FF6B6B",
    "マーケティング部": "#4ECDC4",
    "営業部": "#45B7D1",
    "管理部": "#96CEB4"
  },
  "teamColors": {
    "開発チーム": "#FFA07A",
    "インフラチーム": "#FF7F7F",
    "UIチーム": "#98D8C8",
    "法人営業チーム": "#87CEEB",
    "個人営業チーム": "#B0E0E6"
  }
}
```

### 2. レイアウトデータ（layout_data.json）

#### **データスキーマ**
```json
{
  "_version": "number",           // データバージョン（楽観的ロック用）
  "layout": {
    "[フロアID]": {
      "seatMap": "array[22][4][2]",      // 座席配置（島x行x列）
      "mergedSeats": "array",            // 結合座席情報
      "memoData": "object",              // 座席メモ
      "departmentZones": {
        "topRow": "array",               // 上段部署ゾーン
        "bottomRow": "array"             // 下段部署ゾーン
      }
    }
  }
}
```

#### **座席配置データ構造**
```json
{
  "_version": 15,
  "layout": {
    "3F": {
      "seatMap": [
        // 島0の座席配置（4席: 2行x2列）
        [
          ["EMP001", "EMP002"],  // 行0: [列0, 列1]
          ["EMP003", null]       // 行1: [列0, 列1] 
        ],
        // 島1の座席配置
        [
          [null, "EMP004"],
          ["EMP005", "EMP006"]
        ],
        // ... 島21まで（計22島 = 88席）
      ],
      "mergedSeats": [
        {
          "island": 0,
          "mergedCells": [[0,0], [0,1]], // 結合された座席位置
          "id": "merged_0_0_0_1"          // 結合ID
        },
        {
          "island": 5,
          "mergedCells": [[0,0], [1,0]], // 縦結合例
          "id": "merged_5_0_1_0"
        }
      ],
      "memoData": {
        "0-0-0": "プロジェクトリーダー席",
        "1-1-1": "新人研修用座席",
        "5-0-0": "会議用スペース"
      },
      "departmentZones": {
        "topRow": [
          {
            "name": "システム部",
            "startSeat": 1,           // 開始座席番号
            "endSeat": 11,            // 終了座席番号
            "color": "#FF6B6B"        // 表示色
          },
          {
            "name": "マーケティング部",
            "startSeat": 12,
            "endSeat": 22,
            "color": "#4ECDC4"
          }
        ],
        "bottomRow": [
          {
            "name": "営業部",
            "startSeat": 1,
            "endSeat": 15,
            "color": "#45B7D1"
          },
          {
            "name": "管理部",
            "startSeat": 16,
            "endSeat": 22,
            "color": "#96CEB4"
          }
        ]
      }
    },
    "4F": {
      // 4Fも同様の構造
      "seatMap": [ /* 4Fの座席配置 */ ],
      "mergedSeats": [],
      "memoData": {},
      "departmentZones": {
        "topRow": [],
        "bottomRow": []
      }
    }
  }
}
```

## データアクセス層実装

### ファイル操作基盤

#### **安全なファイル読み込み**
```javascript
const fs = require('fs-extra');
const path = require('path');

// データディレクトリ設定
const DATA_DIR = path.join(__dirname, 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backup');
const INITIAL_DATA_PATH = path.join(DATA_DIR, 'initial_data.json');
const LAYOUT_DATA_PATH = path.join(DATA_DIR, 'layout_data.json');

// 社員マスターデータ取得
async function getInitialData() {
    try {
        let data = { 
            employeeData: {}, 
            teamColors: {}, 
            departmentColors: {} 
        };
        
        if (await fs.pathExists(INITIAL_DATA_PATH)) {
            data = await fs.readJson(INITIAL_DATA_PATH);
        } else {
            console.warn(`${INITIAL_DATA_PATH} not found. Using default data.`);
        }
        
        // レイアウトデータとの整合性チェック
        await cleanupLayoutData(data.employeeData);
        
        return data;
    } catch (error) {
        console.error('Error reading initial data:', error);
        throw new Error(`Failed to read initial data: ${error.message}`);
    }
}

// レイアウトデータ取得
async function getLayoutData() {
    try {
        if (await fs.pathExists(LAYOUT_DATA_PATH)) {
            const data = await fs.readJson(LAYOUT_DATA_PATH);
            
            // データ形式検証
            if (data && typeof data._version === 'number' && data.layout) {
                return data;
            } else {
                console.warn('Invalid layout data format. Creating default.');
            }
        }
        
        // デフォルトデータ生成
        console.warn(`${LAYOUT_DATA_PATH} not found. Creating default layout.`);
        return createDefaultLayoutData();
        
    } catch (error) {
        console.error('Error reading layout data:', error);
        return createDefaultLayoutData();
    }
}

function createDefaultLayoutData() {
    return {
        _version: 0,
        layout: {
            "3F": {
                seatMap: Array(22).fill().map(() => Array(4).fill().map(() => Array(2).fill(null))),
                mergedSeats: [],
                memoData: {},
                departmentZones: { topRow: [], bottomRow: [] }
            },
            "4F": {
                seatMap: Array(22).fill().map(() => Array(4).fill().map(() => Array(2).fill(null))),
                mergedSeats: [],
                memoData: {},
                departmentZones: { topRow: [], bottomRow: [] }
            }
        }
    };
}
```

#### **安全なファイル書き込み**
```javascript
// 社員マスターデータ保存
async function saveInitialData(data) {
    try {
        // バリデーション実行
        validateEmployeeData(data);
        
        // バックアップ作成
        await createBackup(INITIAL_DATA_PATH);
        
        // 原子的書き込み（一時ファイル経由）
        const tempPath = `${INITIAL_DATA_PATH}.tmp`;
        await fs.writeJson(tempPath, data, { spaces: 2 });
        await fs.move(tempPath, INITIAL_DATA_PATH);
        
        console.log("Initial data saved successfully with backup created.");
    } catch (error) {
        console.error('Error saving initial data:', error);
        throw new Error(`Failed to save initial data: ${error.message}`);
    }
}

// レイアウトデータ保存
async function saveLayoutData(data) {
    try {
        // バックアップ作成
        await createBackup(LAYOUT_DATA_PATH);
        
        // 原子的書き込み
        const tempPath = `${LAYOUT_DATA_PATH}.tmp`;
        await fs.writeJson(tempPath, data, { spaces: 2 });
        await fs.move(tempPath, LAYOUT_DATA_PATH);
        
        console.log("Layout data saved successfully with backup created.");
    } catch (error) {
        console.error('Error saving layout data:', error);
        throw new Error(`Failed to save layout data: ${error.message}`);
    }
}
```

## 自動バックアップシステム

### バックアップ戦略

#### **タイムスタンプベース世代管理**
```javascript
const MAX_BACKUPS = 10; // 保持する最大世代数

async function createBackup(filePath) {
    try {
        // ファイル存在確認
        if (!(await fs.pathExists(filePath))) {
            console.log(`Backup skipped: Source file does not exist at ${filePath}`);
            return;
        }

        // バックアップディレクトリ確保
        await fs.ensureDir(BACKUP_DIR);

        // タイムスタンプ生成（ISO 8601形式、ファイル名安全）
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = path.basename(filePath);
        const backupFileName = `${timestamp}-${fileName}`;
        const backupFilePath = path.join(BACKUP_DIR, backupFileName);

        // 原子的ファイルコピー
        await fs.copy(filePath, backupFilePath);
        console.log(`✓ Backup created: ${backupFileName}`);

        // 世代ローテーション実行
        await rotateBackups(fileName);
        
    } catch (error) {
        console.error(`✗ Failed to create backup for ${filePath}:`, error);
        // バックアップ失敗でも処理続行（運用継続優先）
    }
}

async function rotateBackups(fileName) {
    try {
        const files = await fs.readdir(BACKUP_DIR);
        
        // 該当ファイルのバックアップを日時順ソート
        const fileBackups = files
            .filter(f => f.endsWith(`-${fileName}`))
            .sort() // ISO日時なのでアルファベット順 = 時系列順
            .map(f => path.join(BACKUP_DIR, f));

        // 古いバックアップ削除
        if (fileBackups.length > MAX_BACKUPS) {
            const backupsToDelete = fileBackups.slice(0, fileBackups.length - MAX_BACKUPS);
            
            for (const oldBackup of backupsToDelete) {
                await fs.remove(oldBackup);
                console.log(`✓ Old backup removed: ${path.basename(oldBackup)}`);
            }
        }
        
        console.log(`✓ Backup rotation completed. Keeping ${Math.min(fileBackups.length, MAX_BACKUPS)} generations.`);
        
    } catch (error) {
        console.error('✗ Error during backup rotation:', error);
    }
}
```

#### **バックアップ復元機能**
```javascript
// バックアップ一覧取得
async function listBackups(fileName) {
    try {
        const files = await fs.readdir(BACKUP_DIR);
        
        return files
            .filter(f => f.endsWith(`-${fileName}`))
            .sort()
            .reverse() // 新しい順
            .map(f => ({
                filename: f,
                path: path.join(BACKUP_DIR, f),
                timestamp: f.split('-')[0] + 'T' + f.split('-')[1].replace(/-/g, ':')
            }));
    } catch (error) {
        console.error('Error listing backups:', error);
        return [];
    }
}

// バックアップ復元
async function restoreFromBackup(backupFilePath, targetFilePath) {
    try {
        // 現在データのバックアップ作成（復元前保護）
        await createBackup(targetFilePath);
        
        // バックアップファイルから復元
        await fs.copy(backupFilePath, targetFilePath);
        
        console.log(`✓ Restored from backup: ${path.basename(backupFilePath)}`);
        return true;
    } catch (error) {
        console.error('✗ Error restoring from backup:', error);
        return false;
    }
}
```

## データ整合性管理

### 参照整合性チェック

#### **座席配置の整合性検証**
```javascript
// レイアウトデータから存在しない社員を削除
async function cleanupLayoutData(employeeData) {
    try {
        const layoutData = await getLayoutData();
        let layoutModified = false;
        
        if (!layoutData || !layoutData.layout) {
            return;
        }
        
        // 全フロアをチェック
        for (const floorId in layoutData.layout) {
            const floor = layoutData.layout[floorId];
            
            if (floor && floor.seatMap && Array.isArray(floor.seatMap)) {
                // 座席配置をスキャン
                floor.seatMap.forEach((island, islandIndex) => {
                    if (Array.isArray(island)) {
                        island.forEach((row, rowIndex) => {
                            if (Array.isArray(row)) {
                                row.forEach((empNo, colIndex) => {
                                    // 存在しない社員番号をnullに置換
                                    if (empNo && typeof empNo === 'string' && empNo !== 'null') {
                                        if (!employeeData[empNo]) {
                                            console.log(`🧹 Cleanup: ${floorId} Island${islandIndex} Row${rowIndex} Col${colIndex}: ${empNo} -> null`);
                                            floor.seatMap[islandIndex][rowIndex][colIndex] = null;
                                            layoutModified = true;
                                        }
                                    }
                                });
                            }
                        });
                    }
                });
            }
        }
        
        // 変更があった場合は保存
        if (layoutModified) {
            await saveLayoutData(layoutData);
            console.log('✓ Layout data automatically cleaned up and saved');
        }
        
    } catch (error) {
        console.warn('⚠️ Could not cleanup layout data:', error);
    }
}
```

#### **データ関係性検証**
```javascript
// 包括的データ整合性チェック
async function validateDataIntegrity() {
    const errors = [];
    
    try {
        const [initialData, layoutData] = await Promise.all([
            getInitialData(),
            getLayoutData()
        ]);
        
        // 1. 社員データの整合性
        const employeeNos = new Set(Object.keys(initialData.employeeData));
        
        // 2. レイアウト内の社員番号チェック
        const assignedEmployees = new Set();
        const invalidAssignments = [];
        
        for (const floorId in layoutData.layout) {
            const floor = layoutData.layout[floorId];
            
            floor.seatMap.forEach((island, islandIdx) => {
                island.forEach((row, rowIdx) => {
                    row.forEach((empNo, colIdx) => {
                        if (empNo && empNo !== null) {
                            const position = `${floorId}-${islandIdx}-${rowIdx}-${colIdx}`;
                            
                            // 重複配置チェック
                            if (assignedEmployees.has(empNo)) {
                                errors.push(`Duplicate assignment: ${empNo} at ${position}`);
                            } else {
                                assignedEmployees.add(empNo);
                            }
                            
                            // 存在しない社員チェック
                            if (!employeeNos.has(empNo)) {
                                invalidAssignments.push(`Invalid employee ${empNo} at ${position}`);
                            }
                        }
                    });
                });
            });
        }
        
        // 3. 部署・チーム色の整合性
        const departments = new Set();
        const teams = new Set();
        
        for (const emp of Object.values(initialData.employeeData)) {
            if (emp.dept) departments.add(emp.dept);
            if (emp.team) teams.add(emp.team);
        }
        
        // 未定義部署色チェック
        departments.forEach(dept => {
            if (!initialData.departmentColors[dept]) {
                errors.push(`Missing color for department: ${dept}`);
            }
        });
        
        // 4. レポート生成
        const report = {
            valid: errors.length === 0,
            errors: errors,
            statistics: {
                totalEmployees: employeeNos.size,
                assignedEmployees: assignedEmployees.size,
                unassignedEmployees: employeeNos.size - assignedEmployees.size,
                departments: departments.size,
                teams: teams.size
            }
        };
        
        if (errors.length > 0) {
            console.warn('⚠️ Data integrity issues found:', errors);
        } else {
            console.log('✅ Data integrity validation passed');
        }
        
        return report;
        
    } catch (error) {
        console.error('❌ Data integrity validation failed:', error);
        return { valid: false, errors: [error.message] };
    }
}
```

## バージョン管理システム

### 楽観的ロック実装

#### **競合検出機構**
```javascript
// バージョン競合チェック
function checkVersionConflict(clientVersion, serverVersion) {
    if (typeof clientVersion !== 'number' || typeof serverVersion !== 'number') {
        throw new Error('Invalid version format');
    }
    
    if (clientVersion !== serverVersion) {
        return {
            conflict: true,
            message: 'Data has been modified by another user',
            clientVersion: clientVersion,
            serverVersion: serverVersion
        };
    }
    
    return { conflict: false };
}

// バージョン付きデータ更新
async function updateLayoutWithVersion(clientData) {
    const clientVersion = clientData._version;
    const clientLayout = clientData.layout;
    
    // 現在のサーバーデータ取得
    const currentServerData = await getLayoutData();
    const serverVersion = currentServerData._version;
    
    // 競合チェック
    const conflictCheck = checkVersionConflict(clientVersion, serverVersion);
    if (conflictCheck.conflict) {
        throw new ConflictError('Version conflict detected', {
            serverVersion: serverVersion,
            clientVersion: clientVersion
        });
    }
    
    // 新バージョンで保存
    const newVersion = serverVersion + 1;
    const newData = {
        _version: newVersion,
        layout: clientLayout
    };
    
    await saveLayoutData(newData);
    
    return {
        success: true,
        newVersion: newVersion,
        message: 'Data updated successfully'
    };
}

// カスタムエラークラス
class ConflictError extends Error {
    constructor(message, details = {}) {
        super(message);
        this.name = 'ConflictError';
        this.details = details;
    }
}
```

## データバリデーション

### 入力値検証システム

#### **社員データバリデーション**
```javascript
function validateEmployeeData(data) {
    // 必須フィールド定義
    const allowedFields = ['empNo', 'name', 'title', 'dept', 'team', 'ext', 'ctstage'];
    const requiredFields = ['empNo', 'name', 'dept'];
    
    // 文字列長制限
    const maxLength = {
        empNo: 20, name: 50, title: 30, dept: 50, 
        team: 50, ext: 20, ctstage: 30
    };
    
    // セキュリティパターン
    const securityPatterns = {
        html: /<[^>]*>/g,
        script: /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
        javascript: /javascript:/i,
        vbscript: /vbscript:/i,
        onEvent: /on\w+\s*=/i,
        dataUrl: /data:text\/html/i
    };
    
    // 基本構造チェック
    if (!data || typeof data.employeeData !== 'object' || data.employeeData === null) {
        throw new ValidationError("Invalid data structure: employeeData is missing or not an object.");
    }
    
    // 各社員データ検証
    for (const empNo in data.employeeData) {
        const employee = data.employeeData[empNo];
        
        try {
            // 社員番号検証
            validateEmployeeNumber(empNo);
            
            // 必須フィールド確認
            for (const field of requiredFields) {
                if (!employee[field] || typeof employee[field] !== 'string' || employee[field].trim() === '') {
                    throw new Error(`Required field ${field} is missing or empty`);
                }
            }
            
            // 各フィールド検証
            for (const key in employee) {
                validateEmployeeField(key, employee[key], empNo, allowedFields, maxLength, securityPatterns);
            }
            
        } catch (error) {
            throw new ValidationError(`Validation error for employee ${empNo}: ${error.message}`);
        }
    }
    
    // カラー設定検証
    validateColorSettings(data.departmentColors, 'department');
    validateColorSettings(data.teamColors, 'team');
    
    console.log('✅ Employee data validation passed');
}

function validateEmployeeNumber(empNo) {
    if (typeof empNo !== 'string') {
        throw new Error('Employee number must be string');
    }
    if (empNo.length === 0 || empNo.length > 20) {
        throw new Error('Employee number length must be 1-20 characters');
    }
    if (!/^[A-Za-z0-9_-]+$/.test(empNo)) {
        throw new Error('Employee number contains invalid characters');
    }
}

function validateEmployeeField(key, value, empNo, allowedFields, maxLength, securityPatterns) {
    // フィールド許可チェック
    if (!allowedFields.includes(key)) {
        throw new Error(`Invalid field: ${key}`);
    }
    
    if (value !== null && value !== undefined) {
        // 型チェック
        if (typeof value !== 'string') {
            throw new Error(`Field ${key} must be string`);
        }
        
        // 長さチェック
        if (value.length > maxLength[key]) {
            throw new Error(`Field ${key} too long (max: ${maxLength[key]})`);
        }
        
        // セキュリティチェック
        for (const [patternName, pattern] of Object.entries(securityPatterns)) {
            if (pattern.test(value)) {
                throw new Error(`Security violation: ${patternName} detected in field ${key}`);
            }
        }
        
        // 特殊文字チェック（日本語対応）
        if (key === 'name' && !/^[\u4e00-\u9faf\u3040-\u309f\u30a0-\u30ffa-zA-Z\s　]+$/.test(value)) {
            throw new Error(`Name contains invalid characters: ${key}`);
        }
    }
}

function validateColorSettings(colors, type) {
    if (!colors) return;
    
    for (const [name, color] of Object.entries(colors)) {
        if (typeof name !== 'string' || name.length > 50) {
            throw new ValidationError(`Invalid ${type} name: ${name}`);
        }
        if (typeof color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(color)) {
            throw new ValidationError(`Invalid color format for ${type} ${name}: ${color}`);
        }
    }
}

class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ValidationError';
    }
}
```

## データ移行・インポート/エクスポート

### データ移行機能

#### **CSVインポート対応**
```javascript
// CSV形式の社員データをJSONに変換
async function importEmployeeDataFromCSV(csvContent) {
    const csv = require('csv-parse/sync');
    
    try {
        const records = csv.parse(csvContent, {
            headers: true,
            skipEmptyLines: true,
            trim: true
        });
        
        const employeeData = {};
        const errors = [];
        
        for (const [index, record] of records.entries()) {
            try {
                const empNo = record.empNo || record['社員番号'];
                if (!empNo) {
                    errors.push(`Row ${index + 1}: Missing employee number`);
                    continue;
                }
                
                employeeData[empNo] = {
                    empNo: empNo,
                    name: record.name || record['氏名'] || '',
                    title: record.title || record['役職'] || '',
                    dept: record.dept || record['部署'] || '',
                    team: record.team || record['チーム'] || '',
                    ext: record.ext || record['内線'] || '',
                    ctstage: record.ctstage || record['雇用形態'] || ''
                };
                
            } catch (error) {
                errors.push(`Row ${index + 1}: ${error.message}`);
            }
        }
        
        if (errors.length > 0) {
            throw new Error(`CSV import errors:\n${errors.join('\n')}`);
        }
        
        return {
            employeeData: employeeData,
            departmentColors: {},
            teamColors: {}
        };
        
    } catch (error) {
        throw new Error(`CSV parsing failed: ${error.message}`);
    }
}
```

#### **データエクスポート機能**
```javascript
// 現在データの完全エクスポート
async function exportAllData() {
    try {
        const [initialData, layoutData] = await Promise.all([
            getInitialData(),
            getLayoutData()
        ]);
        
        const exportData = {
            metadata: {
                exportDate: new Date().toISOString(),
                version: layoutData._version,
                dataFormat: '1.0'
            },
            initialData: initialData,
            layoutData: layoutData
        };
        
        return exportData;
    } catch (error) {
        throw new Error(`Export failed: ${error.message}`);
    }
}

// バックアップ情報付きエクスポート
async function exportWithBackupInfo() {
    try {
        const exportData = await exportAllData();
        
        // バックアップ履歴追加
        const [initialBackups, layoutBackups] = await Promise.all([
            listBackups('initial_data.json'),
            listBackups('layout_data.json')
        ]);
        
        exportData.backupInfo = {
            initialDataBackups: initialBackups.slice(0, 5), // 最新5世代
            layoutDataBackups: layoutBackups.slice(0, 5)
        };
        
        return exportData;
    } catch (error) {
        throw new Error(`Export with backup info failed: ${error.message}`);
    }
}
```

## パフォーマンス最適化

### ファイルアクセス最適化

#### **非同期I/O活用**
```javascript
// 並列読み込みによる高速化
async function loadAllDataParallel() {
    try {
        const [initialData, layoutData] = await Promise.all([
            getInitialData(),
            getLayoutData()
        ]);
        
        return { initialData, layoutData };
    } catch (error) {
        console.error('Parallel data loading failed:', error);
        throw error;
    }
}

// バッチ処理による効率化
async function batchUpdateData(updates) {
    const results = [];
    
    try {
        // バックアップ作成を並列実行
        await Promise.all([
            createBackup(INITIAL_DATA_PATH),
            createBackup(LAYOUT_DATA_PATH)
        ]);
        
        // 更新処理を順次実行（データ整合性のため）
        for (const update of updates) {
            const result = await processUpdate(update);
            results.push(result);
        }
        
        return results;
    } catch (error) {
        console.error('Batch update failed:', error);
        throw error;
    }
}
```

#### **メモリ効率管理**
```javascript
// 大容量データ対応ストリーミング
const { Transform } = require('stream');

class DataValidationTransform extends Transform {
    constructor(options = {}) {
        super({ objectMode: true });
        this.validator = options.validator;
        this.errors = [];
    }
    
    _transform(chunk, encoding, callback) {
        try {
            if (this.validator) {
                this.validator(chunk);
            }
            this.push(chunk);
        } catch (error) {
            this.errors.push(error.message);
        }
        callback();
    }
}

// ストリーミング処理でのメモリ効率化
async function processLargeDataset(dataStream) {
    return new Promise((resolve, reject) => {
        const validator = new DataValidationTransform({
            validator: validateEmployeeData
        });
        
        const results = [];
        
        dataStream
            .pipe(validator)
            .on('data', (chunk) => {
                results.push(chunk);
            })
            .on('end', () => {
                if (validator.errors.length > 0) {
                    reject(new Error(`Validation errors: ${validator.errors.join(', ')}`));
                } else {
                    resolve(results);
                }
            })
            .on('error', reject);
    });
}
```

---

このデータ管理設計は、**軽量性・安全性・運用性**を重視し、データベースを使わない効率的なデータ永続化システムを実現しています。