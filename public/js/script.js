document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log('=== Starting script execution ===');
        // --- 定数定義 ---
    const rows = 4, cols = 2;
    const totalIslands = 22;
    const islandsPerRow = 11;
    const seatsPerIslandRow = cols;
    const seatsPerRow = islandsPerRow * seatsPerIslandRow; // 11島 * 2席/島 = 22席
    const numTopSideCabinets = 9;
    const numBottomSideCabinets = 7;
    const numNewTopCabinets = 6;
    const floorIds = ['3F', '4F']; // 利用可能なフロアID
    let currentFloorId = floorIds[0]; // デフォルトフロア
    let currentEditingRowType = 'topRow'; // 部署範囲設定モーダル用

    // --- グローバル変数 ---
    let allFloorData = {}; // 全フロアのレイアウトデータ { '3F': { seatMap, mergedSeats, memoData, departmentZones }, '4F': ... }
    let seatMap = []; // 現在のフロアの座席状況
    let mergedSeats = []; // 現在のフロアの結合された席の情報
    let memoData = {}; // 現在のフロアのメモ情報
    let departmentZoneSettings = { topRow: [], bottomRow: [] }; // 現在のフロアの部署範囲設定

    let cardDB = {}; // 社員情報 (サーバから読み込む)
    let teamColorDefaults = {}; // チームカラー (サーバから読み込む)
    let departmentColorDefaults = {}; // 部署カラー (サーバから読み込む)

    const LS_KEY_DRAFT_LAYOUT = 'seating-layout-draft-multi-floor-zones-v1'; // 下書き保存用キー
    let currentAppMode = 'view'; // 'view' または 'admin'
    let currentLayoutVersion = null; // サーバから取得したレイアウトのバージョン

    let selectedEmpNo = null, selectedCell = null, mergeMode = false;
    let tempDepartmentZones = { topRow: [], bottomRow: [] }; // 部署範囲設定モーダル用の一時データ
    let loadedMasterData = null; // ファイルから読み込んだマスターデータの一時保管場所

    // ドラッグ中の社員情報を保持する変数
    let draggedEmployeeInfo = null; // { empNo: '社員番号', origin: 'unassigned' または 'seat-{isl}-{r}-{c}' }
    let draggedElement = null; // ドラッグ中のDOM要素そのもの
    let isDragging = false; // ドラッグ操作中かどうかのフラグ
    let mousedownOnDraggable = null; // mousedownされたドラッグ可能要素を一時保持

    // --- セキュリティ関数 ---
    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') {
            return String(unsafe || '');
        }
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function createSafeTextElement(tagName, text, className = null) {
        const element = document.createElement(tagName);
        element.textContent = text || '';
        if (className) {
            element.className = className;
        }
        return element;
    }

    // --- DOM要素取得 ---
    console.log('=== Starting DOM element retrieval ===');
    const feedbackMessageDiv = document.getElementById('feedbackMessage');
    const currentFloorNameDisplay = document.getElementById('currentFloorName');
    const switchFloorButton = document.getElementById('switchFloorButton');
    const sidePanelWrapper = document.querySelector('.side-panel-wrapper');
    const employeeListPanel = document.getElementById('employeeList');
    const departmentFilterSelect = document.getElementById('departmentFilter');
    const resetFilterBtn = document.getElementById('resetFilterBtn');
    const jsonInput = document.getElementById('jsonInput'); // 社員情報JSONアップロード用
    const topCabinetDiv = document.getElementById('topCabinet');
    const sideCabinetsContainer = document.getElementById('sideCabinetsContainer');
    const toggleHelpBtn = document.getElementById('toggleHelpBtn');
    const downloadMasterDataBtn = document.getElementById('downloadMasterDataBtn');

    // コントロールパネル関連
    const controlsToggleBtn = document.getElementById('controlsToggleBtn');
    const controlsPanel = document.getElementById('controlsPanel');
    const toggleListBtn = document.getElementById('toggleListBtn');
    const deptZoneSettingsBtn = document.getElementById('deptZoneSettingsBtn');
    console.log('deptZoneSettingsBtn element:', deptZoneSettingsBtn);
    const mergeBtn = document.getElementById('mergeBtn');
    const upBtn = document.getElementById('upBtn');
    const leftBtn = document.getElementById('leftBtn');
    const downBtn = document.getElementById('downBtn');
    const rightBtn = document.getElementById('rightBtn');
    const saveDraftBtn = document.getElementById('saveDraftBtn');
    const loadDraftBtn = document.getElementById('loadDraftBtn');
    const saveServerBtn = document.getElementById('saveServerBtn');
    const loadServerBtn = document.getElementById('loadServerBtn');
    
    // ▼▼▼ 変更箇所 ▼▼▼
    // const refreshInitialDataBtn = document.getElementById('refreshInitialDataBtn'); // 削除
    // ▲▲▲ 変更箇所 ▲▲▲

    // モード切替ボタン
    const enterAdminModeBtn = document.getElementById('enterAdminModeBtn');
    console.log('enterAdminModeBtn element:', enterAdminModeBtn);
    const exitAdminModeBtn = document.getElementById('exitAdminModeBtn');
    console.log('exitAdminModeBtn element:', exitAdminModeBtn);
    console.log('=== DOM element retrieval completed ===');

    // 印刷設定関連
    const htmlElement = document.documentElement;
    const togglePrintControlsBtn = document.getElementById('togglePrintControlsBtn');
    const printControlsDiv = document.getElementById('printControls');
    const printA4SetupBtn = document.getElementById('printA4SetupBtn');
    const printA3SetupBtn = document.getElementById('printA3SetupBtn');
    const printFloorHeader = document.getElementById('printFloorHeader');

    // マスターデータ管理関連
    const toggleMasterControlsBtn = document.getElementById('toggleMasterControlsBtn');
    const masterControlsDiv = document.getElementById('masterControls');
    const masterJsonInput = document.getElementById('masterJsonInput');
    const selectedFileNameSpan = document.getElementById('selectedFileName');
    const loadMasterJsonBtn = document.getElementById('loadMasterJsonBtn');
    const saveMasterJsonBtn = document.getElementById('saveMasterJsonBtn');
    const reloadMasterDataBtn = document.getElementById('reloadMasterDataBtn');

    // 部署範囲設定モーダル関連
    const deptZoneModal = document.getElementById('deptZoneModal');
    const closeDeptZoneModalBtn = document.getElementById('closeDeptZoneModalBtn');
    const modalCurrentFloorSpan = document.getElementById('modalCurrentFloor');
    const deptZoneNameSelect = document.getElementById('deptZoneName');
    const deptZoneStartInput = document.getElementById('deptZoneStart');
    const deptZoneEndInput = document.getElementById('deptZoneEnd');
    const deptZoneColorInput = document.getElementById('deptZoneColor');
    const addOrUpdateDeptZoneBtn = document.getElementById('addOrUpdateDeptZoneBtn');
    const currentDeptZonesList = document.getElementById('currentDeptZonesList');
    const saveDeptZoneSettingsBtn = document.getElementById('saveDeptZoneSettingsBtn');
    const cancelDeptZoneSettingsBtn = document.getElementById('cancelDeptZoneSettingsBtn');
    const editingZoneIndexInput = document.getElementById('editingZoneIndex');
    const currentEditingRowDisplay = document.getElementById('currentEditingRowDisplay');
    const editTopRowRadio = document.getElementById('editTopRowRadio');
    const editBottomRowRadio = document.getElementById('editBottomRowRadio');
    const maxSeatLabelSpans = document.querySelectorAll('.max-seat-label');


    // --- 初期化処理の順序 ---
    console.log('=== About to load initial server data ===');
    try {
        await loadInitialServerData(true); // isInitialLoad を true に
        console.log('=== Initial server data loaded successfully ===');
    } catch (error) {
        console.error("致命的エラー: 初期データのロードに失敗しました。", error);
        showFeedbackMessage("アプリケーションの起動に必要な基本データを読み込めませんでした。管理者に連絡してください。", true);
        return;
    }

    try {
        await loadLayoutFromServer(true);
    } catch (error) {
        console.error("レイアウトデータのロード中にエラーが発生しました:", error);
        showFeedbackMessage("保存されているレイアウトデータの読み込みに失敗しました。新しいレイアウトで開始します。", true);
        initializeAllFloorData();
        currentLayoutVersion = 0;
        switchFloor(currentFloorId, true);
    }

    console.log('=== About to setup event listeners ===');
    setupEventListeners();
    console.log('=== Event listeners setup completed ===');
    setAppMode('view'); // ★★★ 初期ロード完了後、確実に閲覧モードのUI状態にする ★★★
    
    // 初期状態でbodyクラスが正しく設定されているか確認
    console.log('Initial body class:', document.body.className);
    console.log('Initial app mode:', currentAppMode);


    // --- 関数定義 ---
    async function loadInitialServerData(isInitialLoad = false) {
        if (!isInitialLoad && !confirm("サーバーから最新の社員マスター情報を再読み込みします。よろしいですか？\n※現在の座席配置は維持されます。")) {
            return;
        }
        try {
            if (!isInitialLoad) showFeedbackMessage("社員マスター情報を再読み込み中...", false);
            const response = await fetch('/api/initial-data');
            if (!response.ok) {
                throw new Error(`サーバエラー (${response.status}): 初期データを取得できませんでした。`);
            }
            const data = await response.json();
            cardDB = data.employeeData || {};
            teamColorDefaults = data.teamColors || {};
            departmentColorDefaults = data.departmentColors || {};

            // 関連UIの更新
            populateDepartmentDropdown();
            populateDepartmentFilterDropdown();
            renderList(departmentFilterSelect ? departmentFilterSelect.value : "");
            renderFloor();

            if (!isInitialLoad) showFeedbackMessage("社員マスター情報を正常に再読み込みしました。", false);
            console.log("初期データをサーバから読み込み、UIを更新しました。");
        } catch (error) {
            console.error("初期データの読み込みに失敗しました:", error);
            showFeedbackMessage("サーバから基本データの読み込みに失敗しました。一部機能が正しく動作しない可能性があります。", true);
            throw error; // エラーを呼び出し元に伝える
        }
    }


    async function loadLayoutFromServer(isInitialLoad = false) {
        if (currentAppMode === 'view' && !isInitialLoad) {
            showFeedbackMessage("閲覧モードではサーバからレイアウトを再読み込みできません。", true);
            return;
        }
        if (!isInitialLoad && !confirm("現在の編集内容は破棄され、サーバから最新のレイアウトを読み込みます。よろしいですか？")) {
            return;
        }
        try {
            const response = await fetch('/api/layouts/default');
            if (!response.ok) {
                if (response.status === 404) {
                    showFeedbackMessage("サーバに保存されたレイアウトはありません。新規レイアウトで開始します。", false);
                    initializeAllFloorData();
                    currentLayoutVersion = 0;
                    switchFloor(currentFloorId, true);
                    return;
                }
                throw new Error(`サーバエラー (${response.status}): レイアウトを取得できませんでした。`);
            }
            const serverResponse = await response.json();
            currentLayoutVersion = serverResponse._version;
            allFloorData = serverResponse.layout || {};
            floorIds.forEach(id => {
                if (!allFloorData[id] || typeof allFloorData[id] !== 'object') {
                    allFloorData[id] = initializeNewFloorData();
                } else {
                    const fd = allFloorData[id];
                    allFloorData[id] = {
                        seatMap: (Array.isArray(fd.seatMap) && fd.seatMap.length === totalIslands) ? fd.seatMap : initializeNewFloorData().seatMap,
                        mergedSeats: Array.isArray(fd.mergedSeats) ? fd.mergedSeats : [],
                        memoData: (typeof fd.memoData === 'object' && fd.memoData !== null) ? fd.memoData : {},
                        departmentZones: (typeof fd.departmentZones === 'object' && fd.departmentZones !== null &&
                                          Array.isArray(fd.departmentZones.topRow) && Array.isArray(fd.departmentZones.bottomRow))
                                          ? fd.departmentZones : { topRow: [], bottomRow: [] }
                    };
                }
            });
            switchFloor(currentFloorId, true);
            showFeedbackMessage(`サーバからレイアウトを読み込みました (バージョン: ${currentLayoutVersion})`, false);
            console.log("レイアウトをサーバから読み込みました。");
        } catch (error) {
            console.error("サーバからのレイアウト読み込みに失敗しました:", error);
            showFeedbackMessage("サーバからのレイアウト読み込みに失敗しました。", true);
            throw error;
        }
    }

    async function saveLayoutToServer() {
        if (currentAppMode === 'view') {
            showFeedbackMessage("閲覧モードではサーバに保存できません。", true);
            return;
        }
        if (allFloorData[currentFloorId]) {
            allFloorData[currentFloorId] = {
                seatMap: JSON.parse(JSON.stringify(seatMap)),
                mergedSeats: JSON.parse(JSON.stringify(mergedSeats)),
                memoData: JSON.parse(JSON.stringify(memoData)),
                departmentZones: JSON.parse(JSON.stringify(departmentZoneSettings))
            };
        }
        const payload = {
            _version: currentLayoutVersion,
            layout: allFloorData
        };
        try {
            showFeedbackMessage("サーバに保存中...", false);
            const response = await fetch('/api/layouts/default', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (response.ok) {
                const result = await response.json();
                currentLayoutVersion = result._newVersion;
                showFeedbackMessage(`レイアウトをサーバに保存しました (新バージョン: ${currentLayoutVersion})`, false);
                console.log("レイアウトをサーバに保存しました。");
            } else if (response.status === 409) {
                showFeedbackMessage("競合が発生しました。最新のレイアウトを読み込みます。", true);
                await loadLayoutFromServer(true);
                alert("レイアウトが他のユーザーによって更新されました。最新版を読み込んだので、再度編集・保存してください。");
            } else {
                const errorData = await response.json().catch(() => ({ message: 'サーバからのエラー詳細不明' }));
                throw new Error(`サーバ保存エラー (${response.status}): ${errorData.message || response.statusText}`);
            }
        } catch (error) {
            console.error("サーバへのレイアウト保存に失敗しました:", error);
            showFeedbackMessage(`サーバへの保存に失敗しました: ${error.message}`, true);
        }
    }

    function saveDraftToLocal() {
        if (currentAppMode === 'view') {
            showFeedbackMessage("閲覧モードでは下書き保存できません。", true);
            return;
        }
        if (allFloorData[currentFloorId]) {
             allFloorData[currentFloorId] = {
                seatMap: JSON.parse(JSON.stringify(seatMap)),
                mergedSeats: JSON.parse(JSON.stringify(mergedSeats)),
                memoData: JSON.parse(JSON.stringify(memoData)),
                departmentZones: JSON.parse(JSON.stringify(departmentZoneSettings))
            };
        }
        try {
            localStorage.setItem(LS_KEY_DRAFT_LAYOUT, JSON.stringify(allFloorData));
            showFeedbackMessage(`現在の全フロアのレイアウトを下書きとして保存しました。`, false);
        } catch (e) {
            console.error("下書き保存エラー:", e);
            showFeedbackMessage("下書きの保存に失敗しました。ストレージ容量が不足している可能性があります。", true);
        }
    }

    function loadDraftFromLocal() {
        const msg = currentAppMode === 'view' ?
            '閲覧モードです。下書きを読み込むと現在の表示が上書きされます。よろしいですか？' :
            '現在の全てのフロアの編集内容は破棄され、保存された下書きから全フロアのレイアウトを読み込みます。よろしいですか？';
        if (!confirm(msg)) return;
        const storedData = localStorage.getItem(LS_KEY_DRAFT_LAYOUT);
        if (storedData) {
            try {
                const loadedDraftData = JSON.parse(storedData);
                allFloorData = loadedDraftData;
                floorIds.forEach(id => {
                    if (!allFloorData[id] || typeof allFloorData[id] !== 'object') {
                        allFloorData[id] = initializeNewFloorData();
                    } else {
                        const fd = allFloorData[id];
                        allFloorData[id] = {
                            seatMap: (Array.isArray(fd.seatMap) && fd.seatMap.length === totalIslands) ? fd.seatMap : initializeNewFloorData().seatMap,
                            mergedSeats: Array.isArray(fd.mergedSeats) ? fd.mergedSeats : [],
                            memoData: (typeof fd.memoData === 'object' && fd.memoData !== null) ? fd.memoData : {},
                            departmentZones: (typeof fd.departmentZones === 'object' && fd.departmentZones !== null &&
                                              Array.isArray(fd.departmentZones.topRow) && Array.isArray(fd.departmentZones.bottomRow))
                                              ? fd.departmentZones : { topRow: [], bottomRow: [] }
                        };
                    }
                });
                switchFloor(currentFloorId, true);
                showFeedbackMessage("下書きをローカルストレージから読み込みました。", false);
            } catch (e) {
                console.error("下書きデータのパースエラー:", e);
                showFeedbackMessage("下書きデータの読み込みに失敗しました。データが破損している可能性があります。", true);
            }
        } else {
            showFeedbackMessage("保存された下書きデータがありません。", false);
        }
    }

    function initializeNewFloorData() {
        return {
            seatMap: Array.from({ length: totalIslands }, () => Array.from({ length: rows }, () => Array(cols).fill(null))),
            mergedSeats: [],
            memoData: {},
            departmentZones: { topRow: [], bottomRow: [] }
        };
    }

    function initializeAllFloorData(loadedData = null) {
        const sourceData = loadedData || {};
        const newAllFloorData = {};
        floorIds.forEach(id => {
            const floorSpecificData = sourceData[id] || {};
            newAllFloorData[id] = {
                seatMap: (floorSpecificData.seatMap && Array.isArray(floorSpecificData.seatMap) && floorSpecificData.seatMap.length === totalIslands)
                    ? JSON.parse(JSON.stringify(floorSpecificData.seatMap))
                    : initializeNewFloorData().seatMap,
                mergedSeats: (floorSpecificData.mergedSeats && Array.isArray(floorSpecificData.mergedSeats))
                    ? JSON.parse(JSON.stringify(floorSpecificData.mergedSeats))
                    : [],
                memoData: (typeof floorSpecificData.memoData === 'object' && floorSpecificData.memoData !== null)
                    ? JSON.parse(JSON.stringify(floorSpecificData.memoData))
                    : {},
                departmentZones: (typeof floorSpecificData.departmentZones === 'object' && floorSpecificData.departmentZones !== null &&
                                  Array.isArray(floorSpecificData.departmentZones.topRow) && Array.isArray(floorSpecificData.departmentZones.bottomRow))
                    ? JSON.parse(JSON.stringify(floorSpecificData.departmentZones))
                    : { topRow: [], bottomRow: [] }
            };
        });
        allFloorData = newAllFloorData;
    }

    function switchFloor(newFloorId, isInitialOrDataLoad = false) {
        if (!floorIds.includes(newFloorId)) {
            console.error("無効なフロアID:", newFloorId);
            return;
        }
        if (!isInitialOrDataLoad && allFloorData[currentFloorId]) {
            allFloorData[currentFloorId] = {
                seatMap: JSON.parse(JSON.stringify(seatMap)),
                mergedSeats: JSON.parse(JSON.stringify(mergedSeats)),
                memoData: JSON.parse(JSON.stringify(memoData)),
                departmentZones: JSON.parse(JSON.stringify(departmentZoneSettings))
            };
        }
        currentFloorId = newFloorId;
        if (!allFloorData[currentFloorId]) {
            allFloorData[currentFloorId] = initializeNewFloorData();
        }
        const targetFloorData = allFloorData[currentFloorId];
        seatMap = JSON.parse(JSON.stringify(targetFloorData.seatMap));
        mergedSeats = JSON.parse(JSON.stringify(targetFloorData.mergedSeats));
        memoData = JSON.parse(JSON.stringify(targetFloorData.memoData));
        departmentZoneSettings = JSON.parse(JSON.stringify(targetFloorData.departmentZones));
        if (!Array.isArray(seatMap) || seatMap.length !== totalIslands ||
            !seatMap.every(island => Array.isArray(island) && island.length === rows &&
                island.every(row => Array.isArray(row) && row.length === cols))) {
            console.warn(`フロア ${currentFloorId} の seatMap データが不正です。初期化します。`);
            seatMap = initializeNewFloorData().seatMap;
            if(allFloorData[currentFloorId]) allFloorData[currentFloorId].seatMap = JSON.parse(JSON.stringify(seatMap));
        }
        renderFloor();
        renderDepartmentZoneHeaders();
        renderList(departmentFilterSelect ? departmentFilterSelect.value : "");
        updateFloorDisplayAndSwitcher();
        updatePrintHeader();
        document.body.style.backgroundColor = currentFloorId === '3F' ? '#FDFBF5' : currentFloorId === '4F' ? '#FFF0F0' : '#f5f5f5';
        if (!isInitialOrDataLoad) {
            showFeedbackMessage(`${currentFloorId} を表示しました。`, false);
        }
    }

    function updateFloorDisplayAndSwitcher() {
        if (currentFloorNameDisplay) currentFloorNameDisplay.textContent = `現在のフロア: ${currentFloorId}`;
        if (switchFloorButton) {
            const nextFloorIndex = (floorIds.indexOf(currentFloorId) + 1) % floorIds.length;
            const nextFloorId = floorIds[nextFloorIndex];
            switchFloorButton.textContent = `${nextFloorId}へ移動`;
            switchFloorButton.dataset.targetFloor = nextFloorId;
        }
    }

    function showFeedbackMessage(message, isError = false) {
        if (!feedbackMessageDiv) {
            alert(message);
            return;
        }
        feedbackMessageDiv.textContent = message;
        feedbackMessageDiv.style.backgroundColor = isError ? '#f44336' : '#4CAF50';
        feedbackMessageDiv.style.display = 'block';
        feedbackMessageDiv.style.opacity = '1';
        setTimeout(() => {
            feedbackMessageDiv.style.opacity = '0';
            setTimeout(() => {
                feedbackMessageDiv.style.display = 'none';
            }, 500);
        }, 3000);
    }

    function getUnassignedList() {
        const assignedAcrossAllFloors = new Set();
        floorIds.forEach(floorId => {
            const fd = allFloorData[floorId];
            if (fd && fd.seatMap) {
                fd.seatMap.flat(2).filter(empNo => empNo).forEach(empNo => assignedAcrossAllFloors.add(empNo));
            }
        });
        return Object.keys(cardDB).filter(empNo => !assignedAcrossAllFloors.has(empNo));
    }

    function renderList(filterDept = "") {
        if (!employeeListPanel) return;
        employeeListPanel.querySelectorAll('.employee-item').forEach(el => el.remove());
        let unassignedEmployees = getUnassignedList();
        if (filterDept) {
            unassignedEmployees = unassignedEmployees.filter(empNo => cardDB[empNo]?.dept === filterDept);
        }
        unassignedEmployees.forEach(empNo => {
            const info = cardDB[empNo];
            if (!info) return;
            const div = document.createElement('div');
            div.className = 'employee-item';
            div.dataset.empNo = empNo;
            const icon = document.createElement('i');
            icon.className = 'fas fa-user';
            div.appendChild(icon);
            const nameSpan = document.createElement('span');
            nameSpan.textContent = ` ${info.empNo} ${info.name} (${info.dept || '部署未定'}) (${info.team || 'チーム未定'})`;
            div.appendChild(nameSpan);
            const teamColor = teamColorDefaults[info.team] || teamColorDefaults['unknown_team'] || '#ffffff';
            div.style.backgroundColor = teamColor;

            if (currentAppMode === 'admin') {
                div.draggable = true;
                div.addEventListener('mousedown', handleMouseDownDraggable);
                div.addEventListener('dragstart', handleDragStartEmployeeItem);
                div.addEventListener('dragend', handleDragEnd);
            } else {
                div.draggable = false;
                div.removeEventListener('mousedown', handleMouseDownDraggable);
                div.removeEventListener('dragstart', handleDragStartEmployeeItem);
                div.removeEventListener('dragend', handleDragEnd);
            }

            div.onclick = () => {
                if (currentAppMode === 'admin' && !isDragging) {
                    selectEmployee(div, empNo);
                }
            };
            employeeListPanel.appendChild(div);
        });
        updateUIBasedOnMode();
    }

    function populateDepartmentFilterDropdown() {
        if (!departmentFilterSelect) return;
        const existingValue = departmentFilterSelect.value;
        
        // 安全な方法でオプションをクリア
        departmentFilterSelect.innerHTML = '';
        
        // デフォルトオプションを安全に追加
        const defaultOption = new Option('すべての部署', '');
        departmentFilterSelect.add(defaultOption);
        
        const depts = new Set(Object.values(cardDB).map(emp => emp?.dept).filter(Boolean));
        Array.from(depts).sort().forEach(dept => {
            // new Option()を使用することで自動的にエスケープされる
            departmentFilterSelect.add(new Option(dept, dept));
        });
        departmentFilterSelect.value = existingValue;
    }

    function selectEmployee(div, empNo) {
        if (currentAppMode === 'view' || isDragging) return;

        if (selectedEmpNo === empNo) {
            div.classList.remove('selected');
            selectedEmpNo = null;
        } else {
            employeeListPanel.querySelectorAll('.employee-item.selected').forEach(el => el.classList.remove('selected'));
            div.classList.add('selected');
            selectedEmpNo = empNo;
            if (selectedCell) {
                selectedCell.classList.remove('selected');
                selectedCell = null;
            }
        }
    }

    function toggleMerge(island, row, col) {
        if (currentAppMode === 'view' || col !== 0) return;
        const idx = mergedSeats.findIndex(ms => ms.island === island && ms.row === row && ms.col === col);
        if (idx >= 0) {
            mergedSeats.splice(idx, 1);
        } else {
            if (!mergedSeats.some(ms => ms.island === island && ms.row === row && ms.col === col + 1)) {
                 mergedSeats.push({ island, row, col });
            }
        }
        renderFloor();
    }

    function createCard(empNo) {
        const info = cardDB[empNo];
        const card = document.createElement('div');
        card.className = 'seat-card';

        if (!info) {
            card.style.backgroundColor = teamColorDefaults['unknown_team'] || '#eeeeee';
            
            // 安全な方法で要素を作成
            const empDiv = document.createElement('div');
            const strongEmp = document.createElement('strong');
            strongEmp.textContent = empNo; // XSS対策: textContentを使用
            empDiv.appendChild(strongEmp);
            card.appendChild(empDiv);
            
            const infoDiv = document.createElement('div');
            infoDiv.textContent = '(社員情報なし)';
            card.appendChild(infoDiv);
            
            return card;
        }

        card.dataset.empNo = empNo;
        const teamColor = teamColorDefaults[info.team] || teamColorDefaults['unknown_team'] || '#eeeeee';
        card.style.backgroundColor = teamColor;

        // 安全な方法で各要素を作成
        if (info.title && info.title !== "0" && info.title !== "一般") {
            const titleDiv = createSafeTextElement('div', info.title);
            card.appendChild(titleDiv);
        } else if (info.title === "0" || info.title === "一般") {
            const emptyDiv = document.createElement('div');
            emptyDiv.innerHTML = '&nbsp;'; // これは安全
            card.appendChild(emptyDiv);
        }

        const empNoDiv = document.createElement('div');
        const strongElement = document.createElement('strong');
        strongElement.textContent = info.empNo; // XSS対策: textContentを使用
        empNoDiv.appendChild(strongElement);
        card.appendChild(empNoDiv);

        const nameDiv = createSafeTextElement('div', info.name, 'employee-name');
        card.appendChild(nameDiv);

        const extDiv = createSafeTextElement('div', `内線: ${info.ext || '-'}`);
        card.appendChild(extDiv);

        const telDiv = createSafeTextElement('div', `Tel.: ${info.ctstage || '-'}`);
        card.appendChild(telDiv);

        if (currentAppMode === 'admin') {
            card.draggable = true;
            card.addEventListener('mousedown', handleMouseDownDraggable);
            card.addEventListener('dragstart', handleDragStartSeatCard);
            card.addEventListener('dragend', handleDragEnd);
        } else {
            card.draggable = false;
            card.removeEventListener('mousedown', handleMouseDownDraggable);
            card.removeEventListener('dragstart', handleDragStartSeatCard);
            card.removeEventListener('dragend', handleDragEnd);
        }

        const btn = document.createElement('button');
        btn.textContent = '戻す';
        btn.className = 'return-btn';
        card.appendChild(btn);
        return card;
    }

    function renderAllReturnBtns() {
        document.querySelectorAll('.seat-cell .return-btn').forEach(btn => {
            btn.onclick = e => {
                if (currentAppMode === 'view') return;
                e.stopPropagation();
                const cell = btn.closest('.seat-cell');
                const isl = parseInt(cell.dataset.island, 10);
                const r = parseInt(cell.dataset.row, 10);
                const c = parseInt(cell.dataset.col, 10);
                if (seatMap && seatMap[isl] && seatMap[isl][r]) {
                    seatMap[isl][r][c] = null;
                    if (allFloorData[currentFloorId] && allFloorData[currentFloorId].seatMap[isl] && allFloorData[currentFloorId].seatMap[isl][r]) {
                        allFloorData[currentFloorId].seatMap[isl][r][c] = null;
                    }
                }
                renderList(departmentFilterSelect ? departmentFilterSelect.value : "");
                renderFloor();
            };
        });
    }

    function onCellClick(cell) {
        if (isDragging || mousedownOnDraggable) {
            return;
        }

        const isl = parseInt(cell.dataset.island, 10);
        const r = parseInt(cell.dataset.row, 10);
        const c = parseInt(cell.dataset.col, 10);
        if (isNaN(isl) || isNaN(r) || isNaN(c) || !seatMap || !seatMap[isl] || !seatMap[isl][r]) {
            showFeedbackMessage("エラー: 座席データが無効です。", true);
            return;
        }

        if (currentAppMode === 'view') {
            if (selectedCell === cell) {
                cell.classList.remove('selected');
                selectedCell = null;
            } else {
                if (selectedCell) selectedCell.classList.remove('selected');
                cell.classList.add('selected');
                selectedCell = cell;
            }
            return;
        }

        if (mergeMode) {
            toggleMerge(isl, r, c);
            return;
        }

        if (selectedEmpNo && seatMap[isl][r][c] === null) {
            seatMap[isl][r][c] = selectedEmpNo;
            if (allFloorData[currentFloorId] && allFloorData[currentFloorId].seatMap[isl] && allFloorData[currentFloorId].seatMap[isl][r]) {
                allFloorData[currentFloorId].seatMap[isl][r][c] = selectedEmpNo;
            }
            employeeListPanel.querySelectorAll('.employee-item.selected').forEach(el => el.classList.remove('selected'));
            selectedEmpNo = null;
            if (selectedCell) {
                selectedCell.classList.remove('selected');
                selectedCell = null;
            }
            renderList(departmentFilterSelect ? departmentFilterSelect.value : "");
            renderFloor();
            return;
        }

        if (selectedCell === cell) {
            cell.classList.remove('selected');
            selectedCell = null;
        } else {
            if (selectedCell) selectedCell.classList.remove('selected');
            cell.classList.add('selected');
            selectedCell = cell;
            if (selectedEmpNo) {
                employeeListPanel.querySelectorAll('.employee-item.selected').forEach(el => el.classList.remove('selected'));
                selectedEmpNo = null;
            }
        }
    }

    function createMemoElement(id, type, memoKey, placeholder, groupIndex = 0) {
        const actualKey = `${type}-${groupIndex}-${id}`;
        if (!memoData) memoData = {};
        if (!memoData[actualKey] || typeof memoData[actualKey] !== 'object') {
            memoData[actualKey] = (type === 'island') ? { left: '', right: '' } : { text: '' };
        }
        const memoSection = document.createElement('div');
        memoSection.className = `memo-section memo-${memoKey}`;
        const memoDisplay = document.createElement('div');
        memoDisplay.className = 'memo-display';
        memoDisplay.textContent = memoData[actualKey][memoKey] || placeholder;
        const memoInput = document.createElement('textarea');
        memoInput.className = 'memo-input';
        memoInput.value = memoData[actualKey][memoKey] || '';
        memoInput.style.display = 'none';
        if (currentAppMode === 'view') memoInput.disabled = true;
        memoSection.append(memoDisplay, memoInput);
        memoDisplay.onclick = () => {
            if (currentAppMode === 'view') return;
            memoDisplay.style.display = 'none';
            memoInput.style.display = 'block';
            memoInput.disabled = false;
            memoInput.focus();
        };
        memoInput.onblur = () => {
            if (currentAppMode === 'view') {
                memoInput.style.display = 'none';
                memoDisplay.style.display = 'flex';
                return;
            }
            if (!memoData[actualKey]) {
                 memoData[actualKey] = (type === 'island') ? { left: '', right: '' } : { text: '' };
            }
            memoData[actualKey][memoKey] = memoInput.value;
            memoDisplay.textContent = memoInput.value || placeholder;
            memoInput.style.display = 'none';
            memoDisplay.style.display = 'flex';
        };
        return memoSection;
    }

    function renderFloor() {
        for (let isl = 0; isl < totalIslands; isl++) {
            const islDiv = document.querySelector(`.grid-island[data-island="${isl}"]`);
            if (!islDiv) continue;
            islDiv.innerHTML = '';
            const islandCabinet = document.createElement('div');
            islandCabinet.className = 'island-cabinet';
            islandCabinet.append(
                createMemoElement(isl, 'island', 'left', '', 0),
                createMemoElement(isl, 'island', 'right', '', 0)
            );
            islDiv.appendChild(islandCabinet);
            const islandSeatsContainer = document.createElement('div');
            islandSeatsContainer.className = 'island-seats-container';
            islDiv.appendChild(islandSeatsContainer);
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const isMerged = mergedSeats.some(ms => ms.island === isl && ms.row === r && ms.col === c);
                    if (mergedSeats.some(ms => ms.island === isl && ms.row === r && ms.col === c - 1)) {
                        continue;
                    }
                    const cell = document.createElement('div');
                    cell.className = 'seat-cell';
                    cell.dataset.island = isl;
                    cell.dataset.row = r;
                    cell.dataset.col = c;

                    if (currentAppMode === 'admin') {
                        cell.addEventListener('dragover', handleDragOverSeat);
                        cell.addEventListener('dragleave', handleDragLeaveSeat);
                        cell.addEventListener('drop', handleDropOnSeat);
                    }

                    if (selectedCell &&
                        parseInt(selectedCell.dataset.island, 10) === isl &&
                        parseInt(selectedCell.dataset.row, 10) === r &&
                        parseInt(selectedCell.dataset.col, 10) === c) {
                        cell.classList.add('selected');
                    }
                    if (isMerged) {
                        cell.classList.add('merged-seat');
                        if (mergeMode && currentAppMode === 'admin') {
                            // 安全な方法でマークを追加
                            const mergedSpan = document.createElement('span');
                            mergedSpan.className = 'merged-mark';
                            mergedSpan.textContent = '合体席';
                            cell.appendChild(mergedSpan);
                        }
                    }
                    const empNo = seatMap?.[isl]?.[r]?.[c];
                    if (empNo && cardDB[empNo]) {
                        const cardElement = createCard(empNo);
                        if (cardElement) cell.appendChild(cardElement);
                    } else if (empNo && !cardDB[empNo]) {
                        // 安全な方法で不明社員情報カードを作成
                        const unknownCard = document.createElement('div');
                        unknownCard.className = 'seat-card';
                        unknownCard.style.backgroundColor = teamColorDefaults['unknown_team'] || '#eeeeee';
                        
                        const empDiv = document.createElement('div');
                        const strongEmp = document.createElement('strong');
                        strongEmp.textContent = empNo; // XSS対策: textContentを使用
                        empDiv.appendChild(strongEmp);
                        unknownCard.appendChild(empDiv);
                        
                        const statusDiv = document.createElement('div');
                        statusDiv.textContent = '(情報読込中...)';
                        unknownCard.appendChild(statusDiv);
                        
                        cell.appendChild(unknownCard);
                    } else if (!isMerged && !empNo) {
                        cell.textContent = '空席';
                    } else if (isMerged && !empNo && !(mergeMode && currentAppMode === 'admin')) {
                        cell.textContent = '';
                    }
                    cell.onclick = () => onCellClick(cell);
                    islandSeatsContainer.appendChild(cell);
                }
            }
        }
        renderAllReturnBtns();
        if (topCabinetDiv) {
            topCabinetDiv.innerHTML = '';
            for (let i = 0; i < numNewTopCabinets; i++) {
                const cab = document.createElement('div');
                cab.className = 'top-cabinet-item';
                cab.appendChild(createMemoElement(i, 'top', 'text', '', 0));
                topCabinetDiv.appendChild(cab);
            }
        }
        if (sideCabinetsContainer) {
            sideCabinetsContainer.innerHTML = '';
            for (let i = 0; i < numTopSideCabinets; i++) {
                const cab = document.createElement('div');
                cab.className = 'side-cabinet';
                cab.appendChild(createMemoElement(i, 'side', 'text', '', 0));
                sideCabinetsContainer.appendChild(cab);
            }
            const spacer = document.createElement('div');
            spacer.className = 'cabinet-spacer';
            sideCabinetsContainer.appendChild(spacer);
            for (let i = 0; i < numBottomSideCabinets; i++) {
                const cab = document.createElement('div');
                cab.className = 'side-cabinet';
                cab.appendChild(createMemoElement(i, 'side', 'text', '', 1));
                sideCabinetsContainer.appendChild(cab);
            }
        }
        updateUIBasedOnMode();
    }

    function moveSelected(direction) {
        if (currentAppMode === 'view' || !selectedCell) return;
        let cIsl = parseInt(selectedCell.dataset.island, 10);
        let cRow = parseInt(selectedCell.dataset.row, 10);
        let cCol = parseInt(selectedCell.dataset.col, 10);
        let tIsl = cIsl, tRow = cRow, tCol = cCol;
        const isTopIslandGroup = cIsl < islandsPerRow;
        switch (direction) {
            case 'up':
                if (cRow > 0) tRow--;
                else if (!isTopIslandGroup) {
                    tIsl = cIsl - islandsPerRow;
                    tRow = rows - 1;
                }
                break;
            case 'down':
                if (cRow < rows - 1) tRow++;
                else if (isTopIslandGroup) {
                    tIsl = cIsl + islandsPerRow;
                    tRow = 0;
                }
                break;
            case 'left':
                if (cCol > 0) tCol--;
                else if (cIsl % islandsPerRow !== 0) {
                    tIsl--;
                    tCol = cols - 1;
                }
                break;
            case 'right':
                if (cCol < cols - 1) tCol++;
                else if ((cIsl + 1) % islandsPerRow !== 0 && cIsl < totalIslands -1) {
                    tIsl++;
                    tCol = 0;
                }
                break;
        }
        if (mergedSeats.some(ms => ms.island === tIsl && ms.row === tRow && ms.col === tCol - 1)) {
            tCol--;
        }
        if (tIsl === cIsl && tRow === cRow && tCol === cCol) return;
        if (!seatMap[tIsl] || !seatMap[tIsl][tRow] || seatMap[tIsl][tRow][tCol] === undefined) {
             console.warn("移動先が無効です:", tIsl, tRow, tCol); return;
        }
        const origEmp = seatMap[cIsl][cRow][cCol];
        const targetEmp = seatMap[tIsl][tRow][tCol];
        seatMap[tIsl][tRow][tCol] = origEmp;
        seatMap[cIsl][cRow][cCol] = targetEmp;
        if (allFloorData[currentFloorId] && allFloorData[currentFloorId].seatMap) {
            allFloorData[currentFloorId].seatMap[tIsl][tRow][tCol] = origEmp;
            allFloorData[currentFloorId].seatMap[cIsl][cRow][cCol] = targetEmp;
        }
        renderFloor();
        const newSelCell = document.querySelector(`.seat-cell[data-island="${tIsl}"][data-row="${tRow}"][data-col="${tCol}"]`);
        if (newSelCell) {
            document.querySelectorAll('.seat-cell.selected').forEach(el => el.classList.remove('selected'));
            newSelCell.classList.add('selected');
            selectedCell = newSelCell;
        } else {
            selectedCell = null;
        }
    }

    function setAppMode(newMode) {
        console.log('=== setAppMode called with:', newMode);
        if (newMode !== 'view' && newMode !== 'admin') return;
        currentAppMode = newMode;
        document.body.className = currentAppMode + '-mode';
        console.log('Body class set to:', document.body.className);
        console.log('currentAppMode is now:', currentAppMode);
        updateUIBasedOnMode(); // モード変更時にUI要素の状態を更新

        if (newMode === 'view') {
            if (sidePanelWrapper) sidePanelWrapper.style.display = 'none';
            if (toggleListBtn) {
                const iconElement = toggleListBtn.querySelector('i');
                const textElement = toggleListBtn.querySelector('span');
                if (iconElement) iconElement.className = 'fas fa-list';
                if (textElement) textElement.textContent = 'リスト表示';
                else if (iconElement) { // フォールバックとしてspanを生成
                    const newSpan = document.createElement('span');
                    newSpan.textContent = 'リスト表示';
                    iconElement.insertAdjacentElement('afterend', newSpan);
                }
                toggleListBtn.classList.remove('active');
            }
            if (controlsPanel && controlsPanel.classList.contains('active')) {
                controlsPanel.classList.remove('active');
                if (controlsToggleBtn) controlsToggleBtn.innerHTML = '<i class="fa-solid fa-gear"></i>';
            }
            deselectAll();
        }
        // 管理モードに切り替えた場合、renderListとrenderFloorを呼び出して
        // draggable属性やイベントリスナーが正しく設定されるようにする
        renderFloor();
        renderList(departmentFilterSelect ? departmentFilterSelect.value : "");
    }

    function updateUIBasedOnMode() {
        const isAdminMode = currentAppMode === 'admin';
        
        // bodyクラスを更新してCSSでのスタイル制御を有効にする
        document.body.className = isAdminMode ? 'admin-mode' : 'view-mode';
        
        if (enterAdminModeBtn) enterAdminModeBtn.style.display = isAdminMode ? 'none' : 'flex';
        if (exitAdminModeBtn) exitAdminModeBtn.style.display = isAdminMode ? 'flex' : 'none';

        if (togglePrintControlsBtn) togglePrintControlsBtn.disabled = false;
        if (printControlsDiv) {
            const isActive = printControlsDiv.classList.contains('active');
            if (printA4SetupBtn) printA4SetupBtn.disabled = !isActive;
            if (printA3SetupBtn) printA3SetupBtn.disabled = !isActive;
        }

        if (toggleMasterControlsBtn) toggleMasterControlsBtn.disabled = !isAdminMode;
        if (masterControlsDiv) {
            if (!isAdminMode && masterControlsDiv.classList.contains('active')) {
                masterControlsDiv.classList.remove('active');
            }
            [loadMasterJsonBtn, saveMasterJsonBtn, reloadMasterDataBtn].forEach(btn => {
                if (btn) btn.disabled = !isAdminMode;
            });
            if (loadMasterJsonBtn) loadMasterJsonBtn.disabled = !isAdminMode || !loadedMasterData;
            if (saveMasterJsonBtn) saveMasterJsonBtn.disabled = !isAdminMode || !loadedMasterData;
        }

        if (jsonInput) jsonInput.disabled = !isAdminMode;
        if (employeeListPanel) {
            employeeListPanel.querySelectorAll('.employee-item').forEach(item => {
                item.style.cursor = isAdminMode ? 'grab' : 'default';
            });
        }
        // ▼▼▼ 変更箇所 ▼▼▼
        [toggleListBtn, deptZoneSettingsBtn, upBtn, leftBtn, downBtn, rightBtn, mergeBtn,
         saveDraftBtn, loadDraftBtn, saveServerBtn, loadServerBtn]
            .forEach(btn => { if (btn) btn.disabled = !isAdminMode; });
        // ▲▲▲ 変更箇所 ▲▲▲

        document.querySelectorAll('.memo-input').forEach(input => {
            input.disabled = !isAdminMode;
            if (!isAdminMode && input.style.display !== 'none') {
                const memoSection = input.closest('.memo-section');
                if (memoSection) {
                    const memoDisplay = memoSection.querySelector('.memo-display');
                    input.style.display = 'none';
                    if (memoDisplay) memoDisplay.style.display = 'flex';
                }
            }
        });
        if (mergeBtn) {
            mergeBtn.disabled = !isAdminMode;
            if (!isAdminMode && mergeMode) {
                mergeMode = false;
                mergeBtn.classList.remove('active');
                mergeBtn.textContent = '＋';
            }
        }
        if (saveDeptZoneSettingsBtn) saveDeptZoneSettingsBtn.disabled = !isAdminMode;
        if (addOrUpdateDeptZoneBtn) addOrUpdateDeptZoneBtn.disabled = !isAdminMode;
        if (deptZoneNameSelect) deptZoneNameSelect.disabled = !isAdminMode;
        if (deptZoneStartInput) deptZoneStartInput.disabled = !isAdminMode;
        if (deptZoneEndInput) deptZoneEndInput.disabled = !isAdminMode;
        if (deptZoneColorInput) deptZoneColorInput.disabled = !isAdminMode;
        if (currentDeptZonesList) {
            currentDeptZonesList.querySelectorAll('.edit-zone-btn, .delete-zone-btn').forEach(btn => {
                btn.disabled = !isAdminMode;
                btn.style.opacity = isAdminMode ? '1' : '0.5';
                btn.style.pointerEvents = isAdminMode ? 'auto' : 'none';
            });
        }
        if (departmentFilterSelect) departmentFilterSelect.disabled = !isAdminMode;
        if (resetFilterBtn) resetFilterBtn.disabled = !isAdminMode;
        
        // モード変更時に部署範囲を再レンダリング（リサイズハンドルの表示切り替えのため）
        renderDepartmentZoneHeaders();
    }

    function renderDepartmentZoneHeaders() {
        console.log('renderDepartmentZoneHeaders called, currentAppMode:', currentAppMode);
        const topHeader = document.getElementById('departmentZoneHeaderTop');
        const bottomHeader = document.getElementById('departmentZoneHeaderBottom');
        if (!topHeader || !bottomHeader) return;
        topHeader.innerHTML = '';
        bottomHeader.innerHTML = '';
        topHeader.style.gridTemplateColumns = `repeat(${seatsPerRow}, 1fr)`;
        bottomHeader.style.gridTemplateColumns = `repeat(${seatsPerRow}, 1fr)`;
        const currentZones = departmentZoneSettings;
        if (currentZones?.topRow?.length) {
            currentZones.topRow.forEach((zone, index) => {
                if (typeof zone.startSeatIndex !== 'number' || typeof zone.endSeatIndex !== 'number') return;
                const block = document.createElement('div');
                block.className = 'dept-zone-block';
                block.textContent = zone.deptName;
                block.style.gridColumn = `${zone.startSeatIndex + 1} / span ${Math.max(1, zone.endSeatIndex - zone.startSeatIndex + 1)}`;
                block.style.backgroundColor = zone.color || '#f0f0f0';
                block.dataset.zoneIndex = index;
                block.dataset.rowType = 'topRow';
                
                // リサイズハンドルを追加（管理モード時のみ）
                if (currentAppMode === 'admin') {
                    console.log('Adding resize handles for topRow zone:', index, zone.deptName);
                    console.log('Block element:', block);
                    console.log('Body class:', document.body.className);
                    
                    const leftHandle = document.createElement('div');
                    leftHandle.className = 'dept-zone-resize-handle left';
                    leftHandle.dataset.side = 'left';
                    leftHandle.dataset.zoneIndex = index;
                    leftHandle.dataset.rowType = 'topRow';
                    leftHandle.style.backgroundColor = 'red'; // 強制的に赤色
                    leftHandle.style.width = '10px'; // 強制的に幅を設定
                    leftHandle.style.display = 'block'; // 強制的に表示
                    leftHandle.title = 'Left resize handle'; // ツールチップ追加
                    block.appendChild(leftHandle);

                    const rightHandle = document.createElement('div');
                    rightHandle.className = 'dept-zone-resize-handle right';
                    rightHandle.dataset.side = 'right';
                    rightHandle.dataset.zoneIndex = index;
                    rightHandle.dataset.rowType = 'topRow';
                    rightHandle.style.backgroundColor = 'red'; // 強制的に赤色
                    rightHandle.style.width = '10px'; // 強制的に幅を設定
                    rightHandle.style.display = 'block'; // 強制的に表示
                    rightHandle.title = 'Right resize handle'; // ツールチップ追加
                    block.appendChild(rightHandle);
                    
                    console.log('Left handle added:', leftHandle);
                    console.log('Right handle added:', rightHandle);
                    console.log('Block children count:', block.children.length);
                }
                
                // 部署ゾーンクリックイベントリスナーを追加（管理モード時のみ）
                if (currentAppMode === 'admin') {
                    block.addEventListener('click', (e) => {
                        // リサイズハンドルのクリックを除外
                        if (e.target.classList.contains('dept-zone-resize-handle')) {
                            return;
                        }
                        showDeptZoneClickDropdown(e, 'topRow', index);
                    });
                }
                
                topHeader.appendChild(block);
            });
        }
        if (currentZones?.bottomRow?.length) {
            currentZones.bottomRow.forEach((zone, index) => {
                if (typeof zone.startSeatIndex !== 'number' || typeof zone.endSeatIndex !== 'number') return;
                const block = document.createElement('div');
                block.className = 'dept-zone-block';
                block.textContent = zone.deptName;
                block.style.gridColumn = `${zone.startSeatIndex + 1} / span ${Math.max(1, zone.endSeatIndex - zone.startSeatIndex + 1)}`;
                block.style.backgroundColor = zone.color || '#f0f0f0';
                block.dataset.zoneIndex = index;
                block.dataset.rowType = 'bottomRow';
                
                // リサイズハンドルを追加（管理モード時のみ）
                if (currentAppMode === 'admin') {
                    console.log('Adding resize handles for bottomRow zone:', index, zone.deptName);
                    
                    const leftHandle = document.createElement('div');
                    leftHandle.className = 'dept-zone-resize-handle left';
                    leftHandle.dataset.side = 'left';
                    leftHandle.dataset.zoneIndex = index;
                    leftHandle.dataset.rowType = 'bottomRow';
                    leftHandle.style.backgroundColor = 'red'; // 強制的に赤色
                    leftHandle.style.width = '10px'; // 強制的に幅を設定
                    leftHandle.style.display = 'block'; // 強制的に表示
                    leftHandle.title = 'Left resize handle'; // ツールチップ追加
                    block.appendChild(leftHandle);

                    const rightHandle = document.createElement('div');
                    rightHandle.className = 'dept-zone-resize-handle right';
                    rightHandle.dataset.side = 'right';
                    rightHandle.dataset.zoneIndex = index;
                    rightHandle.dataset.rowType = 'bottomRow';
                    rightHandle.style.backgroundColor = 'red'; // 強制的に赤色
                    rightHandle.style.width = '10px'; // 強制的に幅を設定
                    rightHandle.style.display = 'block'; // 強制的に表示
                    rightHandle.title = 'Right resize handle'; // ツールチップ追加
                    block.appendChild(rightHandle);
                    
                    console.log('Bottom row handles added for zone:', zone.deptName);
                }
                
                // 部署ゾーンクリックイベントリスナーを追加（管理モード時のみ）
                if (currentAppMode === 'admin') {
                    block.addEventListener('click', (e) => {
                        // リサイズハンドルのクリックを除外
                        if (e.target.classList.contains('dept-zone-resize-handle')) {
                            return;
                        }
                        showDeptZoneClickDropdown(e, 'bottomRow', index);
                    });
                }
                
                bottomHeader.appendChild(block);
            });
        }
    }

    function updatePrintHeader() {
        if (printFloorHeader) {
            printFloorHeader.textContent = `ＴＣＳＳ座席表 - ${currentFloorId}`;
        }
    }

    function openDeptZoneModal() {
        console.log('=== openDeptZoneModal called, currentAppMode:', currentAppMode);
        if (currentAppMode === 'view') return;
        if (deptZoneModal && modalCurrentFloorSpan && currentEditingRowDisplay) {
            modalCurrentFloorSpan.textContent = currentFloorId;
            currentEditingRowType = editTopRowRadio.checked ? 'topRow' : 'bottomRow';
            if (currentEditingRowDisplay) currentEditingRowDisplay.textContent = currentEditingRowType === 'topRow' ? '上段' : '下段';
            maxSeatLabelSpans.forEach(span => span.textContent = seatsPerRow);
            if(deptZoneStartInput) deptZoneStartInput.max = seatsPerRow;
            if(deptZoneEndInput) deptZoneEndInput.max = seatsPerRow;
            if (!allFloorData[currentFloorId] || !allFloorData[currentFloorId].departmentZones) {
                if (!allFloorData[currentFloorId]) allFloorData[currentFloorId] = initializeNewFloorData();
                else allFloorData[currentFloorId].departmentZones = { topRow: [], bottomRow: [] };
            }
            tempDepartmentZones = JSON.parse(JSON.stringify(allFloorData[currentFloorId].departmentZones));
            populateDepartmentDropdown();
            displayCurrentDeptZones();
            resetDeptZoneForm();
            deptZoneModal.style.display = "block";
        }
    }

    function populateDepartmentDropdown() {
        if (!deptZoneNameSelect) return;
        const existingValue = deptZoneNameSelect.value;
        deptZoneNameSelect.innerHTML = '';
        const depts = new Set(Object.values(cardDB).map(emp => emp?.dept).filter(Boolean));
        if (depts.size === 0) {
            deptZoneNameSelect.add(new Option("利用可能な部署なし", ""));
            deptZoneNameSelect.dispatchEvent(new Event('change'));
            return;
        }
        Array.from(depts).sort().forEach(dept => {
            deptZoneNameSelect.add(new Option(dept, dept));
        });
        if (Array.from(deptZoneNameSelect.options).some(opt => opt.value === existingValue)) {
            deptZoneNameSelect.value = existingValue;
        } else if (deptZoneNameSelect.options.length > 0) {
            deptZoneNameSelect.selectedIndex = 0;
        }
        deptZoneNameSelect.dispatchEvent(new Event('change'));
    }

    function handleDeptZoneNameChangeForColor() {
        if (!deptZoneNameSelect || !deptZoneColorInput) return;
        const selectedDeptName = deptZoneNameSelect.value;
        deptZoneColorInput.value = departmentColorDefaults[selectedDeptName] || departmentColorDefaults['unknown'] || "#FFDDC1";
    }

    function displayCurrentDeptZones() {
        if (!currentDeptZonesList || !tempDepartmentZones || !tempDepartmentZones[currentEditingRowType]) {
            if (currentDeptZonesList) {
                currentDeptZonesList.innerHTML = '';
                const noDataLi = document.createElement('li');
                noDataLi.textContent = '範囲設定はありません。';
                currentDeptZonesList.appendChild(noDataLi);
            }
            return;
        }
        currentDeptZonesList.innerHTML = '';
        const zonesToShow = tempDepartmentZones[currentEditingRowType];
        const isAdminModeActive = currentAppMode === 'admin';
        if (zonesToShow.length === 0) {
            const noDataLi = document.createElement('li');
            noDataLi.textContent = '範囲設定はありません。';
            currentDeptZonesList.appendChild(noDataLi);
            return;
        }
        zonesToShow.forEach((zone, index) => {
            const li = document.createElement('li');
            const infoSpan = Object.assign(document.createElement('span'), {
                className: 'zone-info',
                textContent: `${zone.deptName} (席${zone.startSeatIndex + 1}～${zone.endSeatIndex + 1}), 色: `
            });
            const colorPreview = Object.assign(document.createElement('span'), {
                style: `display:inline-block;width:15px;height:15px;background-color:${zone.color};border:1px solid #ccc;margin-left:5px;vertical-align:middle;`
            });
            infoSpan.appendChild(colorPreview);
            const actionsSpan = Object.assign(document.createElement('span'), { className: 'zone-actions' });
            const editBtn = Object.assign(document.createElement('button'), { textContent: '編集', className: 'edit-zone-btn', disabled: !isAdminModeActive });
            editBtn.onclick = () => { if (isAdminModeActive) loadZoneForEditing(index); };
            const deleteBtn = Object.assign(document.createElement('button'), { textContent: '削除', className: 'delete-zone-btn', disabled: !isAdminModeActive });
            deleteBtn.onclick = () => { if (isAdminModeActive) deleteDeptZone(index); };
            actionsSpan.append(editBtn, deleteBtn);
            li.append(infoSpan, actionsSpan);
            currentDeptZonesList.appendChild(li);
        });
    }

    function loadZoneForEditing(index) {
        if (currentAppMode === 'view') return;
        const zone = tempDepartmentZones[currentEditingRowType]?.[index];
        if (zone) {
            deptZoneNameSelect.value = zone.deptName;
            deptZoneColorInput.value = zone.color || departmentColorDefaults[zone.deptName] || departmentColorDefaults['unknown'] || "#FFDDC1";
            deptZoneStartInput.value = zone.startSeatIndex + 1;
            deptZoneEndInput.value = zone.endSeatIndex + 1;
            editingZoneIndexInput.value = index;
            addOrUpdateDeptZoneBtn.textContent = '範囲を更新';
        }
    }

    function deleteDeptZone(index) {
        if (currentAppMode === 'view') return;
        if (confirm('この部署範囲設定を削除してもよろしいですか？')) {
            tempDepartmentZones[currentEditingRowType].splice(index, 1);
            displayCurrentDeptZones();
            resetDeptZoneForm();
        }
    }

    function resetDeptZoneForm() {
        if (deptZoneNameSelect && deptZoneNameSelect.options.length > 0) {
            deptZoneNameSelect.selectedIndex = 0;
             if(deptZoneColorInput) deptZoneColorInput.value = departmentColorDefaults[deptZoneNameSelect.value] || departmentColorDefaults['unknown'] || "#FFDDC1";
        } else if (deptZoneColorInput) {
            deptZoneColorInput.value = "#FFDDC1";
        }
        if(deptZoneStartInput) deptZoneStartInput.value = 1;
        if(deptZoneEndInput) deptZoneEndInput.value = 1;
        if(editingZoneIndexInput) editingZoneIndexInput.value = "-1";
        if(addOrUpdateDeptZoneBtn) addOrUpdateDeptZoneBtn.textContent = '範囲を追加';
    }

    function addOrUpdateDeptZoneHandler() {
        if (currentAppMode === 'view') return;
        const deptName = deptZoneNameSelect.value;
        let startIdx = parseInt(deptZoneStartInput.value, 10) - 1;
        let endIdx = parseInt(deptZoneEndInput.value, 10) - 1;
        const color = deptZoneColorInput.value;
        const editIdx = parseInt(editingZoneIndexInput.value, 10);
        if (!deptName) {
            showFeedbackMessage("部署名を選択してください。", true); return;
        }
        if (isNaN(startIdx) || isNaN(endIdx) || startIdx < 0 || endIdx >= seatsPerRow || startIdx > endIdx) {
            showFeedbackMessage(`席の範囲が無効です。1～${seatsPerRow}の間で、開始席 <= 終了席となるように入力してください。`, true); return;
        }
        const zonesInRow = tempDepartmentZones[currentEditingRowType];
        if (zonesInRow.some((zone, i) => i !== editIdx && Math.max(startIdx, zone.startSeatIndex) <= Math.min(endIdx, zone.endSeatIndex))) {
            showFeedbackMessage("指定された席の範囲が既存の範囲と重複しています。", true); return;
        }
        const newZone = {
            deptName,
            startSeatIndex: startIdx,
            endSeatIndex: endIdx,
            color,
            deptId: deptName.replace(/\s+/g, '').toLowerCase()
        };
        if (editIdx > -1) {
            zonesInRow[editIdx] = newZone;
        } else {
            zonesInRow.push(newZone);
        }
        zonesInRow.sort((a, b) => a.startSeatIndex - b.startSeatIndex);
        displayCurrentDeptZones();
        resetDeptZoneForm();
    }

    function saveDeptZoneSettingsHandler() {
        console.log('=== saveDeptZoneSettingsHandler called');
        console.log('currentAppMode:', currentAppMode);
        console.log('tempDepartmentZones:', tempDepartmentZones);
        if (currentAppMode === 'view') return;
        if (!allFloorData[currentFloorId]) allFloorData[currentFloorId] = initializeNewFloorData();
        allFloorData[currentFloorId].departmentZones = JSON.parse(JSON.stringify(tempDepartmentZones));
        departmentZoneSettings = JSON.parse(JSON.stringify(tempDepartmentZones));
        console.log('departmentZoneSettings updated to:', departmentZoneSettings);
        renderDepartmentZoneHeaders();
        if (deptZoneModal) deptZoneModal.style.display = "none";
        showFeedbackMessage("部署範囲設定を現在の編集セッションに適用しました。サーバ保存または下書き保存を行ってください。", false);
    }

    function deselectAll() {
        if (selectedCell) {
            selectedCell.classList.remove('selected');
            selectedCell = null;
        }
        if (selectedEmpNo) {
            employeeListPanel.querySelectorAll('.employee-item.selected').forEach(el => el.classList.remove('selected'));
            selectedEmpNo = null;
        }
        if (mergeMode && currentAppMode === 'admin') {
            mergeMode = false;
            if (mergeBtn) {
                mergeBtn.classList.remove('active');
                mergeBtn.textContent = '＋';
            }
            renderFloor();
        } else if (mergeMode && currentAppMode === 'view') {
             mergeMode = false;
        }
    }

    function handleMouseDownDraggable(event) {
        if (currentAppMode !== 'admin') return;
        mousedownOnDraggable = event.currentTarget;
    }


    function handleDragStartEmployeeItem(event) {
        if (currentAppMode !== 'admin' || event.currentTarget !== mousedownOnDraggable) {
            event.preventDefault();
            mousedownOnDraggable = null;
            return;
        }
        isDragging = true;
        const item = event.currentTarget;
        const empNo = item.dataset.empNo;
        draggedEmployeeInfo = { empNo: empNo, origin: 'unassigned' };
        draggedElement = item;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', empNo);
        setTimeout(() => {
            if(draggedElement) draggedElement.classList.add('dragging');
        }, 0);
        mousedownOnDraggable = null;
    }

    function handleDragStartSeatCard(event) {
        if (currentAppMode !== 'admin' || event.currentTarget !== mousedownOnDraggable) {
            event.preventDefault();
            mousedownOnDraggable = null;
            return;
        }
        event.stopPropagation();
        isDragging = true;

        const card = event.currentTarget;
        const empNo = card.dataset.empNo;
        const cell = card.closest('.seat-cell');
        if (!cell) {
            isDragging = false;
            mousedownOnDraggable = null;
            return;
        }
        const isl = parseInt(cell.dataset.island, 10);
        const r = parseInt(cell.dataset.row, 10);
        const c = parseInt(cell.dataset.col, 10);

        draggedEmployeeInfo = { empNo: empNo, origin: `seat-${isl}-${r}-${c}`, island: isl, row: r, col: c };
        draggedElement = card;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', empNo);
        setTimeout(() => {
            if(draggedElement) draggedElement.classList.add('dragging');
        },0);
        mousedownOnDraggable = null;
    }

    function handleDragEnd(event) {
        if (draggedElement) {
            draggedElement.classList.remove('dragging');
        }
        isDragging = false;
        mousedownOnDraggable = null;
        draggedEmployeeInfo = null;
        draggedElement = null;
        document.querySelectorAll('.seat-cell.dragover').forEach(cell => cell.classList.remove('dragover'));
        deselectAll();
    }

    function handleDragOverSeat(event) {
        if (currentAppMode !== 'admin' || !draggedEmployeeInfo) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        this.classList.add('dragover');
    }

    function handleDragLeaveSeat(event) {
        if (currentAppMode !== 'admin') return;
        this.classList.remove('dragover');
    }

    function handleDropOnSeat(event) {
        if (currentAppMode !== 'admin' || !draggedEmployeeInfo) return;
        event.preventDefault();
        this.classList.remove('dragover');

        const targetCell = this;
        const targetIsl = parseInt(targetCell.dataset.island, 10);
        const targetRow = parseInt(targetCell.dataset.row, 10);
        const targetCol = parseInt(targetCell.dataset.col, 10);

        const { empNo: draggedEmpNo, origin, island: originIsl, row: originRow, col: originCol } = draggedEmployeeInfo;

        if (origin !== 'unassigned' && originIsl === targetIsl && originRow === targetRow && originCol === targetCol) {
            return;
        }

        if (mergedSeats.some(ms => ms.island === targetIsl && ms.row === targetRow && ms.col === targetCol -1)) {
             showFeedbackMessage("結合された席の右側には直接配置できません。左側のセルにドロップしてください。", true);
             return;
        }

        const targetSeatCurrentEmpNo = seatMap[targetIsl][targetRow][targetCol];
        let operationSuccess = false;

        if (origin === 'unassigned') {
            if (targetSeatCurrentEmpNo === null) {
                seatMap[targetIsl][targetRow][targetCol] = draggedEmpNo;
                operationSuccess = true;
            } else {
                showFeedbackMessage("ドロップ先の席は既に使われています。", true);
            }
        } else {
            if (targetSeatCurrentEmpNo === null) {
                seatMap[targetIsl][targetRow][targetCol] = draggedEmpNo;
                seatMap[originIsl][originRow][originCol] = null;
                operationSuccess = true;
            } else {
                seatMap[targetIsl][targetRow][targetCol] = draggedEmpNo;
                seatMap[originIsl][originRow][originCol] = targetSeatCurrentEmpNo;
                operationSuccess = true;
            }
        }

        if (operationSuccess) {
            if(allFloorData[currentFloorId]) {
                allFloorData[currentFloorId].seatMap = JSON.parse(JSON.stringify(seatMap));
            }
            showFeedbackMessage(`${cardDB[draggedEmpNo]?.name || draggedEmpNo} さんを移動しました。`, false);
            renderFloor();
            renderList(departmentFilterSelect ? departmentFilterSelect.value : "");
            deselectAll();
        }
    }

    async function downloadMasterData() {
    // currentAppMode の参照方法を修正
    const body = document.body;
    const isAdminMode = body.classList.contains('admin-mode');
    
    if (!isAdminMode) {
        // showFeedbackMessage が使えない場合はalertで代替
        alert("管理者モードでのみ利用可能です。");
        return;
    }
    
    try {
        console.log("マスタデータダウンロード開始");
        
        // 既存のAPIエンドポイントを使用
        const response = await fetch('/api/initial-data');
        
        if (!response.ok) {
            throw new Error(`サーバエラー (${response.status}): マスタデータを取得できませんでした。`);
        }
        
        const data = await response.json();
        
        // タイムスタンプ付きファイル名を生成
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `initial_data_${timestamp}.json`;
        
        // ファイルダウンロード
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log("マスタデータダウンロード完了:", filename);
        
        // フィードバックメッセージを表示（showFeedbackMessage が利用可能な場合のみ）
        if (typeof showFeedbackMessage === 'function') {
            showFeedbackMessage("マスタデータのダウンロードが完了しました。", false);
        } else {
            // フォールバック: 画面上部に一時的なメッセージを表示
            const messageDiv = document.createElement('div');
            messageDiv.style.cssText = `
                position: fixed;
                top: 80px;
                left: 50%;
                transform: translateX(-50%);
                background: #4CAF50;
                color: white;
                padding: 10px 20px;
                border-radius: 5px;
                z-index: 1000;
                font-size: 14px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            `;
            messageDiv.textContent = `マスタデータのダウンロードが完了しました (${filename})`;
            document.body.appendChild(messageDiv);
            
            // 3秒後に自動削除
            setTimeout(() => {
                if (messageDiv.parentNode) {
                    document.body.removeChild(messageDiv);
                }
            }, 3000);
        }
        
    } catch (error) {
        console.error("マスタデータのダウンロードに失敗しました:", error);
        
        // エラーメッセージも同様にフォールバック
        if (typeof showFeedbackMessage === 'function') {
            showFeedbackMessage(`マスタデータのダウンロードに失敗しました: ${error.message}`, true);
        } else {
            alert(`マスタデータのダウンロードに失敗しました: ${error.message}`);
        }
    }
    }

    function setupEventListeners() {
        console.log('=== Inside setupEventListeners function ===');
        document.addEventListener('mouseup', () => {
            mousedownOnDraggable = null;
        });

        if (switchFloorButton) switchFloorButton.onclick = () => switchFloor(switchFloorButton.dataset.targetFloor);

        if (controlsToggleBtn && controlsPanel) {
            controlsToggleBtn.onclick = () => {
                const isActive = controlsPanel.classList.toggle('active');
                controlsToggleBtn.innerHTML = isActive ? '<i class="fa-solid fa-xmark"></i>' : '<i class="fa-solid fa-gear"></i>';
            };
        }
        if (toggleListBtn && sidePanelWrapper) {
            toggleListBtn.onclick = () => {
                if (currentAppMode === 'view') return;
                const isHidden = sidePanelWrapper.style.display === 'none';
                sidePanelWrapper.style.display = isHidden ? 'flex' : 'none';
                const iconElement = toggleListBtn.querySelector('i');
                const textElement = toggleListBtn.querySelector('span');

                if (isHidden) {
                    if (iconElement) iconElement.className = 'fas fa-list-alt';
                    if (textElement) textElement.textContent = 'リスト非表示';
                } else {
                    if (iconElement) iconElement.className = 'fas fa-list';
                    if (textElement) textElement.textContent = 'リスト表示';
                }
                toggleListBtn.classList.toggle('active', isHidden);
            };
        }
        if (deptZoneSettingsBtn) {
            console.log('Setting up deptZoneSettingsBtn click handler');
            deptZoneSettingsBtn.onclick = () => {
                console.log('=== Department zone settings button clicked');
                openDeptZoneModal();
            };
        } else {
            console.log('WARNING: deptZoneSettingsBtn not found!');
        }
        if (mergeBtn) {
            mergeBtn.onclick = () => {
                if (currentAppMode === 'view') return;
                mergeMode = !mergeMode;
                mergeBtn.classList.toggle('active', mergeMode);
                mergeBtn.textContent = mergeMode ? '－' : '＋';
                renderFloor();
                if (mergeMode) {
                    deselectAll();
                    mergeMode = true;
                    mergeBtn.classList.add('active');
                    mergeBtn.textContent = '－';
                }
            };
        }
        ['up', 'down', 'left', 'right'].forEach(dir => {
            const btn = document.getElementById(dir + 'Btn');
            if (btn) btn.onclick = () => moveSelected(dir);
        });
        if (saveDraftBtn) saveDraftBtn.onclick = saveDraftToLocal;
        if (loadDraftBtn) loadDraftBtn.onclick = loadDraftFromLocal;
        if (saveServerBtn) saveServerBtn.onclick = saveLayoutToServer;
        if (loadServerBtn) loadServerBtn.onclick = () => loadLayoutFromServer(false);
        if (enterAdminModeBtn) {
            console.log('Setting up enterAdminModeBtn click handler');
            enterAdminModeBtn.onclick = () => {
                console.log('=== Admin mode button clicked');
                setAppMode('admin');
                showFeedbackMessage("管理モードに移行しました。", false);
            };
        } else {
            console.log('WARNING: enterAdminModeBtn not found!');
        }
        if (exitAdminModeBtn) {
            exitAdminModeBtn.onclick = () => {
                setAppMode('view');
                showFeedbackMessage("閲覧モードに戻りました。", false);
            };
        }
        if (departmentFilterSelect) departmentFilterSelect.onchange = (event) => renderList(event.target.value);
        if (resetFilterBtn) {
            resetFilterBtn.onclick = () => {
                if (departmentFilterSelect) departmentFilterSelect.value = "";
                renderList();
            };
        }
        if (closeDeptZoneModalBtn) closeDeptZoneModalBtn.onclick = () => { if (deptZoneModal) deptZoneModal.style.display = "none"; };
        if (cancelDeptZoneSettingsBtn) cancelDeptZoneSettingsBtn.onclick = () => { if (deptZoneModal) deptZoneModal.style.display = "none"; };
        window.onclick = (event) => { if (event.target == deptZoneModal) deptZoneModal.style.display = "none"; };
        if (editTopRowRadio) editTopRowRadio.onchange = (event) => { if (currentAppMode === 'view') return; currentEditingRowType = event.target.value; if (currentEditingRowDisplay) currentEditingRowDisplay.textContent = currentEditingRowType === 'topRow' ? '上段' : '下段'; displayCurrentDeptZones(); resetDeptZoneForm(); };
        if (editBottomRowRadio) editBottomRowRadio.onchange = (event) => { if (currentAppMode === 'view') return; currentEditingRowType = event.target.value; if (currentEditingRowDisplay) currentEditingRowDisplay.textContent = currentEditingRowType === 'topRow' ? '上段' : '下段'; displayCurrentDeptZones(); resetDeptZoneForm(); };
        if (deptZoneNameSelect) deptZoneNameSelect.addEventListener('change', handleDeptZoneNameChangeForColor);
        if (addOrUpdateDeptZoneBtn) addOrUpdateDeptZoneBtn.onclick = addOrUpdateDeptZoneHandler;
        if (saveDeptZoneSettingsBtn) saveDeptZoneSettingsBtn.onclick = saveDeptZoneSettingsHandler;

        // ▼▼▼ 変更箇所 ▼▼▼
        // refreshInitialDataBtn のイベントリスナーを削除
        // ▲▲▲ 変更箇所 ▲▲▲

        document.addEventListener('keydown', e => {
            if (deptZoneModal && deptZoneModal.style.display === "block") {
                if (e.key === 'Escape') {
                    deptZoneModal.style.display = "none";
                    e.preventDefault();
                }
                return;
            }

            if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
                if (e.key === 'Escape') {
                    deselectAll();
                    document.activeElement.blur();
                    e.preventDefault();
                }
                return;
            }

            if (e.key === 'Escape') {
                deselectAll();
                e.preventDefault();
            }
            else if (currentAppMode === 'admin' && e.key.startsWith('Arrow') && selectedCell) {
                moveSelected(e.key.replace('Arrow', '').toLowerCase());
                e.preventDefault();
            }
        });

        if (togglePrintControlsBtn && printControlsDiv) {
            togglePrintControlsBtn.addEventListener('click', () => {
                if (masterControlsDiv.classList.contains('active')) {
                    masterControlsDiv.classList.remove('active');
                }
                printControlsDiv.classList.toggle('active');
                updateUIBasedOnMode();
            });
        }
        if (printA4SetupBtn) {
            printA4SetupBtn.addEventListener('click', () => {
                htmlElement.classList.remove('print-mode-a3');
                htmlElement.classList.add('print-mode-a4');
                alert('A4印刷の倍率に設定しました。\nブラウザの印刷機能 (Ctrl+Pなど) を使用して印刷してください。');
            });
        }
        if (printA3SetupBtn) {
            printA3SetupBtn.addEventListener('click', () => {
                htmlElement.classList.remove('print-mode-a4');
                htmlElement.classList.add('print-mode-a3');
                alert('A3印刷の倍率に設定しました。\nブラウザの印刷機能 (Ctrl+Pなど) を使用して印刷してください。');
            });
        }
        window.addEventListener('beforeprint', updatePrintHeader);

        if (toggleMasterControlsBtn && masterControlsDiv) {
            toggleMasterControlsBtn.addEventListener('click', () => {
                if (currentAppMode !== 'admin') {
                    showFeedbackMessage("管理者モードでのみ利用可能です。", true);
                    return;
                }
                if (printControlsDiv.classList.contains('active')) {
                    printControlsDiv.classList.remove('active');
                }
                masterControlsDiv.classList.toggle('active');
                updateUIBasedOnMode();
            });
        }

        // ヘルプボタンのイベントリスナー
        if (toggleHelpBtn) {
            toggleHelpBtn.addEventListener('click', () => {
                window.open('manual.html', '_blank');
            });
            console.log("ヘルプボタンのイベントリスナーを設定しました");
        } else {
            console.warn("toggleHelpBtn が見つかりません");
        }

        // マスタダウンロードボタンのイベントリスナー
        if (downloadMasterDataBtn) {
            downloadMasterDataBtn.addEventListener('click', downloadMasterData);
            console.log("マスタダウンロードボタンのイベントリスナーを設定しました");
        } else {
            console.warn("downloadMasterDataBtn が見つかりません");
        }

        if (masterJsonInput) {
            masterJsonInput.addEventListener('change', (event) => {
                const file = event.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        try {
                            const jsonData = JSON.parse(e.target.result);
                            if (typeof jsonData.employeeData !== 'object' || jsonData.employeeData === null) {
                                throw new Error('JSONに "employeeData" が見つからないか、形式が不正です。');
                            }
                            loadedMasterData = jsonData;
                            selectedFileNameSpan.textContent = file.name;
                            showFeedbackMessage(`「${file.name}」をメモリに読み込みました。`, false);
                            updateUIBasedOnMode();
                        } catch (error) {
                            console.error("マスターJSONファイルの読み込み/パースエラー:", error);
                            showFeedbackMessage(`JSONファイルの読み込みに失敗しました: ${error.message}`, true);
                            loadedMasterData = null;
                            selectedFileNameSpan.textContent = "ファイルが選択されていません";
                            updateUIBasedOnMode();
                        }
                    };
                    reader.onerror = () => {
                        showFeedbackMessage("ファイルの読み込み中にエラーが発生しました。", true);
                        loadedMasterData = null;
                        selectedFileNameSpan.textContent = "ファイルが選択されていません";
                        updateUIBasedOnMode();
                    };
                    reader.readAsText(file);
                }
            });
        }
        
        if (loadMasterJsonBtn) {
            loadMasterJsonBtn.onclick = () => {
                if (currentAppMode !== 'admin' || !loadedMasterData) return;
                if (confirm("選択したファイルの内容で社員マスター情報を更新しますか？\n現在の座席配置は維持されます。")) {
                    try {
                        cardDB = loadedMasterData.employeeData || {};
                        teamColorDefaults = loadedMasterData.teamColors || {};
                        departmentColorDefaults = loadedMasterData.departmentColors || {};

                        populateDepartmentDropdown();
                        populateDepartmentFilterDropdown();
                        renderList(departmentFilterSelect.value);
                        renderFloor();
                        showFeedbackMessage("ファイルからマスターデータを適用しました。変更を永続化するには「サーバに上書保存」を実行してください。", false);
                    } catch(e) {
                         showFeedbackMessage("マスターデータの適用中にエラーが発生しました。", true);
                         console.error(e);
                    }
                }
            }
        }

        if (saveMasterJsonBtn) {
            saveMasterJsonBtn.onclick = async () => {
                if (currentAppMode !== 'admin' || !loadedMasterData) return;
                if (confirm("読み込んでいるファイルの内容で、サーバ上のマスターデータ(initial_data.json)を完全に上書きします。\nこの操作は元に戻せません。本当によろしいですか？")) {
                    try {
                        showFeedbackMessage("サーバにマスターデータを保存中...", false);
                        const response = await fetch('/api/initial-data', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(loadedMasterData)
                        });

                        if (!response.ok) {
                            const errorData = await response.json().catch(() => ({ message: 'サーバからのエラー詳細不明' }));
                            throw new Error(`サーバ保存エラー (${response.status}): ${errorData.message || response.statusText}`);
                        }
                        await response.json();
                        showFeedbackMessage("サーバのマスターデータを正常に上書き保存しました。", false);
                    } catch (error) {
                        console.error("マスターデータのサーバ保存に失敗しました:", error);
                        showFeedbackMessage(`マスターデータの保存に失敗しました: ${error.message}`, true);
                    }
                }
            };
        }

        if (reloadMasterDataBtn) {
            reloadMasterDataBtn.onclick = () => {
                if(currentAppMode !== 'admin') return;
                loadInitialServerData(false);
            };
        }
    }

    // 部署範囲リサイズ機能
    let isResizingZone = false;
    let resizingZoneData = null;

    function initializeDeptZoneResize() {
        document.addEventListener('mousedown', handleResizeStart);
        document.addEventListener('mousemove', handleResizeMove);
        document.addEventListener('mouseup', handleResizeEnd);
    }

    function handleResizeStart(e) {
        if (currentAppMode !== 'admin') return;
        
        const handle = e.target.closest('.dept-zone-resize-handle');
        if (!handle) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        isResizingZone = true;
        handle.classList.add('active');
        
        const zoneIndex = parseInt(handle.dataset.zoneIndex);
        const rowType = handle.dataset.rowType;
        const side = handle.dataset.side;
        
        resizingZoneData = {
            zoneIndex,
            rowType,
            side,
            handle,
            startX: e.clientX,
            originalZone: JSON.parse(JSON.stringify(departmentZoneSettings[rowType][zoneIndex]))
        };
        
        document.body.style.cursor = 'ew-resize';
    }

    function handleResizeMove(e) {
        if (!isResizingZone || !resizingZoneData) return;
        
        e.preventDefault();
        
        const deltaX = e.clientX - resizingZoneData.startX;
        const headerElement = document.getElementById(
            resizingZoneData.rowType === 'topRow' ? 'departmentZoneHeaderTop' : 'departmentZoneHeaderBottom'
        );
        
        if (!headerElement) return;
        
        const headerRect = headerElement.getBoundingClientRect();
        const seatWidth = headerRect.width / seatsPerRow;
        const seatsDelta = Math.round(deltaX / seatWidth);
        
        const zone = resizingZoneData.originalZone;
        const zones = departmentZoneSettings[resizingZoneData.rowType];
        
        let newStartIndex = zone.startSeatIndex;
        let newEndIndex = zone.endSeatIndex;
        
        if (resizingZoneData.side === 'left') {
            newStartIndex = Math.max(0, zone.startSeatIndex + seatsDelta);
            newStartIndex = Math.min(newStartIndex, zone.endSeatIndex);
        } else {
            newEndIndex = Math.min(seatsPerRow - 1, zone.endSeatIndex + seatsDelta);
            newEndIndex = Math.max(newEndIndex, zone.startSeatIndex);
        }
        
        // 衝突検出と自動縮小
        const { adjustedStart, adjustedEnd } = resolveZoneCollisions(
            resizingZoneData.zoneIndex,
            resizingZoneData.rowType,
            newStartIndex,
            newEndIndex
        );
        
        // 更新されたゾーンを適用
        zones[resizingZoneData.zoneIndex] = {
            ...zone,
            startSeatIndex: adjustedStart,
            endSeatIndex: adjustedEnd
        };
        
        renderDepartmentZoneHeaders();
    }

    function handleResizeEnd(e) {
        if (!isResizingZone) return;
        
        if (resizingZoneData?.handle) {
            resizingZoneData.handle.classList.remove('active');
        }
        
        isResizingZone = false;
        resizingZoneData = null;
        document.body.style.cursor = '';
        
        // フィードバックメッセージ表示
        showFeedbackMessage("部署範囲を変更しました。サーバ保存または下書き保存を行ってください。", false);
    }

    function resolveZoneCollisions(excludeIndex, rowType, newStart, newEnd) {
        const zones = departmentZoneSettings[rowType];
        let adjustedStart = newStart;
        let adjustedEnd = newEnd;
        
        // 他のゾーンとの衝突をチェック
        zones.forEach((otherZone, index) => {
            if (index === excludeIndex) return;
            
            const otherStart = otherZone.startSeatIndex;
            const otherEnd = otherZone.endSeatIndex;
            
            // 新しい範囲が他のゾーンと重複する場合
            if (!(adjustedEnd < otherStart || adjustedStart > otherEnd)) {
                // 左側のハンドルを動かしている場合
                if (adjustedStart <= otherEnd && adjustedStart >= otherStart) {
                    // 他のゾーンの右端を縮小
                    zones[index] = {
                        ...otherZone,
                        endSeatIndex: Math.max(otherStart, adjustedStart - 1)
                    };
                }
                
                // 右側のハンドルを動かしている場合
                if (adjustedEnd >= otherStart && adjustedEnd <= otherEnd) {
                    // 他のゾーンの左端を縮小
                    zones[index] = {
                        ...otherZone,
                        startSeatIndex: Math.min(otherEnd, adjustedEnd + 1)
                    };
                }
                
                // 完全に覆い隠す場合は、他のゾーンを最小サイズに縮小
                if (adjustedStart <= otherStart && adjustedEnd >= otherEnd) {
                    zones[index] = {
                        ...otherZone,
                        startSeatIndex: otherStart,
                        endSeatIndex: otherStart
                    };
                }
            }
        });
        
        return { adjustedStart, adjustedEnd };
    }

    // --- 部署ゾーンクリック用ドロップダウン機能 ---
    let currentDropdownData = null; // 現在のドロップダウンデータ { rowType, zoneIndex, originalDeptName }
    
    function initializeDeptZoneClickDropdown() {
        const dropdown = document.getElementById('deptZoneClickDropdown');
        const select = document.getElementById('deptZoneClickSelect');
        const cancelBtn = document.getElementById('deptZoneClickCancel');
        const confirmBtn = document.getElementById('deptZoneClickConfirm');
        
        if (!dropdown || !select || !cancelBtn || !confirmBtn) {
            console.error('部署ゾーンクリック用ドロップダウン要素が見つかりません');
            return;
        }
        
        // キャンセルボタンのイベント
        cancelBtn.addEventListener('click', hideDeptZoneClickDropdown);
        
        // 確定ボタンのイベント
        confirmBtn.addEventListener('click', handleDeptZoneChange);
        
        // 外部クリック時にドロップダウンを閉じる
        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target) && dropdown.style.display !== 'none') {
                hideDeptZoneClickDropdown();
            }
        });
        
        // ESCキーでドロップダウンを閉じる
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && dropdown.style.display !== 'none') {
                hideDeptZoneClickDropdown();
            }
        });
    }
    
    function showDeptZoneClickDropdown(event, rowType, zoneIndex) {
        const dropdown = document.getElementById('deptZoneClickDropdown');
        const select = document.getElementById('deptZoneClickSelect');
        
        if (!dropdown || !select) return;
        
        // 現在のゾーン情報を取得
        const currentZone = departmentZoneSettings[rowType]?.[zoneIndex];
        if (!currentZone) return;
        
        // ドロップダウンデータを保存
        currentDropdownData = {
            rowType,
            zoneIndex,
            originalDeptName: currentZone.deptName
        };
        
        // 部署選択肢を設定
        populateDeptZoneClickSelect(select, currentZone.deptName);
        
        // ドロップダウンの位置を設定
        const rect = event.target.getBoundingClientRect();
        dropdown.style.left = `${rect.left + window.scrollX}px`;
        dropdown.style.top = `${rect.bottom + window.scrollY + 5}px`;
        
        // ドロップダウンを表示
        dropdown.style.display = 'block';
        select.focus();
        
        event.stopPropagation();
    }
    
    function populateDeptZoneClickSelect(select, currentDeptName) {
        if (!select) return;
        
        select.innerHTML = '<option value="">-- 部署を選択 --</option>';
        
        // 全部署を取得
        const depts = new Set(Object.values(cardDB).map(emp => emp?.dept).filter(Boolean));
        
        if (depts.size === 0) {
            select.add(new Option("利用可能な部署なし", ""));
            return;
        }
        
        // 部署をソートして選択肢に追加
        Array.from(depts).sort().forEach(dept => {
            const option = new Option(dept, dept);
            if (dept === currentDeptName) {
                option.selected = true;
            }
            select.add(option);
        });
    }
    
    function hideDeptZoneClickDropdown() {
        const dropdown = document.getElementById('deptZoneClickDropdown');
        if (dropdown) {
            dropdown.style.display = 'none';
        }
        currentDropdownData = null;
    }
    
    function handleDeptZoneChange() {
        const select = document.getElementById('deptZoneClickSelect');
        
        if (!select || !currentDropdownData) return;
        
        const newDeptName = select.value;
        if (!newDeptName) {
            showFeedback('部署を選択してください', 'error');
            return;
        }
        
        const { rowType, zoneIndex, originalDeptName } = currentDropdownData;
        
        // 同じ部署名の場合は何もしない
        if (newDeptName === originalDeptName) {
            hideDeptZoneClickDropdown();
            return;
        }
        
        // 部署名を変更
        if (departmentZoneSettings[rowType] && departmentZoneSettings[rowType][zoneIndex]) {
            departmentZoneSettings[rowType][zoneIndex].deptName = newDeptName;
            
            // 部署に対応する色を自動設定
            const newColor = departmentColorDefaults[newDeptName] || departmentColorDefaults['unknown'] || '#FFDDC1';
            departmentZoneSettings[rowType][zoneIndex].color = newColor;
            
            // 表示を更新
            renderDepartmentZoneHeaders();
            
            // フィードバック表示
            showFeedback(`部署を「${originalDeptName}」から「${newDeptName}」に変更しました`, 'success');
        }
        
        hideDeptZoneClickDropdown();
    }

    // リサイズ機能を初期化
    initializeDeptZoneResize();
    initializeDeptZoneClickDropdown();
    
    console.log('=== Script execution completed successfully ===');
    } catch (error) {
        console.error('=== Script execution error ===', error);
        console.error('Error stack:', error.stack);
    }
});
