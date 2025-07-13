# フロントエンド技術仕様

## 概要

オフィスレイアウト管理システムのフロントエンドは、**Vanilla JavaScript**によるフレームワークレス設計を採用しています。  
HTML5ネイティブAPI + CSS3 + ES6+の組み合わせにより、軽量かつ高機能なユーザーインターフェースを実現します。

## フロントエンドアーキテクチャ

### 設計原則

#### **1. フレームワークレス哲学**
- **Native First**: ブラウザ標準APIの直接活用
- **Zero Dependencies**: 外部フレームワークへの依存なし
- **Future Proof**: 標準技術による長期安定性
- **Performance**: 余分なライブラリによるオーバーヘッドなし

#### **2. コンポーネント指向設計**
- **モジュラー構造**: 機能別の明確な分離
- **再利用性**: 共通コンポーネントの効率的活用
- **保守性**: 理解しやすいコード構造

#### **3. ユーザビリティ優先**
- **直感的操作**: ドラッグ&ドロップによる自然な操作
- **レスポンシブ**: 複数デバイス対応
- **アクセシビリティ**: WAI-ARIA準拠

## アーキテクチャ構成

### レイヤー構造
```
┌─────────────────────────────────────────────────────────┐
│                 Presentation Layer                      │
│  ┌─────────────────┐  ┌─────────────────────────────────┐ │
│  │   HTML5 Views   │  │         UI Components           │ │
│  │   ・座席グリッド │  │   ・EmployeeCard                │ │
│  │   ・社員リスト   │  │   ・SeatGrid                    │ │
│  │   ・モーダル     │  │   ・DragDropHandler             │ │
│  └─────────────────┘  └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                               │
┌─────────────────────────────────────────────────────────┐
│                   Logic Layer                           │
│  ┌─────────────────┐  ┌─────────────────────────────────┐ │
│  │  State Manager  │  │       Event Handlers            │ │
│  │   ・allFloorData│  │   ・DragStart/Drop              │ │
│  │   ・seatMap     │  │   ・Modal Management            │ │
│  │   ・mergedSeats │  │   ・API Communication           │ │
│  └─────────────────┘  └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                               │
┌─────────────────────────────────────────────────────────┐
│                   Data Layer                            │
│  ┌─────────────────┐  ┌─────────────────────────────────┐ │
│  │   API Client    │  │       LocalStorage              │ │
│  │   ・RESTful API │  │   ・下書き保存                  │ │
│  │   ・Error Handle│  │   ・設定キャッシュ              │ │
│  │   ・Version Mgmt│  │   ・操作履歴                    │ │
│  └─────────────────┘  └─────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## コア技術実装

### 1. HTML5 セマンティック構造

#### **メインレイアウト**
```html
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>座席表管理</title>
    <link rel="stylesheet" href="css/style.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
</head>
<body>
    <!-- フロア表示ヘッダー -->
    <div id="floorDisplayContainer">
        <span id="currentFloorName"></span>
        <button id="switchFloorButton"></button>
    </div>

    <!-- 管理コントロール -->
    <div id="topRightControlsContainer">
        <div id="modeSwitcher">
            <button id="enterAdminModeBtn">
                <i class="fa-solid fa-user-shield"></i> 管理モードへ
            </button>
            <button id="exitAdminModeBtn" style="display:none;">
                <i class="fa-solid fa-eye"></i> 閲覧モードへ
            </button>
        </div>
    </div>

    <!-- 社員リストサイドパネル -->
    <div class="side-panel-wrapper">
        <div class="side-panel" id="employeeList">
            <h2><i class="fas fa-users"></i> 未配置社員</h2>
            <div id="employeeFilterContainer">
                <div class="search-container">
                    <input type="text" id="employeeSearchInput" 
                           placeholder="名前・社員番号・部署で検索..." 
                           autocomplete="off">
                </div>
                <select id="departmentFilter"></select>
            </div>
        </div>
    </div>

    <!-- 座席グリッド -->
    <div class="grid-floor" id="floorMap">
        <div class="section-islands finance-area-top" id="finance1IslandContainerTop">
            <div class="grid-island" data-island="0"></div>
            <div class="grid-island" data-island="1"></div>
            <!-- ...島21まで -->
        </div>
    </div>

    <!-- 操作コントロール -->
    <div class="controls-wrapper">
        <button id="controlsToggleBtn"><i class="fa-solid fa-gear"></i></button>
        <div class="controls" id="controlsPanel">
            <div class="control-group">
                <button id="saveDraftBtn" title="下書き保存">
                    <i class="fas fa-save"></i> 下書き保存
                </button>
                <button id="saveServerBtn" title="サーバー保存">
                    <i class="fas fa-cloud-upload-alt"></i> サーバ保存
                </button>
            </div>
        </div>
    </div>

    <script src="js/script.js"></script>
</body>
</html>
```

### 2. CSS3 モダン設計

#### **レスポンシブレイアウト**
```css
/* グリッドベースレイアウト */
body {
    display: flex;
    font-family: 'Inter', sans-serif;
    margin: 0;
    height: 100vh;
    background-color: #f5f5f5;
    overflow: hidden;
}

/* フレックスボックスによるレスポンシブ設計 */
.grid-floor {
    flex: 1;
    padding: 60px 20px 20px;
    overflow: auto;
    position: relative;
}

.side-panel-wrapper {
    width: 300px;
    min-width: 250px;
    max-width: 400px;
    background-color: white;
    border-right: 1px solid #e0e0e0;
    display: flex;
    flex-direction: column;
    resize: horizontal;
    overflow: hidden;
}

/* 座席グリッド表示 */
.section-islands {
    display: grid;
    grid-template-columns: repeat(11, 1fr);
    gap: 10px;
    margin: 20px 0;
    padding: 0 20px;
}

.grid-island {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    gap: 2px;
    border: 1px solid #ddd;
    border-radius: 4px;
    background-color: white;
    min-height: 80px;
    padding: 4px;
}
```

#### **ドラッグ&ドロップスタイル**
```css
/* ドラッグ可能要素のスタイル */
.draggable-employee {
    cursor: grab;
    border: 2px solid transparent;
    border-radius: 4px;
    padding: 8px;
    margin: 4px 0;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    transition: all 0.3s ease;
    user-select: none;
}

.draggable-employee:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.draggable-employee.dragging {
    opacity: 0.7;
    transform: rotate(5deg);
    cursor: grabbing;
    z-index: 1000;
}

/* ドロップゾーンのスタイル */
.seat {
    border: 2px dashed #ddd;
    border-radius: 4px;
    min-height: 35px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    text-align: center;
    background-color: #fafafa;
    transition: all 0.3s ease;
    position: relative;
}

.seat.drag-over {
    border-color: #4CAF50;
    background-color: #e8f5e8;
    transform: scale(1.05);
}

.seat.occupied {
    border: 2px solid #2196F3;
    background-color: #e3f2fd;
    color: #1976d2;
    font-weight: bold;
}

.seat.merged {
    border: 3px solid #FF9800;
    background-color: #fff3e0;
}
```

#### **部署別カラーリング**
```css
/* 動的部署カラー */
.dept-systems { background-color: #FF6B6B; }
.dept-marketing { background-color: #4ECDC4; }
.dept-sales { background-color: #45B7D1; }
.dept-admin { background-color: #96CEB4; }

/* カラーパレット変数 */
:root {
    --primary-color: #2196F3;
    --secondary-color: #FFC107;
    --success-color: #4CAF50;
    --warning-color: #FF9800;
    --error-color: #F44336;
    --info-color: #00BCD4;
    
    --background-light: #fafafa;
    --background-dark: #f5f5f5;
    --text-primary: #212121;
    --text-secondary: #757575;
    --border-color: #e0e0e0;
}
```

### 3. JavaScript ES6+ 実装

#### **モジュラー状態管理**
```javascript
// グローバル状態管理
class StateManager {
    constructor() {
        this.state = {
            // フロア関連
            currentFloorId: '3F',
            allFloorData: {},
            
            // 座席データ
            seatMap: [],
            mergedSeats: [],
            memoData: {},
            departmentZoneSettings: { topRow: [], bottomRow: [] },
            
            // 社員データ
            cardDB: {},
            teamColorDefaults: {},
            departmentColorDefaults: {},
            
            // UI状態
            currentAppMode: 'view', // 'view' または 'admin'
            selectedEmpNo: null,
            selectedCell: null,
            mergeMode: false,
            
            // バージョン管理
            currentLayoutVersion: null
        };
        
        // 状態変更リスナー
        this.listeners = new Map();
    }
    
    // 状態更新
    setState(key, value) {
        const oldValue = this.state[key];
        this.state[key] = value;
        
        // リスナーに通知
        if (this.listeners.has(key)) {
            this.listeners.get(key).forEach(listener => {
                listener(value, oldValue);
            });
        }
    }
    
    // 状態取得
    getState(key) {
        return this.state[key];
    }
    
    // リスナー登録
    subscribe(key, listener) {
        if (!this.listeners.has(key)) {
            this.listeners.set(key, []);
        }
        this.listeners.get(key).push(listener);
    }
    
    // フロア切り替え
    switchFloor(floorId) {
        if (this.state.allFloorData[floorId]) {
            // 現在フロアデータ保存
            this.saveCurrentFloorData();
            
            // 新フロアデータ読み込み
            this.setState('currentFloorId', floorId);
            this.loadFloorData(floorId);
            
            // UI更新通知
            this.notifyFloorChange(floorId);
        }
    }
    
    saveCurrentFloorData() {
        const currentFloor = this.state.currentFloorId;
        this.state.allFloorData[currentFloor] = {
            seatMap: [...this.state.seatMap],
            mergedSeats: [...this.state.mergedSeats],
            memoData: { ...this.state.memoData },
            departmentZones: { ...this.state.departmentZoneSettings }
        };
    }
    
    loadFloorData(floorId) {
        const floorData = this.state.allFloorData[floorId];
        if (floorData) {
            this.setState('seatMap', floorData.seatMap);
            this.setState('mergedSeats', floorData.mergedSeats);
            this.setState('memoData', floorData.memoData);
            this.setState('departmentZoneSettings', floorData.departmentZones);
        }
    }
}

// グローバルインスタンス
const stateManager = new StateManager();
```

#### **ドラッグ&ドロップシステム**
```javascript
// HTML5 Drag and Drop API実装
class DragDropManager {
    constructor() {
        this.draggedEmployeeInfo = null;
        this.draggedElement = null;
        this.isDragging = false;
        
        this.initializeEventListeners();
    }
    
    initializeEventListeners() {
        // ドラッグ開始
        document.addEventListener('dragstart', this.handleDragStart.bind(this));
        
        // ドロップゾーン
        document.addEventListener('dragover', this.handleDragOver.bind(this));
        document.addEventListener('drop', this.handleDrop.bind(this));
        document.addEventListener('dragenter', this.handleDragEnter.bind(this));
        document.addEventListener('dragleave', this.handleDragLeave.bind(this));
        
        // ドラッグ終了
        document.addEventListener('dragend', this.handleDragEnd.bind(this));
    }
    
    handleDragStart(event) {
        const element = event.target;
        
        if (element.classList.contains('draggable-employee')) {
            const empNo = element.dataset.empno;
            
            this.draggedEmployeeInfo = {
                empNo: empNo,
                origin: element.dataset.origin || 'unassigned'
            };
            
            this.draggedElement = element;
            this.isDragging = true;
            
            // ドラッグ中のスタイル適用
            element.classList.add('dragging');
            
            // ドラッグ効果設定
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', empNo);
            
            // カスタムドラッグイメージ（オプション）
            this.setCustomDragImage(event, element);
        }
    }
    
    handleDragOver(event) {
        const dropTarget = this.getDropTarget(event.target);
        
        if (dropTarget && this.isValidDropTarget(dropTarget)) {
            event.preventDefault(); // ドロップ許可
            event.dataTransfer.dropEffect = 'move';
            
            // ビジュアルフィードバック
            dropTarget.classList.add('drag-over');
        }
    }
    
    handleDragEnter(event) {
        const dropTarget = this.getDropTarget(event.target);
        
        if (dropTarget && this.isValidDropTarget(dropTarget)) {
            dropTarget.classList.add('drag-over');
        }
    }
    
    handleDragLeave(event) {
        const dropTarget = this.getDropTarget(event.target);
        
        if (dropTarget && !dropTarget.contains(event.relatedTarget)) {
            dropTarget.classList.remove('drag-over');
        }
    }
    
    handleDrop(event) {
        event.preventDefault();
        
        const dropTarget = this.getDropTarget(event.target);
        
        if (dropTarget && this.isValidDropTarget(dropTarget)) {
            // ドロップ実行
            this.executeDrop(dropTarget);
            
            // ビジュアルフィードバック削除
            dropTarget.classList.remove('drag-over');
        }
        
        this.cleanup();
    }
    
    handleDragEnd(event) {
        // ドラッグ状態クリーンアップ
        if (this.draggedElement) {
            this.draggedElement.classList.remove('dragging');
        }
        
        // 全ドロップゾーンのハイライト削除
        document.querySelectorAll('.drag-over').forEach(el => {
            el.classList.remove('drag-over');
        });
        
        this.cleanup();
    }
    
    getDropTarget(element) {
        // 座席要素を検索
        return element.closest('.seat') || element.closest('.employee-list-content');
    }
    
    isValidDropTarget(dropTarget) {
        if (!this.draggedEmployeeInfo) return false;
        
        // 管理モードでのみドロップ可能
        if (stateManager.getState('currentAppMode') !== 'admin') {
            return false;
        }
        
        // 座席へのドロップ
        if (dropTarget.classList.contains('seat')) {
            return !dropTarget.classList.contains('occupied') || 
                   dropTarget.dataset.empno === this.draggedEmployeeInfo.empNo;
        }
        
        // 社員リストへのドロップ
        if (dropTarget.classList.contains('employee-list-content')) {
            return this.draggedEmployeeInfo.origin !== 'unassigned';
        }
        
        return false;
    }
    
    executeDrop(dropTarget) {
        const { empNo, origin } = this.draggedEmployeeInfo;
        
        if (dropTarget.classList.contains('seat')) {
            // 座席への配置
            this.assignEmployeeToSeat(empNo, dropTarget);
        } else if (dropTarget.classList.contains('employee-list-content')) {
            // 社員リストへの戻し
            this.removeEmployeeFromSeat(empNo, origin);
        }
        
        // UI更新
        this.updateDisplay();
        
        // 成功フィードバック
        this.showDropFeedback('success');
    }
    
    assignEmployeeToSeat(empNo, seatElement) {
        const seatInfo = this.parseSeatElement(seatElement);
        const { island, row, col } = seatInfo;
        
        // 既存配置の削除
        this.removeEmployeeFromCurrentSeat(empNo);
        
        // 新座席への配置
        const seatMap = stateManager.getState('seatMap');
        if (seatMap[island] && seatMap[island][row]) {
            seatMap[island][row][col] = empNo;
            stateManager.setState('seatMap', seatMap);
            
            // アンドゥ用コマンド記録
            this.recordCommand(new SeatAssignmentCommand(empNo, island, row, col));
        }
    }
    
    parseSeatElement(seatElement) {
        const seatId = seatElement.id; // 例: "seat-0-1-1"
        const parts = seatId.split('-');
        return {
            island: parseInt(parts[1]),
            row: parseInt(parts[2]),
            col: parseInt(parts[3])
        };
    }
    
    setCustomDragImage(event, element) {
        // カスタムドラッグイメージ作成
        const dragImage = element.cloneNode(true);
        dragImage.style.transform = 'rotate(5deg)';
        dragImage.style.opacity = '0.8';
        dragImage.style.position = 'absolute';
        dragImage.style.top = '-1000px';
        
        document.body.appendChild(dragImage);
        event.dataTransfer.setDragImage(dragImage, 50, 25);
        
        // 即座に削除
        setTimeout(() => document.body.removeChild(dragImage), 0);
    }
    
    cleanup() {
        this.draggedEmployeeInfo = null;
        this.draggedElement = null;
        this.isDragging = false;
    }
}

// ドラッグ&ドロップマネージャー初期化
const dragDropManager = new DragDropManager();
```

#### **API通信管理**
```javascript
// 非同期API通信クライアント
class APIClient {
    constructor(baseURL = '') {
        this.baseURL = baseURL;
        this.defaultHeaders = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
    }
    
    async get(endpoint) {
        try {
            const response = await fetch(`${this.baseURL}${endpoint}`, {
                method: 'GET',
                headers: this.defaultHeaders
            });
            
            return await this.handleResponse(response);
        } catch (error) {
            throw new APIError(`GET ${endpoint} failed: ${error.message}`);
        }
    }
    
    async post(endpoint, data) {
        try {
            const response = await fetch(`${this.baseURL}${endpoint}`, {
                method: 'POST',
                headers: this.defaultHeaders,
                body: JSON.stringify(data)
            });
            
            return await this.handleResponse(response);
        } catch (error) {
            throw new APIError(`POST ${endpoint} failed: ${error.message}`);
        }
    }
    
    async handleResponse(response) {
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            
            if (response.status === 409) {
                throw new ConflictError('Data conflict detected', error);
            }
            
            throw new APIError(`HTTP ${response.status}: ${error.message || response.statusText}`);
        }
        
        return await response.json();
    }
    
    // マスターデータ取得
    async getInitialData() {
        return await this.get('/api/initial-data');
    }
    
    // マスターデータ更新
    async saveInitialData(data) {
        return await this.post('/api/initial-data', data);
    }
    
    // レイアウトデータ取得
    async getLayoutData() {
        return await this.get('/api/layouts/default');
    }
    
    // レイアウトデータ更新（バージョン管理付き）
    async saveLayoutData(data) {
        return await this.post('/api/layouts/default', data);
    }
    
    // データエクスポート
    async downloadData() {
        const response = await fetch('/api/download-initial-data');
        const blob = await response.blob();
        
        // ダウンロード実行
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = response.headers.get('Content-Disposition')
            .split('filename=')[1].replace(/"/g, '');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }
}

// エラークラス
class APIError extends Error {
    constructor(message, status = null) {
        super(message);
        this.name = 'APIError';
        this.status = status;
    }
}

class ConflictError extends Error {
    constructor(message, details = {}) {
        super(message);
        this.name = 'ConflictError';
        this.details = details;
    }
}

// APIクライアント初期化
const apiClient = new APIClient();
```

#### **ローカルストレージ管理**
```javascript
// ブラウザストレージ管理
class StorageManager {
    constructor() {
        this.PREFIX = 'office-layout-';
        this.KEYS = {
            DRAFT_LAYOUT: 'seating-layout-draft-multi-floor-zones-v1',
            USER_SETTINGS: 'user-settings-v1',
            VIEW_STATE: 'view-state-v1'
        };
    }
    
    // 下書き保存
    saveDraft(data) {
        try {
            const draftData = {
                timestamp: new Date().toISOString(),
                version: stateManager.getState('currentLayoutVersion'),
                floorData: data,
                metadata: {
                    currentFloor: stateManager.getState('currentFloorId'),
                    mode: stateManager.getState('currentAppMode')
                }
            };
            
            localStorage.setItem(
                this.PREFIX + this.KEYS.DRAFT_LAYOUT, 
                JSON.stringify(draftData)
            );
            
            return true;
        } catch (error) {
            console.error('Draft save failed:', error);
            return false;
        }
    }
    
    // 下書き読み込み
    loadDraft() {
        try {
            const draftJson = localStorage.getItem(this.PREFIX + this.KEYS.DRAFT_LAYOUT);
            
            if (draftJson) {
                const draftData = JSON.parse(draftJson);
                
                // データ形式確認
                if (draftData.floorData && draftData.timestamp) {
                    return draftData;
                }
            }
            
            return null;
        } catch (error) {
            console.error('Draft load failed:', error);
            return null;
        }
    }
    
    // 下書き削除
    clearDraft() {
        localStorage.removeItem(this.PREFIX + this.KEYS.DRAFT_LAYOUT);
    }
    
    // ユーザー設定保存
    saveUserSettings(settings) {
        try {
            localStorage.setItem(
                this.PREFIX + this.KEYS.USER_SETTINGS,
                JSON.stringify(settings)
            );
        } catch (error) {
            console.error('User settings save failed:', error);
        }
    }
    
    // ユーザー設定読み込み
    loadUserSettings() {
        try {
            const settingsJson = localStorage.getItem(this.PREFIX + this.KEYS.USER_SETTINGS);
            return settingsJson ? JSON.parse(settingsJson) : {};
        } catch (error) {
            console.error('User settings load failed:', error);
            return {};
        }
    }
    
    // ビューステート保存
    saveViewState(state) {
        try {
            const viewState = {
                currentFloor: state.currentFloorId,
                panelVisible: state.panelVisible,
                filterSettings: state.filterSettings,
                timestamp: new Date().toISOString()
            };
            
            localStorage.setItem(
                this.PREFIX + this.KEYS.VIEW_STATE,
                JSON.stringify(viewState)
            );
        } catch (error) {
            console.error('View state save failed:', error);
        }
    }
    
    // ストレージ使用量確認
    getStorageUsage() {
        let totalSize = 0;
        
        for (let key in localStorage) {
            if (key.startsWith(this.PREFIX)) {
                totalSize += localStorage[key].length;
            }
        }
        
        return {
            usedBytes: totalSize,
            usedKB: (totalSize / 1024).toFixed(2),
            items: Object.keys(localStorage).filter(k => k.startsWith(this.PREFIX)).length
        };
    }
    
    // ストレージクリーンアップ
    cleanup() {
        const usage = this.getStorageUsage();
        
        // 5MB以上の場合、古いデータを削除
        if (usage.usedBytes > 5 * 1024 * 1024) {
            this.clearDraft();
            console.log('Storage cleanup performed');
        }
    }
}

// ストレージマネージャー初期化
const storageManager = new StorageManager();
```

## UI コンポーネント設計

### モーダルシステム

#### **汎用モーダルクラス**
```javascript
class ModalManager {
    constructor() {
        this.activeModals = new Set();
        this.initializeEventListeners();
    }
    
    initializeEventListeners() {
        // ESCキーでモーダル閉じる
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.activeModals.size > 0) {
                this.closeTopModal();
            }
        });
        
        // クリックアウトサイドで閉じる
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.closeModal(e.target.id);
            }
        });
    }
    
    openModal(modalId, data = {}) {
        const modal = document.getElementById(modalId);
        if (!modal) return false;
        
        // モーダル表示
        modal.style.display = 'block';
        this.activeModals.add(modalId);
        
        // データ設定
        if (data) {
            this.populateModalData(modalId, data);
        }
        
        // フォーカス管理
        this.manageFocus(modal);
        
        // アニメーション
        requestAnimationFrame(() => {
            modal.classList.add('show');
        });
        
        return true;
    }
    
    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return false;
        
        // アニメーション
        modal.classList.remove('show');
        
        setTimeout(() => {
            modal.style.display = 'none';
            this.activeModals.delete(modalId);
        }, 300);
        
        return true;
    }
    
    closeTopModal() {
        if (this.activeModals.size > 0) {
            const topModal = Array.from(this.activeModals).pop();
            this.closeModal(topModal);
        }
    }
    
    populateModalData(modalId, data) {
        const modal = document.getElementById(modalId);
        
        // データバインディング
        for (const [key, value] of Object.entries(data)) {
            const element = modal.querySelector(`[data-field="${key}"]`);
            if (element) {
                if (element.tagName === 'INPUT') {
                    element.value = value;
                } else {
                    element.textContent = value;
                }
            }
        }
    }
    
    manageFocus(modal) {
        // 最初のフォーカス可能要素にフォーカス
        const focusableElements = modal.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        
        if (focusableElements.length > 0) {
            focusableElements[0].focus();
        }
    }
}

const modalManager = new ModalManager();
```

### フィードバックシステム

#### **ユーザーフィードバック**
```javascript
class FeedbackManager {
    constructor() {
        this.container = this.createFeedbackContainer();
        this.activeNotifications = new Map();
    }
    
    createFeedbackContainer() {
        const container = document.createElement('div');
        container.id = 'feedbackContainer';
        container.className = 'feedback-container';
        document.body.appendChild(container);
        return container;
    }
    
    show(message, type = 'info', duration = 3000) {
        const id = this.generateId();
        const notification = this.createNotification(id, message, type);
        
        // 表示
        this.container.appendChild(notification);
        this.activeNotifications.set(id, notification);
        
        // アニメーション
        requestAnimationFrame(() => {
            notification.classList.add('show');
        });
        
        // 自動削除
        if (duration > 0) {
            setTimeout(() => {
                this.hide(id);
            }, duration);
        }
        
        return id;
    }
    
    createNotification(id, message, type) {
        const notification = document.createElement('div');
        notification.className = `feedback-notification feedback-${type}`;
        notification.dataset.id = id;
        
        notification.innerHTML = `
            <div class="feedback-content">
                <i class="fas ${this.getIcon(type)}"></i>
                <span class="feedback-message">${message}</span>
                <button class="feedback-close" onclick="feedbackManager.hide('${id}')">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        return notification;
    }
    
    getIcon(type) {
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };
        return icons[type] || icons.info;
    }
    
    hide(id) {
        const notification = this.activeNotifications.get(id);
        if (notification) {
            notification.classList.remove('show');
            notification.classList.add('hide');
            
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
                this.activeNotifications.delete(id);
            }, 300);
        }
    }
    
    clear() {
        this.activeNotifications.forEach((notification, id) => {
            this.hide(id);
        });
    }
    
    generateId() {
        return 'feedback_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
}

const feedbackManager = new FeedbackManager();
```

## アクセシビリティ実装

### WAI-ARIA 対応

#### **キーボードナビゲーション**
```javascript
class AccessibilityManager {
    constructor() {
        this.initializeKeyboardNavigation();
        this.initializeScreenReaderSupport();
    }
    
    initializeKeyboardNavigation() {
        // Tabキーナビゲーション
        document.addEventListener('keydown', (e) => {
            switch (e.key) {
                case 'Tab':
                    this.handleTabNavigation(e);
                    break;
                case 'Enter':
                case ' ':
                    this.handleActivation(e);
                    break;
                case 'Escape':
                    this.handleEscape(e);
                    break;
                case 'ArrowUp':
                case 'ArrowDown':
                case 'ArrowLeft':
                case 'ArrowRight':
                    this.handleArrowNavigation(e);
                    break;
            }
        });
    }
    
    initializeScreenReaderSupport() {
        // 動的コンテンツのアナウンス
        const announcer = document.createElement('div');
        announcer.id = 'sr-announcer';
        announcer.setAttribute('aria-live', 'polite');
        announcer.setAttribute('aria-atomic', 'true');
        announcer.style.position = 'absolute';
        announcer.style.left = '-10000px';
        announcer.style.width = '1px';
        announcer.style.height = '1px';
        announcer.style.overflow = 'hidden';
        document.body.appendChild(announcer);
        
        this.announcer = announcer;
    }
    
    announce(message, priority = 'polite') {
        this.announcer.setAttribute('aria-live', priority);
        this.announcer.textContent = message;
        
        // 短時間後にクリア
        setTimeout(() => {
            this.announcer.textContent = '';
        }, 1000);
    }
    
    handleTabNavigation(event) {
        const focusableElements = document.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        
        const currentIndex = Array.from(focusableElements).indexOf(document.activeElement);
        
        if (event.shiftKey) {
            // Shift+Tab: 前の要素
            if (currentIndex <= 0) {
                event.preventDefault();
                focusableElements[focusableElements.length - 1].focus();
            }
        } else {
            // Tab: 次の要素
            if (currentIndex >= focusableElements.length - 1) {
                event.preventDefault();
                focusableElements[0].focus();
            }
        }
    }
    
    handleActivation(event) {
        const element = event.target;
        
        // カスタム要素の処理
        if (element.classList.contains('draggable-employee') && element.getAttribute('role') === 'button') {
            event.preventDefault();
            this.simulateClick(element);
        }
    }
    
    simulateClick(element) {
        const clickEvent = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
        });
        element.dispatchEvent(clickEvent);
    }
    
    // 座席要素にARIA属性設定
    setSeatAccessibility(seatElement, empNo = null) {
        if (empNo) {
            const employee = stateManager.getState('cardDB')[empNo];
            if (employee) {
                seatElement.setAttribute('aria-label', 
                    `座席: ${employee.name} (${employee.dept})`);
                seatElement.setAttribute('aria-describedby', 
                    `座席占有中 - ${employee.name}さんの席`);
            }
        } else {
            seatElement.setAttribute('aria-label', '空席');
            seatElement.setAttribute('aria-describedby', '利用可能な座席');
        }
        
        seatElement.setAttribute('role', 'gridcell');
        seatElement.setAttribute('tabindex', '0');
    }
}

const accessibilityManager = new AccessibilityManager();
```

## パフォーマンス最適化

### DOM操作最適化

#### **仮想化・遅延レンダリング**
```javascript
class PerformanceOptimizer {
    constructor() {
        this.renderQueue = [];
        this.isRendering = false;
        this.animationId = null;
    }
    
    // バッチレンダリング
    scheduleRender(renderFunction) {
        this.renderQueue.push(renderFunction);
        
        if (!this.isRendering) {
            this.isRendering = true;
            this.animationId = requestAnimationFrame(() => {
                this.flushRenderQueue();
            });
        }
    }
    
    flushRenderQueue() {
        const fragment = document.createDocumentFragment();
        
        // 一括DOM操作
        while (this.renderQueue.length > 0) {
            const renderFn = this.renderQueue.shift();
            try {
                renderFn(fragment);
            } catch (error) {
                console.error('Render function failed:', error);
            }
        }
        
        // 一度にDOMに追加
        if (fragment.children.length > 0) {
            const container = document.getElementById('employeeListContent');
            container.appendChild(fragment);
        }
        
        this.isRendering = false;
    }
    
    // 効率的な要素更新
    updateElementEfficiently(element, changes) {
        // バッチ操作でレイアウトスラッシングを防ぐ
        const computedStyle = window.getComputedStyle(element);
        const currentDisplay = computedStyle.display;
        
        // 一時的に非表示（リフロー防止）
        element.style.display = 'none';
        
        // 変更適用
        for (const [property, value] of Object.entries(changes)) {
            if (property === 'textContent') {
                element.textContent = value;
            } else if (property === 'innerHTML') {
                element.innerHTML = value;
            } else if (property === 'className') {
                element.className = value;
            } else {
                element.style[property] = value;
            }
        }
        
        // 表示復元
        element.style.display = currentDisplay;
    }
    
    // 遅延画像読み込み
    lazyLoadImages(container) {
        const images = container.querySelectorAll('img[data-src]');
        
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    img.src = img.dataset.src;
                    img.removeAttribute('data-src');
                    observer.unobserve(img);
                }
            });
        });
        
        images.forEach(img => imageObserver.observe(img));
    }
    
    // メモリリーク防止
    cleanup() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        this.renderQueue = [];
        this.isRendering = false;
    }
}

const performanceOptimizer = new PerformanceOptimizer();
```

## 印刷対応

### 印刷最適化CSS

#### **メディアクエリ対応**
```css
/* 印刷専用スタイル */
@media print {
    /* 不要要素非表示 */
    .side-panel-wrapper,
    .controls-wrapper,
    #topRightControlsContainer,
    #floorDisplayContainer {
        display: none !important;
    }
    
    /* 印刷ヘッダー表示 */
    #printFloorHeader {
        display: block !important;
        font-size: 18px;
        font-weight: bold;
        text-align: center;
        margin-bottom: 20px;
        border-bottom: 2px solid #333;
        padding-bottom: 10px;
    }
    
    /* レイアウト調整 */
    .grid-floor {
        width: 100% !important;
        padding: 0 !important;
        margin: 0 !important;
        overflow: visible !important;
    }
    
    /* 座席グリッド最適化 */
    .section-islands {
        grid-template-columns: repeat(11, 1fr) !important;
        gap: 2px !important;
        margin: 10px 0 !important;
        page-break-inside: avoid;
    }
    
    .grid-island {
        border: 1px solid #333 !important;
        min-height: 60px !important;
        font-size: 10px !important;
    }
    
    .seat {
        border: 1px solid #666 !important;
        font-size: 9px !important;
        min-height: 25px !important;
    }
    
    /* カラー調整（印刷用） */
    .seat.occupied {
        background-color: #f0f0f0 !important;
        border: 2px solid #333 !important;
    }
    
    /* フォント調整 */
    body {
        font-size: 12px !important;
        line-height: 1.3 !important;
        color: #000 !important;
        background: white !important;
    }
}

/* A4印刷レイアウト */
@media print and (max-width: 210mm) {
    .section-islands {
        grid-template-columns: repeat(6, 1fr) !important;
    }
    
    .grid-island {
        min-height: 50px !important;
        font-size: 8px !important;
    }
}

/* A3印刷レイアウト */
@media print and (min-width: 297mm) {
    .section-islands {
        grid-template-columns: repeat(11, 1fr) !important;
    }
    
    .grid-island {
        min-height: 70px !important;
        font-size: 11px !important;
    }
}
```

#### **印刷用JavaScript**
```javascript
class PrintManager {
    constructor() {
        this.originalTitle = document.title;
    }
    
    preparePrint(format = 'A4') {
        // 印刷用タイトル設定
        const currentFloor = stateManager.getState('currentFloorId');
        const timestamp = new Date().toLocaleDateString('ja-JP');
        
        document.title = `座席表_${currentFloor}_${timestamp}`;
        
        // 印刷ヘッダー設定
        const printHeader = document.getElementById('printFloorHeader');
        if (printHeader) {
            printHeader.innerHTML = `
                <h1>オフィス座席表 - ${currentFloor}</h1>
                <p>作成日: ${timestamp}</p>
            `;
        }
        
        // 印刷用CSS適用
        this.applyPrintStyles(format);
        
        // 印刷実行
        setTimeout(() => {
            window.print();
            this.restoreAfterPrint();
        }, 500);
    }
    
    applyPrintStyles(format) {
        // 動的スタイル追加
        const printStyles = document.createElement('style');
        printStyles.id = 'dynamic-print-styles';
        
        if (format === 'A4') {
            printStyles.textContent = `
                @media print {
                    .section-islands { 
                        grid-template-columns: repeat(6, 1fr) !important; 
                        transform: scale(0.8);
                        transform-origin: top left;
                    }
                }
            `;
        } else if (format === 'A3') {
            printStyles.textContent = `
                @media print {
                    .section-islands { 
                        grid-template-columns: repeat(11, 1fr) !important; 
                        transform: scale(1.0);
                    }
                }
            `;
        }
        
        document.head.appendChild(printStyles);
    }
    
    restoreAfterPrint() {
        // タイトル復元
        document.title = this.originalTitle;
        
        // 動的スタイル削除
        const dynamicStyles = document.getElementById('dynamic-print-styles');
        if (dynamicStyles) {
            dynamicStyles.remove();
        }
    }
}

const printManager = new PrintManager();
```

---

このフロントエンド技術仕様は、**モダンWebスタンダード**を活用し、フレームワークに依存しない効率的で保守しやすいユーザーインターフェースアーキテクチャを実現しています。