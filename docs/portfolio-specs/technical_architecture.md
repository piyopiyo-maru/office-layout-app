# 技術アーキテクチャ仕様

## 概要

オフィスレイアウト管理システムは、**フレームワークレス設計**によるシンプルかつ効率的なWebアプリケーションです。  
複雑な依存関係を排除し、ブラウザネイティブAPI + Node.js/Expressの最小構成で実装されています。

## システム全体アーキテクチャ

### 階層構造
```
┌─────────────────────────────────────────────────────────┐
│                     Presentation Layer                 │
│  ┌─────────────────┐  ┌─────────────────────────────────┐ │
│  │   HTML5/CSS3    │  │       Vanilla JavaScript       │ │
│  │   ・UI構造      │  │   ・ドラッグ&ドロップロジック   │ │
│  │   ・レスポンシブ│  │   ・状態管理                   │ │
│  │   ・印刷対応    │  │   ・API通信                    │ │
│  └─────────────────┘  └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                               │ HTTP/REST
┌─────────────────────────────────────────────────────────┐
│                    Application Layer                   │
│  ┌─────────────────────────────────────────────────────┐ │
│  │                Express.js Server                   │ │
│  │   ・RESTful API                                    │ │
│  │   ・CORS対応                                       │ │
│  │   ・静的ファイル配信                               │ │
│  │   ・エラーハンドリング                             │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                               │ fs-extra
┌─────────────────────────────────────────────────────────┐
│                      Data Layer                        │
│  ┌─────────────────┐  ┌─────────────────────────────────┐ │
│  │   JSON Files    │  │      Backup System              │ │
│  │   ・initial_data│  │   ・自動タイムスタンプ          │ │
│  │   ・layout_data │  │   ・世代管理（最大10世代）      │ │
│  │   ・バージョン管理│  │   ・ファイル回転               │ │
│  └─────────────────┘  └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## コア技術スタック

### Backend Technology Stack

#### **Node.js 18+ / Express 4.18**
```javascript
// server.js - ミニマルな構成
const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static('public'));
```

**選択理由**:
- **軽量性**: 最小限の依存関係
- **高速性**: V8エンジンによる高速実行
- **保守性**: 枯れた技術による安定性

#### **ファイルシステムベース永続化**
```javascript
// データ管理の核心部分
const DATA_DIR = path.join(__dirname, 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backup');
const MAX_BACKUPS = 10;

async function createBackup(filePath) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `${timestamp}-${path.basename(filePath)}`;
    await fs.copy(filePath, path.join(BACKUP_DIR, backupFileName));
}
```

**特徴**:
- **自動バックアップ**: 変更前の自動世代保存
- **バージョン管理**: 楽観的ロックによる並行制御
- **データ整合性**: fs-extraによる安全なファイル操作

### Frontend Technology Stack

#### **Vanilla JavaScript ES6+**
```javascript
// フレームワークレスの状態管理
let allFloorData = {}; // 全フロアデータ
let currentFloorId = '3F'; // 現在フロア
let currentAppMode = 'view'; // アプリケーションモード

// ドラッグ&ドロップの実装
element.addEventListener('dragstart', (e) => {
    draggedEmployeeInfo = {
        empNo: empNo,
        origin: 'unassigned'
    };
    e.dataTransfer.effectAllowed = 'move';
});
```

**特徴**:
- **ネイティブAPI活用**: Drag & Drop API、File API直接使用
- **メモリ効率**: 必要最小限のオブジェクト管理
- **高速レンダリング**: 仮想DOM不要の直接DOM操作

#### **HTML5 Semantic Markup**
```html
<!-- セマンティックな構造 -->
<div class="side-panel" id="employeeList">
    <h2><i class="fas fa-users"></i> 未配置社員</h2>
    <div id="employeeFilterContainer">
        <input type="text" id="employeeSearchInput" 
               placeholder="名前・社員番号・部署で検索...">
        <select id="departmentFilter"></select>
    </div>
</div>
```

**特徴**:
- **アクセシビリティ**: WAI-ARIA対応
- **SEO対応**: セマンティックマークアップ
- **メンテナブル**: 明確な構造と命名規則

## データ アーキテクチャ

### データモデル設計

#### **社員マスターデータ（initial_data.json）**
```javascript
{
  "employeeData": {
    "EMP001": {
      "empNo": "EMP001",
      "name": "田中太郎",
      "title": "エンジニア",
      "dept": "システム部",
      "team": "開発チーム",
      "ext": "1001",
      "ctstage": "正社員"
    }
  },
  "departmentColors": {
    "システム部": "#FF6B6B",
    "営業部": "#4ECDC4"
  },
  "teamColors": {
    "開発チーム": "#45B7D1",
    "インフラチーム": "#96CEB4"
  }
}
```

#### **レイアウトデータ（layout_data.json）**
```javascript
{
  "_version": 5,
  "layout": {
    "3F": {
      "seatMap": [
        [ // 島0の座席配置
          ["EMP001", "EMP002"], // 行0
          ["EMP003", null]      // 行1
        ],
        [ // 島1の座席配置
          [null, "EMP004"],
          ["EMP005", "EMP006"]
        ]
      ],
      "mergedSeats": [
        {
          "island": 0,
          "mergedCells": [[0,0], [0,1]], // 結合された座席
          "id": "merged_0_0_0_1"
        }
      ],
      "departmentZones": {
        "topRow": [
          {
            "name": "システム部",
            "startSeat": 1,
            "endSeat": 11,
            "color": "#FF6B6B"
          }
        ],
        "bottomRow": []
      }
    },
    "4F": { /* 4Fの同様構造 */ }
  }
}
```

### バージョン管理システム

#### **楽観的ロック機構**
```javascript
// クライアント側でのバージョンチェック
const clientVersion = currentLayoutVersion;
const saveData = {
    _version: clientVersion,
    layout: allFloorData
};

// サーバー側での競合検出
if (clientVersion !== serverVersion) {
    return res.status(409).json({
        message: 'Conflict: Layout updated by another user.',
        serverVersion: serverVersion
    });
}
```

**特徴**:
- **競合検出**: 同時編集の自動検出
- **データ保護**: 意図しない上書きの防止
- **ユーザー通知**: 競合発生時の適切なフィードバック

## API アーキテクチャ

### RESTful API 設計

#### **エンドポイント一覧**
```
GET    /api/initial-data           # マスターデータ取得
POST   /api/initial-data           # マスターデータ更新
GET    /api/layouts/default        # レイアウトデータ取得
POST   /api/layouts/default        # レイアウトデータ更新
GET    /api/download-initial-data  # データエクスポート
```

#### **API実装例**
```javascript
// レイアウト保存API
app.post('/api/layouts/default', async (req, res) => {
    const { _version: clientVersion, layout: clientLayout } = req.body;
    
    if (typeof clientVersion !== 'number' || !clientLayout) {
        return res.status(400).send('Bad request: Missing version or layout data.');
    }

    try {
        const currentServerData = await getLayoutData();
        const serverVersion = currentServerData._version;

        // バージョン競合チェック
        if (clientVersion !== serverVersion) {
            return res.status(409).json({
                message: 'Conflict: Layout updated by another user.',
                serverVersion: serverVersion
            });
        }

        // 新バージョンで保存
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
```

## セキュリティアーキテクチャ

### 入力値検証システム
```javascript
function validateEmployeeData(data) {
    const allowedFields = ['empNo', 'name', 'title', 'dept', 'team', 'ext', 'ctstage'];
    const maxLength = {
        empNo: 20, name: 50, title: 30, dept: 50, 
        team: 50, ext: 20, ctstage: 30
    };
    
    // HTMLタグ・スクリプト検出
    const htmlPattern = /<[^>]*>/g;
    const scriptPattern = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
    
    for (const empNo in data.employeeData) {
        const employee = data.employeeData[empNo];
        
        // 各フィールドのバリデーション
        for (const key in employee) {
            if (!allowedFields.includes(key)) {
                throw new Error(`Invalid field: ${key}`);
            }
            
            const value = employee[key];
            if (value && typeof value === 'string') {
                if (value.length > maxLength[key]) {
                    throw new Error(`Field ${key} too long`);
                }
                if (htmlPattern.test(value) || scriptPattern.test(value)) {
                    throw new Error(`HTML/Script tags not allowed in field ${key}`);
                }
            }
        }
    }
}
```

### XSS対策
- **入力値サニタイゼーション**: HTMLタグ・スクリプトの除去
- **出力時エスケープ**: DOM挿入時の安全な処理
- **CSP設定**: Content Security Policyによる追加保護

## パフォーマンス アーキテクチャ

### フロントエンド最適化

#### **効率的DOM操作**
```javascript
// 一括DOM更新によるレンダリング最適化
function updateSeatDisplay(island, row, col, empNo) {
    const seatElement = document.getElementById(`seat-${island}-${row}-${col}`);
    
    if (empNo && cardDB[empNo]) {
        const employee = cardDB[empNo];
        seatElement.innerHTML = `
            <div class="employee-info">
                <div class="employee-name">${employee.name}</div>
                <div class="employee-dept">${employee.dept}</div>
            </div>
        `;
        seatElement.className = `seat occupied ${getDepartmentClass(employee.dept)}`;
    } else {
        seatElement.innerHTML = '';
        seatElement.className = 'seat empty';
    }
}
```

#### **メモリ管理**
```javascript
// 効率的な状態管理
const MemoryManager = {
    // 不要なイベントリスナーの削除
    cleanupEventListeners: function() {
        document.querySelectorAll('.draggable-employee').forEach(el => {
            el.removeEventListener('dragstart', this.handleDragStart);
        });
    },
    
    // DOM要素の再利用
    reuseEmployeeElements: function(employees) {
        const container = document.getElementById('employeeListContent');
        const existingElements = container.querySelectorAll('.employee-card');
        
        // 既存要素の再利用による生成コスト削減
        employees.forEach((emp, index) => {
            if (existingElements[index]) {
                this.updateEmployeeElement(existingElements[index], emp);
            } else {
                this.createEmployeeElement(container, emp);
            }
        });
    }
};
```

### バックエンド最適化

#### **ファイルI/O最適化**
```javascript
// 非同期I/Oによる応答性確保
async function saveLayoutData(data) {
    try {
        // バックアップと保存の並列実行
        const [backupResult] = await Promise.all([
            createBackup(LAYOUT_DATA_PATH),
            fs.writeJson(LAYOUT_DATA_PATH, data, { spaces: 2 })
        ]);
        
        console.log('Layout data saved with backup created');
    } catch (error) {
        console.error('Error saving layout data:', error);
        throw error;
    }
}
```

## 拡張性アーキテクチャ

### 水平スケーリング対応設計
```javascript
// 環境変数による設定外部化
const CONFIG = {
    PORT: process.env.PORT || 9000,
    DATA_DIR: process.env.DATA_DIR || './data',
    MAX_BACKUPS: parseInt(process.env.MAX_BACKUPS) || 10,
    CORS_ORIGIN: process.env.CORS_ORIGIN || '*'
};

// 将来のデータベース移行を考慮したDAOパターン
class DataAccessLayer {
    async getEmployeeData() {
        // 現在: ファイルベース
        return await fs.readJson(INITIAL_DATA_PATH);
        // 将来: データベース
        // return await db.query('SELECT * FROM employees');
    }
    
    async saveLayoutData(data) {
        // 現在: ファイルベース
        await fs.writeJson(LAYOUT_DATA_PATH, data);
        // 将来: データベース
        // await db.query('UPDATE layouts SET data = ?', [data]);
    }
}
```

### フロア拡張対応
```javascript
// 動的フロア対応
const FLOOR_CONFIG = {
    availableFloors: process.env.FLOORS?.split(',') || ['3F', '4F'],
    defaultFloor: process.env.DEFAULT_FLOOR || '3F',
    seatsPerFloor: parseInt(process.env.SEATS_PER_FLOOR) || 88
};

// フロア設定の動的読み込み
function initializeFloors() {
    FLOOR_CONFIG.availableFloors.forEach(floorId => {
        if (!allFloorData[floorId]) {
            allFloorData[floorId] = createEmptyFloorData();
        }
    });
}
```

## 運用アーキテクチャ

### Docker化戦略
```dockerfile
# マルチステージビルドによる最適化
FROM node:18-alpine AS builder
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --only=production

FROM node:18-alpine AS runtime
WORKDIR /usr/src/app
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY . .
EXPOSE 9000
CMD ["node", "server.js"]
```

### 監視・ログ戦略
```javascript
// 構造化ログ
const logger = {
    info: (message, meta = {}) => {
        console.log(JSON.stringify({
            level: 'info',
            timestamp: new Date().toISOString(),
            message,
            ...meta
        }));
    },
    
    error: (message, error, meta = {}) => {
        console.error(JSON.stringify({
            level: 'error',
            timestamp: new Date().toISOString(),
            message,
            error: error.message,
            stack: error.stack,
            ...meta
        }));
    }
};

// ヘルスチェックエンドポイント
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version
    });
});
```

## 技術選択の根拠

### フレームワークレス採用理由

1. **学習コスト削減**: 新しいフレームワークAPIの学習不要
2. **長期安定性**: フレームワークの廃止・大幅変更リスクなし
3. **パフォーマンス**: 余分なライブラリによるオーバーヘッドなし
4. **デバッグしやすさ**: ブラウザ標準APIの直接デバッグ

### ファイルベース永続化の根拠

1. **運用シンプルさ**: データベースサーバー不要
2. **データ可視性**: JSONファイルの直接確認・編集可能
3. **バックアップ容易性**: ファイルコピーでの簡単バックアップ
4. **適正規模最適化**: 対象規模に対する過剰仕様回避

### 技術的制約とトレードオフ

#### **制約事項**
- **同時接続数**: ファイルロック機構の制限
- **データ量**: メモリ常駐によるスケーラビリティ制限
- **トランザクション**: ACID特性の部分的実装

#### **トレードオフの判断**
- **複雑性 vs 機能**: 必要最小限の機能で複雑性を抑制
- **パフォーマンス vs 保守性**: 理解しやすさを優先
- **汎用性 vs 特化**: 特定用途への最適化

---

この技術アーキテクチャは、**実用性・保守性・シンプリシティ**のバランスを重視し、中小企業の実際の運用要件に最適化された設計となっています。