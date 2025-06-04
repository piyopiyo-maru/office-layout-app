  document.addEventListener('DOMContentLoaded', () => {
    // --- 定数定義 ---
    const rows = 4, cols = 2;
    const totalIslands = 22;
    const islandsPerRow = 11;
    const seatsPerIslandRow = cols;
    const seatsPerRow = islandsPerRow * seatsPerIslandRow;
    const numTopSideCabinets = 9;
    const numBottomSideCabinets = 7;
    const numNewTopCabinets = 6;
    const floorIds = ['3F', '4F'];
    let currentFloorId = floorIds[0];
    let currentEditingRowType = 'topRow';
    let allFloorData = {};
    let seatMap = [];
    let mergedSeats = [];
    let memoData = {};
    let departmentZoneSettings = { topRow: [], bottomRow: [] };

    // --- 社員情報データベース (空オブジェクト) ---
    let cardDB = {};
    let teamColorDefaults = {};
    let departmentColorDefaults = {};
    // --- レイアウトバージョン管理 ---
    let currentLayoutVersion = {};

    const LS_KEY_MULTI_FLOOR = 'seating-layout-multi-floor-zones-v1';
    const ADMIN_PASSWORD = "password123";
    let currentAppMode = 'view';

    // サーバーからレイアウトを読み込む関数
    async function loadLayoutFromServer(isInitialLoad = false) {
        if (currentAppMode === 'view' && !isInitialLoad) {
            showFeedbackMessage("閲覧モードではサーバーから読み込めません。", true);
            return;
        }
        if (!isInitialLoad && !confirm("現在の編集内容は破棄され、サーバーから最新のレイアウトを読み込みます。よろしいですか？")) {
            return;
        }

        try {
            const response = await fetch('/api/layouts/default');
            if (!response.ok) {
                if (response.status === 404) { // レイアウトがまだ存在しない
                    showFeedbackMessage("サーバーに保存されたレイアウトはありません。新規レイアウトで開始します。", false);
                    initializeAllFloorData(); // 全フロアデータを初期化
                    currentLayoutVersion = 0; // 新規作成時はバージョン0など、サーバーと合わせる
                    switchFloor(currentFloorId, true);
                    return;
                }
                throw new Error(`サーバーからのレイアウト読み込みエラー: ${response.status}`);
            }
            const serverResponse = await response.json();
            currentLayoutVersion = serverResponse._version;
            allFloorData = serverResponse.layout;

            // データ構造の整合性を確認・修復 (既存のinitializeAllFloorDataのロジックを参考にする)
            floorIds.forEach(id => {
                if (!allFloorData[id]) {
                    allFloorData[id] = initializeNewFloorData();
                } else {
                    const floorSpecificData = allFloorData[id];
                    allFloorData[id] = {
                        seatMap: floorSpecificData.seatMap || Array.from({ length: totalIslands }, () => Array.from({ length: rows }, () => Array(cols).fill(null))),
                        mergedSeats: (floorSpecificData.mergedSeats && Array.isArray(floorSpecificData.mergedSeats)) ? floorSpecificData.mergedSeats : [],
                        memoData: (typeof floorSpecificData.memoData === 'object' && floorSpecificData.memoData !== null) ? floorSpecificData.memoData : {},
                        departmentZones: (typeof floorSpecificData.departmentZones === 'object' && floorSpecificData.departmentZones !== null) ? floorSpecificData.departmentZones : { topRow: [], bottomRow: [] }
                    };
                }
            });

            switchFloor(currentFloorId, true); // isInitialLoad を true にして、現在のフロアデータを正しく設定
            showFeedbackMessage(`サーバーからレイアウトを読み込みました (バージョン: ${currentLayoutVersion})`, false);
        } catch (error) {
            console.error("サーバーからのレイアウト読み込みに失敗しました:", error);
            showFeedbackMessage("サーバーからのレイアウト読み込みに失敗しました。", true);
        }
    }

    // サーバーへレイアウトを保存する関数
    async function saveLayoutToServer() {
        if (currentAppMode === 'view') {
            showFeedbackMessage("閲覧モードでは保存できません。", true);
            return;
        }

        // 現在のフロアのローカルな変更を allFloorData に反映
        if (allFloorData[currentFloorId]) {
            allFloorData[currentFloorId] = {
                seatMap: JSON.parse(JSON.stringify(seatMap)),
                mergedSeats: JSON.parse(JSON.stringify(mergedSeats)),
                memoData: JSON.parse(JSON.stringify(memoData)),
                departmentZones: JSON.parse(JSON.stringify(departmentZoneSettings))
            };
        }

        const payload = {
            _version: currentLayoutVersion, // クライアントが知っているバージョン
            layout: allFloorData         // 送信するレイアウトデータ全体 (パッチではない)
        };

        try {
            const response = await fetch('/api/layouts/default', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const result = await response.json();
                currentLayoutVersion = result._newVersion; // サーバーからの新しいバージョン
                // サーバーから返された最新のレイアウトでクライアントの状態を更新 (任意だが推奨)
                // allFloorData = result.layout;
                // switchFloor(currentFloorId, true);
                showFeedbackMessage(`レイアウトをサーバーに保存しました (新バージョン: ${currentLayoutVersion})`, false);
            } else if (response.status === 409) { // Conflict
                showFeedbackMessage("競合が発生しました。最新のレイアウトを読み込みます。", true);
                await loadLayoutFromServer(true); // 強制的に最新をロード
                alert("レイアウトが他で更新されました。最新版を読み込んだので、再度編集・保存してください。");
            } else {
                const errorText = await response.text();
                throw new Error(`サーバー保存エラー: ${response.status} - ${errorText}`);
            }
        } catch (error) {
            console.error("サーバーへのレイアウト保存に失敗しました:", error);
            showFeedbackMessage(`サーバー保存失敗: ${error.message}`, true);
        }
    }

    // サーバーからレイアウトを読み込む関数
    async function loadLayoutFromServer(isInitialLoad = false) {
        if (currentAppMode === 'view' && !isInitialLoad) {
            showFeedbackMessage("閲覧モードではサーバーから読み込めません。", true);
            return;
        }
        if (!isInitialLoad && !confirm("現在の編集内容は破棄され、サーバーから最新のレイアウトを読み込みます。よろしいですか？")) {
            return;
        }

        try {
            const response = await fetch('/api/layouts/default');
            if (!response.ok) {
                if (response.status === 404) { // レイアウトがまだ存在しない
                    showFeedbackMessage("サーバーに保存されたレイアウトはありません。新規レイアウトで開始します。", false);
                    initializeAllFloorData(); // 全フロアデータを初期化
                    currentLayoutVersion = 0; // 新規作成時はバージョン0など、サーバーと合わせる
                    switchFloor(currentFloorId, true);
                    return;
                }
                throw new Error(`サーバーからのレイアウト読み込みエラー: ${response.status}`);
            }
            const serverResponse = await response.json();
            currentLayoutVersion = serverResponse._version;
            allFloorData = serverResponse.layout;

            // データ構造の整合性を確認・修復 (既存のinitializeAllFloorDataのロジックを参考にする)
            floorIds.forEach(id => {
                if (!allFloorData[id]) {
                    allFloorData[id] = initializeNewFloorData();
                } else {
                    const floorSpecificData = allFloorData[id];
                    allFloorData[id] = {
                        seatMap: floorSpecificData.seatMap || Array.from({ length: totalIslands }, () => Array.from({ length: rows }, () => Array(cols).fill(null))),
                        mergedSeats: (floorSpecificData.mergedSeats && Array.isArray(floorSpecificData.mergedSeats)) ? floorSpecificData.mergedSeats : [],
                        memoData: (typeof floorSpecificData.memoData === 'object' && floorSpecificData.memoData !== null) ? floorSpecificData.memoData : {},
                        departmentZones: (typeof floorSpecificData.departmentZones === 'object' && floorSpecificData.departmentZones !== null) ? floorSpecificData.departmentZones : { topRow: [], bottomRow: [] }
                    };
                }
            });

            switchFloor(currentFloorId, true); // isInitialLoad を true にして、現在のフロアデータを正しく設定
            showFeedbackMessage(`サーバーからレイアウトを読み込みました (バージョン: ${currentLayoutVersion})`, false);
        } catch (error) {
            console.error("サーバーからのレイアウト読み込みに失敗しました:", error);
            showFeedbackMessage("サーバーからのレイアウト読み込みに失敗しました。", true);
        }
    }

    // サーバーへレイアウトを保存する関数
    async function saveLayoutToServer() {
        if (currentAppMode === 'view') {
            showFeedbackMessage("閲覧モードでは保存できません。", true);
            return;
        }

        // 現在のフロアのローカルな変更を allFloorData に反映
        if (allFloorData[currentFloorId]) {
            allFloorData[currentFloorId] = {
                seatMap: JSON.parse(JSON.stringify(seatMap)),
                mergedSeats: JSON.parse(JSON.stringify(mergedSeats)),
                memoData: JSON.parse(JSON.stringify(memoData)),
                departmentZones: JSON.parse(JSON.stringify(departmentZoneSettings))
            };
        }

        const payload = {
            _version: currentLayoutVersion, // クライアントが知っているバージョン
            layout: allFloorData         // 送信するレイアウトデータ全体 (パッチではない)
        };

        try {
            const response = await fetch('/api/layouts/default', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const result = await response.json();
                currentLayoutVersion = result._newVersion; // サーバーからの新しいバージョン
                // サーバーから返された最新のレイアウトでクライアントの状態を更新 (任意だが推奨)
                // allFloorData = result.layout;
                // switchFloor(currentFloorId, true);
                showFeedbackMessage(`レイアウトをサーバーに保存しました (新バージョン: ${currentLayoutVersion})`, false);
            } else if (response.status === 409) { // Conflict
                showFeedbackMessage("競合が発生しました。最新のレイアウトを読み込みます。", true);
                await loadLayoutFromServer(true); // 強制的に最新をロード
                alert("レイアウトが他で更新されました。最新版を読み込んだので、再度編集・保存してください。");
            } else {
                const errorText = await response.text();
                throw new Error(`サーバー保存エラー: ${response.status} - ${errorText}`);
            }
        } catch (error) {
            console.error("サーバーへのレイアウト保存に失敗しました:", error);
            showFeedbackMessage(`サーバー保存失敗: ${error.message}`, true);
        }
    }

    // --- DOM要素取得 ---
    const feedbackMessageDiv = document.getElementById('feedbackMessage');
    const currentFloorNameDisplay = document.getElementById('currentFloorName');
    const switchFloorButton = document.getElementById('switchFloorButton');
    const sidePanelWrapper = document.querySelector('.side-panel-wrapper');
    const employeeListPanel = document.getElementById('employeeList');
    const departmentFilterSelect = document.getElementById('departmentFilter');
    const resetFilterBtn = document.getElementById('resetFilterBtn');
    const toggleBtn = document.getElementById('toggleListBtn');
    const mergeBtn = document.getElementById('mergeBtn');
    const jsonInput = document.getElementById('jsonInput');
    const topCabinetDiv = document.getElementById('topCabinet');
    const sideCabinetsContainer = document.getElementById('sideCabinetsContainer');
    const saveDraftBtn = document.getElementById('saveDraftBtn');
    const loadDraftBtn = document.getElementById('loadDraftBtn');
    const saveServerBtn = document.getElementById('saveServerBtn');
    const loadServerBtn = document.getElementById('loadServerBtn');
    const controlsToggleBtn = document.getElementById('controlsToggleBtn');
    const controlsPanel = document.getElementById('controlsPanel');
    const enterAdminModeBtn = document.getElementById('enterAdminModeBtn');
    const exitAdminModeBtn = document.getElementById('exitAdminModeBtn');
    const deptZoneSettingsBtn = document.getElementById('deptZoneSettingsBtn');
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

    // 印刷設定関連のDOM要素
    const htmlElement = document.documentElement;
    const togglePrintControlsBtn = document.getElementById('togglePrintControlsBtn');
    const printControlsDiv = document.getElementById('printControls');
    const printA4SetupBtn = document.getElementById('printA4SetupBtn');
    const printA3SetupBtn = document.getElementById('printA3SetupBtn');


    let selectedEmpNo = null, selectedCell = null, mergeMode = false;
    let tempDepartmentZones = { topRow: [], bottomRow: [] };

    function setAppMode(newMode) {
      if (newMode !== 'view' && newMode !== 'admin') return;
      currentAppMode = newMode;
      document.body.className = currentAppMode + '-mode';
      updateUIBasedOnMode();
      if (newMode === 'view') {
        if (sidePanelWrapper) sidePanelWrapper.style.display = 'none';
        if (toggleBtn) { toggleBtn.textContent = 'リスト表示'; toggleBtn.classList.remove('active'); }
        if (controlsPanel) {
            controlsPanel.classList.remove('active');
            if (controlsToggleBtn) controlsToggleBtn.innerHTML = '<i class="fa-solid fa-gear"></i>'; // 閉じたときは歯車
        }
      }
    }

    function updateUIBasedOnMode() {
      const isAdminMode = currentAppMode === 'admin';
      if (enterAdminModeBtn) enterAdminModeBtn.style.display = isAdminMode ? 'none' : '';
      if (exitAdminModeBtn) exitAdminModeBtn.style.display = isAdminMode ? '' : 'none';

      if (togglePrintControlsBtn) togglePrintControlsBtn.disabled = false;

      if (printControlsDiv && printControlsDiv.classList.contains('active')) {
          if (printA4SetupBtn) printA4SetupBtn.disabled = false;
          if (printA3SetupBtn) printA3SetupBtn.disabled = false;
      } else {
          if (printA4SetupBtn) printA4SetupBtn.disabled = true;
          if (printA3SetupBtn) printA3SetupBtn.disabled = true;
      }

      if (jsonInput) jsonInput.disabled = !isAdminMode;
      employeeListPanel.querySelectorAll('.employee-item').forEach(item => item.style.cursor = isAdminMode ? 'grab' : 'default');
      ['toggleListBtn', 'deptZoneSettingsBtn', 'upBtn', 'leftBtn', 'downBtn', 'rightBtn', 'mergeBtn', 'saveLocalBtn', 'loadLocalBtn']
        .forEach(id => { const btn = document.getElementById(id); if (btn) btn.disabled = !isAdminMode; });

      document.querySelectorAll('.memo-input').forEach(input => {
        input.disabled = !isAdminMode;
        if (!isAdminMode && input.style.display !== 'none') {
          const memoSection = input.closest('.memo-section');
          if (memoSection) { const memoDisplay = memoSection.querySelector('.memo-display'); input.style.display = 'none'; if (memoDisplay) memoDisplay.style.display = 'flex';}
        }
      });
      if (mergeBtn) {
        mergeBtn.disabled = !isAdminMode;
        if (!isAdminMode && mergeMode) { mergeMode = false; mergeBtn.classList.remove('active'); mergeBtn.textContent = '＋'; renderFloor(); }
      }
      if(toggleBtn) toggleBtn.disabled = !isAdminMode;
      if (saveDeptZoneSettingsBtn) saveDeptZoneSettingsBtn.disabled = !isAdminMode;
      if (addOrUpdateDeptZoneBtn) addOrUpdateDeptZoneBtn.disabled = !isAdminMode;
      if (deptZoneNameSelect) deptZoneNameSelect.disabled = !isAdminMode;
      if (deptZoneStartInput) deptZoneStartInput.disabled = !isAdminMode;
      if (deptZoneEndInput) deptZoneEndInput.disabled = !isAdminMode;
      if (deptZoneColorInput) deptZoneColorInput.disabled = !isAdminMode;
      document.querySelectorAll('#currentDeptZonesList .edit-zone-btn, #currentDeptZonesList .delete-zone-btn').forEach(btn => {
          btn.disabled = !isAdminMode; btn.style.opacity = isAdminMode ? '1' : '0.5'; btn.style.pointerEvents = isAdminMode ? 'auto' : 'none';
      });
      if(departmentFilterSelect) departmentFilterSelect.disabled = !isAdminMode;
      if(resetFilterBtn) resetFilterBtn.disabled = !isAdminMode;
    }

    function initializeNewFloorData() { return { seatMap: Array.from({ length: totalIslands }, () => Array.from({ length: rows }, () => Array(cols).fill(null))), mergedSeats: [], memoData: {}, departmentZones: { topRow: [], bottomRow: [] } }; }
    function initializeAllFloorData(loadedData = null) { const sourceData = loadedData || allFloorData; const newAllFloorData = {}; floorIds.forEach(id => { const floorSpecificData = sourceData[id] || {}; newAllFloorData[id] = { seatMap: Array.from({ length: totalIslands }, () => Array.from({ length: rows }, () => Array(cols).fill(null))), mergedSeats: (floorSpecificData.mergedSeats && Array.isArray(floorSpecificData.mergedSeats)) ? JSON.parse(JSON.stringify(floorSpecificData.mergedSeats)) : [], memoData: (typeof floorSpecificData.memoData === 'object' && floorSpecificData.memoData !== null) ? JSON.parse(JSON.stringify(floorSpecificData.memoData)) : {}, departmentZones: (typeof floorSpecificData.departmentZones === 'object' && floorSpecificData.departmentZones !== null) ? JSON.parse(JSON.stringify(floorSpecificData.departmentZones)) : { topRow: [], bottomRow: [] } }; if (floorSpecificData.seatMap && Array.isArray(floorSpecificData.seatMap)) { for (let i = 0; i < totalIslands; i++) { if (!newAllFloorData[id].seatMap[i]) newAllFloorData[id].seatMap[i] = Array.from({ length: rows }, () => Array(cols).fill(null)); if (i < floorSpecificData.seatMap.length && floorSpecificData.seatMap[i] && Array.isArray(floorSpecificData.seatMap[i])) { for (let r = 0; r < rows; r++) { if(!newAllFloorData[id].seatMap[i][r]) newAllFloorData[id].seatMap[i][r] = Array(cols).fill(null); if (r < floorSpecificData.seatMap[i].length && floorSpecificData.seatMap[i][r] && Array.isArray(floorSpecificData.seatMap[i][r])) { for (let c = 0; c < cols; c++) newAllFloorData[id].seatMap[i][r][c] = (c < floorSpecificData.seatMap[i][r].length) ? (floorSpecificData.seatMap[i][r][c] ?? null) : null; } else for (let c = 0; c < cols; c++) newAllFloorData[id].seatMap[i][r][c] = null; } } else for (let r = 0; r < rows; r++) newAllFloorData[id].seatMap[i][r] = Array(cols).fill(null); } } if (!newAllFloorData[id].departmentZones || typeof newAllFloorData[id].departmentZones !== 'object') newAllFloorData[id].departmentZones = { topRow: [], bottomRow: [] }; if (!Array.isArray(newAllFloorData[id].departmentZones.topRow)) newAllFloorData[id].departmentZones.topRow = []; if (!Array.isArray(newAllFloorData[id].departmentZones.bottomRow)) newAllFloorData[id].departmentZones.bottomRow = []; }); allFloorData = newAllFloorData; }
    function renderDepartmentZoneHeaders() { const topHeader = document.getElementById('departmentZoneHeaderTop'); const bottomHeader = document.getElementById('departmentZoneHeaderBottom'); if (!topHeader || !bottomHeader) return; topHeader.innerHTML = ''; bottomHeader.innerHTML = ''; topHeader.style.gridTemplateColumns = `repeat(${seatsPerRow}, 1fr)`; bottomHeader.style.gridTemplateColumns = `repeat(${seatsPerRow}, 1fr)`; const currentZones = departmentZoneSettings; if (currentZones?.topRow?.length) { currentZones.topRow.forEach(zone => { if (typeof zone.startSeatIndex !== 'number' || typeof zone.endSeatIndex !== 'number') return; const block = document.createElement('div'); block.className = 'dept-zone-block'; block.textContent = zone.deptName; block.style.gridColumn = `${zone.startSeatIndex + 1} / span ${Math.max(1, zone.endSeatIndex - zone.startSeatIndex + 1)}`; block.style.backgroundColor = zone.color || '#f0f0f0'; topHeader.appendChild(block); }); } if (currentZones?.bottomRow?.length) {  currentZones.bottomRow.forEach(zone => { if (typeof zone.startSeatIndex !== 'number' || typeof zone.endSeatIndex !== 'number') return; const block = document.createElement('div'); block.className = 'dept-zone-block'; block.textContent = zone.deptName; block.style.gridColumn = `${zone.startSeatIndex + 1} / span ${Math.max(1, zone.endSeatIndex - zone.startSeatIndex + 1)}`; block.style.backgroundColor = zone.color || '#f0f0f0'; bottomHeader.appendChild(block); }); } }

    function updatePrintHeader() {
      const header = document.getElementById('printFloorHeader');
      if (header) {
        header.textContent = `ＴＣＳＳ座席表 - ${currentFloorId}`;
      }
    }

    function switchFloor(newFloorId, isInitialLoad = false) {
      if (!floorIds.includes(newFloorId)) return;
      if (!isInitialLoad && allFloorData[currentFloorId]) {
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
      seatMap = JSON.parse(JSON.stringify(targetFloorData.seatMap || initializeNewFloorData().seatMap));
      mergedSeats = JSON.parse(JSON.stringify(targetFloorData.mergedSeats || []));
      memoData = JSON.parse(JSON.stringify(targetFloorData.memoData || {}));
      departmentZoneSettings = JSON.parse(JSON.stringify(targetFloorData.departmentZones || { topRow: [], bottomRow: [] }));
      if (!seatMap || seatMap.length !== totalIslands || !seatMap.every(island => Array.isArray(island) && island.length === rows && island.every(row => Array.isArray(row) && row.length === cols))) {
        seatMap = Array.from({ length: totalIslands }, () => Array.from({ length: rows }, () => Array(cols).fill(null)));
        if(allFloorData[currentFloorId]) allFloorData[currentFloorId].seatMap = JSON.parse(JSON.stringify(seatMap));
      }
      renderFloor();
      renderDepartmentZoneHeaders();
      renderList(departmentFilterSelect ? departmentFilterSelect.value : "");
      updateFloorDisplayAndSwitcher();
      document.body.style.backgroundColor = currentFloorId === '3F' ? '#e3f2fd' : currentFloorId === '4F' ? '#e8f5e9' : '#f5f5f5';
      updatePrintHeader();
      if (!isInitialLoad) showFeedbackMessage(`${currentFloorId} を表示しました。`);
    }

    function updateFloorDisplayAndSwitcher() {
      if (currentFloorNameDisplay) currentFloorNameDisplay.textContent = `現在のフロア: ${currentFloorId}`;
      if (switchFloorButton) {
        const nextFloorId = floorIds[(floorIds.indexOf(currentFloorId) + 1) % floorIds.length];
        switchFloorButton.textContent = `${nextFloorId}へ移動`;
        switchFloorButton.dataset.targetFloor = nextFloorId;
      }
    }
    function showFeedbackMessage(message, isError = false) { if (feedbackMessageDiv) { feedbackMessageDiv.textContent = message; feedbackMessageDiv.style.backgroundColor = isError ? '#f44336' : '#4CAF50'; feedbackMessageDiv.style.display = 'block'; feedbackMessageDiv.style.opacity = '1'; setTimeout(() => { feedbackMessageDiv.style.opacity = '0'; setTimeout(() => { feedbackMessageDiv.style.display = 'none'; }, 500); }, 2000); } else alert(message); }
    function saveToLocal() {
      if (currentAppMode === 'view') { showFeedbackMessage("閲覧モードでは保存できません。", true); return; }
      if (allFloorData[currentFloorId]) {
        allFloorData[currentFloorId] = {
          seatMap: JSON.parse(JSON.stringify(seatMap)),
          mergedSeats: JSON.parse(JSON.stringify(mergedSeats)),
          memoData: JSON.parse(JSON.stringify(memoData)),
          departmentZones: JSON.parse(JSON.stringify(departmentZoneSettings))
        };
      } else {
        allFloorData[currentFloorId] = {
          seatMap: JSON.parse(JSON.stringify(seatMap)),
          mergedSeats: JSON.parse(JSON.stringify(mergedSeats)),
          memoData: JSON.parse(JSON.stringify(memoData)),
          departmentZones: JSON.parse(JSON.stringify(departmentZoneSettings))
        };
      }
      localStorage.setItem(LS_KEY_MULTI_FLOOR, JSON.stringify(allFloorData));
      showFeedbackMessage(`現在のフロア(${currentFloorId})のレイアウトを保存しました。`);
    }
    function loadAllFloorDataFromLocal() {
      let loadedRootData = null;
  const embeddedData = ``;

  try {
    if (embeddedData && embeddedData !== 'ここに手順1でコピーした長い文字列を貼り付けます' && embeddedData !== 'null') { // データが実際に貼り付けられているか確認
        loadedRootData = JSON.parse(embeddedData);
        console.log("埋め込みデータからレイアウトを読み込みました。");
    } else {
        // 埋め込みデータがない場合は、従来通りローカルストレージを試みるか、サンプルデータを使用
        const storedData = localStorage.getItem(LS_KEY_MULTI_FLOOR);
        if (storedData) {
            loadedRootData = JSON.parse(storedData);
            console.log("ローカルストレージからレイアウトを読み込みました。");
        } else {
            console.log("埋め込みデータもローカルストレージデータもありません。");
        }
    }
  } catch (e) {
    showFeedbackMessage("埋め込みデータの読み込みに失敗しました。", true);
    console.error("埋め込みデータパースエラー:", e);
    allFloorData = {};
    initializeAllFloorData(allFloorData);
    switchFloor(currentFloorId, true);
    return;
  }
  // ... (以降の処理は変更なし)

      if (loadedRootData) {
        initializeAllFloorData(loadedRootData);
        showFeedbackMessage("全フロアのレイアウトデータをローカルストレージから読み込みました。");
      } else {
        allFloorData = {};
        initializeAllFloorData(allFloorData);
        floorIds.forEach(floorId => {
            if (allFloorData[floorId] && (!allFloorData[floorId].departmentZones || (!allFloorData[floorId].departmentZones.topRow.length && !allFloorData[floorId].departmentZones.bottomRow.length))) {
                if (floorId === '3F') {
                    allFloorData[floorId].departmentZones = {
                        topRow: [
                            { deptName: '業務第一部', startSeatIndex: 0, endSeatIndex: 5, color: '#FFDDC1', deptId: 'zaimu1' },
                            { deptName: '業務第二部', startSeatIndex: 6, endSeatIndex: 13, color: '#D1FFD1', deptId: 'zaimu2' },
                            { deptName: '業務第三部', startSeatIndex: 14, endSeatIndex: 21, color: '#D1D1FF', deptId: 'zeimu' }
                        ],
                        bottomRow: [ { deptName: '開発部', startSeatIndex: 0, endSeatIndex: 9, color: '#FFEEDD', deptId: 'oms' } ]
                    };
                } else if (floorId === '4F') {
                    allFloorData[floorId].departmentZones = {
                        topRow: [
                            { deptName: '営業部', startSeatIndex: 0, endSeatIndex: 9, color: '#FFC0CB', deptId: 'sales' },
                            { deptName: '人事部', startSeatIndex: 10, endSeatIndex: 21, color: '#ADD8E6', deptId: 'hr' }
                        ],
                        bottomRow: []
                    };
                }
            }
        });
        showFeedbackMessage("保存されたフロアデータがありません。サンプルデータで開始します。", false);
      }
      const initialFloorData = allFloorData[currentFloorId] || initializeNewFloorData();
      seatMap = JSON.parse(JSON.stringify(initialFloorData.seatMap));
      mergedSeats = JSON.parse(JSON.stringify(initialFloorData.mergedSeats));
      memoData = JSON.parse(JSON.stringify(initialFloorData.memoData));
      departmentZoneSettings = JSON.parse(JSON.stringify(initialFloorData.departmentZones));
      switchFloor(currentFloorId, true);
    }

    if(saveLocalBtn) saveLocalBtn.onclick = saveToLocal;
    if(loadLocalBtn) loadLocalBtn.onclick = () => {
        const msg = currentAppMode === 'view' ? '閲覧モードです。ローカルデータを読み込むと現在の表示が上書きされます。よろしいですか？' : '現在の全てのフロアの編集内容は破棄され、ローカルストレージから全フロアのレイアウトを読み込みます。よろしいですか？';
        if (confirm(msg)) loadAllFloorDataFromLocal();
    };
    if (switchFloorButton) switchFloorButton.onclick = () => switchFloor(switchFloorButton.dataset.targetFloor);

    function getUnassignedList() { const assignedAcrossAllFloors = new Set(); floorIds.forEach(floorId => { const fd = allFloorData[floorId]; if (fd?.seatMap) fd.seatMap.flat(2).filter(eN => eN).forEach(eN => assignedAcrossAllFloors.add(eN)); }); return Object.keys(cardDB).filter(eN => !assignedAcrossAllFloors.has(eN)); }

    function renderList(filterDept = "") {
      employeeListPanel.querySelectorAll('.employee-item').forEach(el => el.remove());
      let unassignedEmployees = getUnassignedList();
      if (filterDept) unassignedEmployees = unassignedEmployees.filter(empNo => cardDB[empNo]?.dept === filterDept);
      unassignedEmployees.forEach(empNo => {
        const info = cardDB[empNo]; if (!info) return;
        const div = document.createElement('div'); div.className = 'employee-item';
        div.textContent = `${info.empNo} ${info.name} (${info.dept || '部署未定'}) (${info.team || 'チーム未定'})`;
        div.dataset.empNo = empNo;
        const teamColor = teamColorDefaults[info.team] || teamColorDefaults['unknown_team'] || '#fdfdfd';
        div.style.backgroundColor = teamColor;
        div.onclick = () => { if (currentAppMode === 'admin') selectEmployee(div, empNo); };
        employeeListPanel.appendChild(div);
      });
      updateUIBasedOnMode();
    }

    function populateDepartmentFilterDropdown() { if (!departmentFilterSelect) return; const existingValue = departmentFilterSelect.value; departmentFilterSelect.innerHTML = '<option value="">すべての部署</option>'; const depts = new Set(Object.values(cardDB).map(emp => emp?.dept).filter(Boolean)); Array.from(depts).sort().forEach(dept => departmentFilterSelect.add(new Option(dept, dept))); departmentFilterSelect.value = existingValue; }
    function selectEmployee(div, empNo) { if (currentAppMode === 'view') return; employeeListPanel.querySelectorAll('.employee-item.selected').forEach(el => el.classList.remove('selected')); div.classList.add('selected'); selectedEmpNo = empNo; if (selectedCell) selectedCell.classList.remove('selected'); selectedCell = null; }
    if (mergeBtn) { mergeBtn.onclick = () => { if (currentAppMode === 'view') return; mergeMode = !mergeMode; mergeBtn.classList.toggle('active', mergeMode); mergeBtn.textContent = mergeMode ? '－' : '＋'; renderFloor(); }; mergeBtn.textContent = '＋'; }
    function toggleMerge(island, row, col) { if (currentAppMode === 'view' || col !== 0) return; const idx = mergedSeats.findIndex(ms => ms.island === island && ms.row === row && ms.col === col); if (idx >= 0) mergedSeats.splice(idx, 1); else mergedSeats.push({ island, row, col }); renderFloor(); }

    function createCard(empNo) {
      const info = cardDB[empNo];
      if (!info) {
          const card = document.createElement('div'); card.className = 'seat-card';
          card.style.backgroundColor = teamColorDefaults['unknown_team'] || '#eeeeee';
          card.innerHTML = `<div><strong>${empNo}</strong></div><div>(情報なし)</div>`; return card;
      }
      const card = document.createElement('div'); card.className = 'seat-card'; card.dataset.empNo = empNo;
      const teamColor = teamColorDefaults[info.team] || teamColorDefaults['unknown_team'] || '#eeeeee';
      card.style.backgroundColor = teamColor;
      let cardHTML = '';
      if (info.title && info.title !== "0" && info.title !== "一般") cardHTML += `<div>${info.title}</div>`;
      else if (info.title === "0" || info.title === "一般") cardHTML += `<div>&nbsp;</div>`;
      cardHTML += `<div><strong>${info.empNo}</strong></div><div class="employee-name">${info.name}</div> <div>内線: ${info.ext || '-'}</div><div>Tel.: ${info.ctstage || '-'}</div>`;
      card.innerHTML = cardHTML;
      const btn = document.createElement('button'); btn.textContent = '戻す'; btn.className = 'return-btn'; card.appendChild(btn);
      return card;
    }

    function renderAllReturnBtns() { document.querySelectorAll('.seat-cell .return-btn').forEach(btn => { btn.onclick = e => { if (currentAppMode === 'view') return; e.stopPropagation(); const cell = btn.closest('.seat-cell'); const isl = +cell.dataset.island, r = +cell.dataset.row, c = +cell.dataset.col; if (seatMap?.[isl]?.[r]) { seatMap[isl][r][c] = null; if(allFloorData?.[currentFloorId]?.seatMap?.[isl]?.[r]) allFloorData[currentFloorId].seatMap[isl][r][c] = null; } renderList(departmentFilterSelect ? departmentFilterSelect.value : ""); renderFloor(); }; }); }
    function onCellClick(cell) { const isl = +cell.dataset.island, r = +cell.dataset.row, c = +cell.dataset.col; if (isNaN(isl) || isNaN(r) || isNaN(c) || !seatMap?.[isl]?.[r]) { showFeedbackMessage("エラー: 座席データが無効です。", true); return; } if (currentAppMode === 'admin' && mergeMode) { toggleMerge(isl, r, c); return; } if (selectedCell === cell) { cell.classList.remove('selected'); selectedCell = null; } else { if (selectedCell) selectedCell.classList.remove('selected'); cell.classList.add('selected'); selectedCell = cell; } if (currentAppMode === 'admin') { if (selectedEmpNo && seatMap[isl][r][c] === null && selectedCell === cell) { seatMap[isl][r][c] = selectedEmpNo; if (allFloorData?.[currentFloorId]?.seatMap?.[isl]?.[r]) allFloorData[currentFloorId].seatMap[isl][r][c] = selectedEmpNo; selectedEmpNo = null; employeeListPanel.querySelectorAll('.employee-item.selected').forEach(el => el.classList.remove('selected')); renderList(departmentFilterSelect ? departmentFilterSelect.value : ""); renderFloor(); const newSelCell = document.querySelector(`.seat-cell[data-island="${isl}"][data-row="${r}"][data-col="${c}"]`); if (newSelCell) { newSelCell.classList.add('selected'); selectedCell = newSelCell; } return; } if (selectedEmpNo && selectedCell === cell) { selectedEmpNo = null; employeeListPanel.querySelectorAll('.employee-item.selected').forEach(el => el.classList.remove('selected'));} } }
    function createMemoElement(id, type, memoKey, placeholder, groupIndex = 0) { const actualKey = `${type}-${groupIndex}-${id}`; if (!memoData) memoData = {}; if (!memoData[actualKey] || typeof memoData[actualKey] !== 'object') memoData[actualKey] = (type === 'island') ? { left: '', right: '' } : { text: '' }; const memoSection = document.createElement('div'); memoSection.className = `memo-section memo-${memoKey}`; const memoDisplay = document.createElement('div'); memoDisplay.className = 'memo-display'; memoDisplay.textContent = memoData[actualKey][memoKey] || placeholder; const memoInput = document.createElement('textarea'); memoInput.className = 'memo-input'; memoInput.value = memoData[actualKey][memoKey] || ''; memoInput.style.display = 'none'; if (currentAppMode === 'view') memoInput.disabled = true; memoSection.append(memoDisplay, memoInput); memoDisplay.onclick = () => { if (currentAppMode === 'view') return; memoDisplay.style.display = 'none'; memoInput.style.display = 'block'; memoInput.disabled = false; memoInput.focus(); }; memoInput.onblur = () => { if (currentAppMode === 'view') { memoInput.style.display = 'none'; memoDisplay.style.display = 'flex'; return; } if (!memoData[actualKey]) memoData[actualKey] = (type === 'island') ? { left: '', right: '' } : { text: '' }; memoData[actualKey][memoKey] = memoInput.value; memoDisplay.textContent = memoInput.value || placeholder; memoInput.style.display = 'none'; memoDisplay.style.display = 'flex'; }; return memoSection; }
    function renderFloor() { for (let isl = 0; isl < totalIslands; isl++) { const islDiv = document.querySelector(`.grid-island[data-island="${isl}"]`); if (!islDiv) continue; islDiv.innerHTML = ''; const islandCabinet = document.createElement('div'); islandCabinet.className = 'island-cabinet'; islandCabinet.append(createMemoElement(isl, 'island', 'left', '', 0), createMemoElement(isl, 'island', 'right', '', 0)); islDiv.appendChild(islandCabinet); const islandSeatsContainer = document.createElement('div'); islandSeatsContainer.className = 'island-seats-container'; islDiv.appendChild(islandSeatsContainer); for (let r = 0; r < rows; r++) { for (let c = 0; c < cols; c++) { const isMerged = mergedSeats.some(ms => ms.island === isl && ms.row === r && ms.col === c); if (mergedSeats.some(ms => ms.island === isl && ms.row === r && ms.col === c - 1)) continue; const cell = document.createElement('div'); cell.className = 'seat-cell'; cell.dataset.island = isl; cell.dataset.row = r; cell.dataset.col = c; if (selectedCell && +selectedCell.dataset.island === isl && +selectedCell.dataset.row === r && +selectedCell.dataset.col === c) cell.classList.add('selected'); if (isMerged) { cell.classList.add('merged-seat'); cell.style.gridColumn = 'span 2'; if (mergeMode && currentAppMode === 'admin') cell.innerHTML = '<span class="merged-mark">合体席</span>';} const emp = seatMap?.[isl]?.[r]?.[c]; if (emp && cardDB[emp]) { const cardElement = createCard(emp); if (cardElement) cell.appendChild(cardElement); } else if (emp && !cardDB[emp]) cell.innerHTML = `<div class="seat-card" style="background-color: ${teamColorDefaults['unknown_team'] || '#eeeeee'};"><div><strong>${emp}</strong></div><div>(情報読込中...)</div></div>`; else if (!isMerged && !emp) cell.textContent = '空席'; else if (isMerged && !emp && !(mergeMode && currentAppMode === 'admin')) cell.textContent = ''; cell.onclick = () => onCellClick(cell); islandSeatsContainer.appendChild(cell); } } } renderAllReturnBtns(); topCabinetDiv.innerHTML = ''; for (let i = 0; i < numNewTopCabinets; i++) { const cab = document.createElement('div'); cab.className = 'top-cabinet-item'; cab.appendChild(createMemoElement(i, 'top', 'text', '', 0)); topCabinetDiv.appendChild(cab); } sideCabinetsContainer.innerHTML = ''; for (let i = 0; i < numTopSideCabinets; i++) { const cab = document.createElement('div'); cab.className = 'side-cabinet'; cab.appendChild(createMemoElement(i, 'side', 'text', '', 0)); sideCabinetsContainer.appendChild(cab); } sideCabinetsContainer.appendChild(Object.assign(document.createElement('div'), {className: 'cabinet-spacer'})); for (let i = 0; i < numBottomSideCabinets; i++) { const cab = document.createElement('div'); cab.className = 'side-cabinet'; cab.appendChild(createMemoElement(i, 'side', 'text', '', 1)); sideCabinetsContainer.appendChild(cab); } updateUIBasedOnMode(); }
    function moveSelected(direction) { if (currentAppMode === 'view' || !selectedCell) return; let cIsl = +selectedCell.dataset.island, cRow = +selectedCell.dataset.row, cCol = +selectedCell.dataset.col; let tIsl = cIsl, tRow = cRow, tCol = cCol; const isTop = cIsl < islandsPerRow; switch (direction) { case 'up': if (cRow > 0) tRow--; else if (!isTop && (cIsl - islandsPerRow >= 0)) { tIsl = cIsl - islandsPerRow; tRow = rows - 1;} break; case 'down': if (cRow < rows - 1) tRow++; else if (isTop && (cIsl + islandsPerRow < totalIslands)) { tIsl = cIsl + islandsPerRow; tRow = 0;} break; case 'left': if (cCol > 0) tCol--; else if (cIsl % islandsPerRow !== 0) { tIsl--; tCol = cols - 1;} break; case 'right': if (cCol < cols - 1) tCol++; else if ((cIsl + 1) % islandsPerRow !== 0 && cIsl < totalIslands - 1) { tIsl++; tCol = 0;} break; } if (mergedSeats.some(ms => ms.island === tIsl && ms.row === tRow && ms.col === tCol - 1)) tCol--; if (tIsl === cIsl && tRow === cRow && tCol === cCol) return; const origEmp = seatMap?.[cIsl]?.[cRow]?.[cCol]; const targetEmp = seatMap?.[tIsl]?.[tRow]?.[tCol]; if(seatMap?.[tIsl]?.[tRow]) seatMap[tIsl][tRow][tCol] = origEmp; if(seatMap?.[cIsl]?.[cRow]) seatMap[cIsl][cRow][cCol] = targetEmp; renderFloor(); const newSelCell = document.querySelector(`.seat-cell[data-island="${tIsl}"][data-row="${tRow}"][data-col="${tCol}"]`); if (newSelCell) { document.querySelectorAll('.seat-cell.selected').forEach(el => el.classList.remove('selected')); newSelCell.classList.add('selected'); selectedCell = newSelCell; } else selectedCell = null; }

    document.addEventListener('keydown', e => { if (currentAppMode === 'view' || !selectedCell || ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return; if (e.key.startsWith('Arrow')) { moveSelected(e.key.replace('Arrow', '').toLowerCase()); e.preventDefault(); }});
    ['up', 'down', 'left', 'right'].forEach(dir => { const btn = document.getElementById(dir + 'Btn'); if (btn) btn.onclick = () => moveSelected(dir); });
    if (toggleBtn) { toggleBtn.onclick = () => { if (currentAppMode === 'view') return; const isHidden = sidePanelWrapper.style.display === 'none'; sidePanelWrapper.style.display = isHidden ? 'flex' : 'none'; toggleBtn.textContent = isHidden ? 'リスト非表示' : 'リスト表示'; toggleBtn.classList.toggle('active', !isHidden); }; }

    if (jsonInput) {
        jsonInput.addEventListener('change', (event) => {
          if (currentAppMode === 'view') { showFeedbackMessage("閲覧モードではJSONを読み込めません。", true); event.target.value = ''; return; }
          const file = event.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
              try {
                const jsonData = JSON.parse(e.target.result); let newEmployeeData = null;
                if (jsonData.employeeData && Array.isArray(jsonData.employeeData)) newEmployeeData = jsonData.employeeData;
                else if (Array.isArray(jsonData)) { newEmployeeData = jsonData; console.warn("旧フォーマットの社員JSON読み込み: teamColors/departmentColorsキーなし"); }
                else if (jsonData.cardDB && typeof jsonData.cardDB === 'object') { newEmployeeData = Object.values(jsonData.cardDB); console.warn("旧フォーマット社員JSON(cardDB)読み込み: teamColors/departmentColorsキーなし");}

                if (newEmployeeData) { const newCardDB = {}; newEmployeeData.forEach(emp => { if(emp?.empNo) newCardDB[emp.empNo] = emp; }); cardDB = newCardDB; }
                else console.warn("JSONに有効な社員データ(employeeData配列)なし");

                if (jsonData.teamColors && typeof jsonData.teamColors === 'object') {
                    Object.assign(teamColorDefaults, jsonData.teamColors);
                    console.log("チームの配色設定をJSONから読み込み/マージ:", teamColorDefaults);
                } else console.warn("JSONにチームの配色設定(teamColors)なし。既存のデフォルト設定を使用。");

                if (jsonData.departmentColors && typeof jsonData.departmentColors === 'object') {
                    Object.assign(departmentColorDefaults, jsonData.departmentColors);
                    console.log("部署の配色設定(部署範囲用)をJSONから読み込み/マージ:", departmentColorDefaults);
                } else console.warn("JSONに部署の配色設定(departmentColors)なし。既存のデフォルト設定を使用。");

                populateDepartmentDropdown();
                populateDepartmentFilterDropdown();
                renderList(departmentFilterSelect ? departmentFilterSelect.value : "");
                renderFloor();
                renderDepartmentZoneHeaders();
                showFeedbackMessage(`社員情報と配色設定をJSONから読み込みました。`, false);
              } catch (error) { console.error("Error parsing JSON:", error); showFeedbackMessage("JSONファイルの読み込みに失敗しました。", true); }
              event.target.value = '';
            };
            reader.readAsText(file);
          }
        });
    }

    if(controlsToggleBtn && controlsPanel) {
        controlsToggleBtn.onclick = () => {
            const isActive = controlsPanel.classList.toggle('active');
            // アイコンを Font Awesome クラスで切り替え
            controlsToggleBtn.innerHTML = isActive ? '<i class="fa-solid fa-xmark"></i>' : '<i class="fa-solid fa-gear"></i>';
        };
    }

    // --- 部署範囲設定モーダル関連 ---
    if (deptZoneSettingsBtn) { deptZoneSettingsBtn.onclick = () => { if (currentAppMode === 'view') return; if(deptZoneModal && modalCurrentFloorSpan && currentEditingRowDisplay) { modalCurrentFloorSpan.textContent = currentFloorId; currentEditingRowType = editTopRowRadio.checked ? 'topRow' : 'bottomRow'; if (currentEditingRowDisplay) currentEditingRowDisplay.textContent = currentEditingRowType === 'topRow' ? '上段' : '下段'; maxSeatLabelSpans.forEach(span => span.textContent = seatsPerRow); deptZoneStartInput.max = seatsPerRow; deptZoneEndInput.max = seatsPerRow; if (!allFloorData[currentFloorId]?.departmentZones) { if (!allFloorData[currentFloorId]) allFloorData[currentFloorId] = initializeNewFloorData(); else allFloorData[currentFloorId].departmentZones = { topRow: [], bottomRow: [] };} tempDepartmentZones = JSON.parse(JSON.stringify(allFloorData[currentFloorId].departmentZones)); populateDepartmentDropdown(); displayCurrentDeptZones(); resetDeptZoneForm(); deptZoneModal.style.display = "block"; } }; }
    if (closeDeptZoneModalBtn) { closeDeptZoneModalBtn.onclick = () => { if(deptZoneModal) deptZoneModal.style.display = "none"; }; }
    if (cancelDeptZoneSettingsBtn) { cancelDeptZoneSettingsBtn.onclick = () => { if(deptZoneModal) deptZoneModal.style.display = "none"; }; }
    window.onclick = (event) => { if (event.target == deptZoneModal) deptZoneModal.style.display = "none"; };
    document.querySelectorAll('input[name="editRowType"]').forEach(radio => { radio.onchange = (event) => { if (currentAppMode === 'view') return; currentEditingRowType = event.target.value; if (currentEditingRowDisplay) currentEditingRowDisplay.textContent = currentEditingRowType === 'topRow' ? '上段' : '下段'; displayCurrentDeptZones(); resetDeptZoneForm(); }; });
    function populateDepartmentDropdown() { if (!deptZoneNameSelect) return; const existingValue = deptZoneNameSelect.value; deptZoneNameSelect.innerHTML = ''; const depts = new Set(Object.values(cardDB).map(emp => emp?.dept).filter(Boolean)); if (depts.size === 0) { deptZoneNameSelect.add(new Option("利用可能な部署なし", "")); deptZoneNameSelect.dispatchEvent(new Event('change')); return; } Array.from(depts).sort().forEach(dept => deptZoneNameSelect.add(new Option(dept, dept))); if (Array.from(deptZoneNameSelect.options).some(opt => opt.value === existingValue)) deptZoneNameSelect.value = existingValue; deptZoneNameSelect.dispatchEvent(new Event('change')); }
    function handleDeptZoneNameChangeForColor() { const selectedDeptName = this.value; deptZoneColorInput.value = departmentColorDefaults[selectedDeptName] || departmentColorDefaults['unknown'] || "#FFDDC1"; }
    function displayCurrentDeptZones() {  if (!currentDeptZonesList || !tempDepartmentZones?.[currentEditingRowType]) { if (currentDeptZonesList) currentDeptZonesList.innerHTML = '<li>範囲設定はありません。</li>'; return; } currentDeptZonesList.innerHTML = ''; const zonesToShow = tempDepartmentZones[currentEditingRowType]; const isAdminMode = currentAppMode === 'admin'; if (zonesToShow.length === 0) { currentDeptZonesList.innerHTML = '<li>範囲設定はありません。</li>'; return; } zonesToShow.forEach((zone, index) => { const li = document.createElement('li'); const infoSpan = Object.assign(document.createElement('span'), { className: 'zone-info', textContent: `${zone.deptName} (席${zone.startSeatIndex + 1}～${zone.endSeatIndex + 1}), 色: ` }); const colorPreview = Object.assign(document.createElement('span'), { style: `display:inline-block;width:15px;height:15px;background-color:${zone.color};border:1px solid #ccc;margin-left:5px;` }); infoSpan.appendChild(colorPreview); const actionsSpan = Object.assign(document.createElement('span'), { className: 'zone-actions' }); const editBtn = Object.assign(document.createElement('button'), { textContent: '編集', className: 'edit-zone-btn', disabled: !isAdminMode }); editBtn.onclick = () => { if(isAdminMode) loadZoneForEditing(index); }; const deleteBtn = Object.assign(document.createElement('button'), { textContent: '削除', className: 'delete-zone-btn', disabled: !isAdminMode }); deleteBtn.onclick = () => { if(isAdminMode) deleteDeptZone(index); }; actionsSpan.append(editBtn, deleteBtn); li.append(infoSpan, actionsSpan); currentDeptZonesList.appendChild(li); }); }
    function loadZoneForEditing(index) { if (currentAppMode === 'view') return; const zone = tempDepartmentZones[currentEditingRowType]?.[index]; if (zone) { deptZoneNameSelect.value = zone.deptName; deptZoneColorInput.value = zone.color || departmentColorDefaults[zone.deptName] || departmentColorDefaults['unknown'] || "#FFDDC1"; deptZoneStartInput.value = zone.startSeatIndex + 1; deptZoneEndInput.value = zone.endSeatIndex + 1; editingZoneIndexInput.value = index; addOrUpdateDeptZoneBtn.textContent = '範囲を更新'; } }
    function deleteDeptZone(index) { if (currentAppMode === 'view') return; if (confirm('この部署範囲設定を削除してもよろしいですか？')) { tempDepartmentZones[currentEditingRowType].splice(index, 1); displayCurrentDeptZones(); resetDeptZoneForm(); } }
    function resetDeptZoneForm() { if (deptZoneNameSelect.options.length > 0) { deptZoneNameSelect.selectedIndex = 0; deptZoneColorInput.value = departmentColorDefaults[deptZoneNameSelect.value] || departmentColorDefaults['unknown'] || "#FFDDC1"; } else { deptZoneColorInput.value = "#FFDDC1"; } deptZoneStartInput.value = 1; deptZoneEndInput.value = 1; editingZoneIndexInput.value = "-1"; addOrUpdateDeptZoneBtn.textContent = '範囲を追加'; }
    if (addOrUpdateDeptZoneBtn) { addOrUpdateDeptZoneBtn.onclick = () => { if (currentAppMode === 'view') return; const deptName = deptZoneNameSelect.value; let startIdx = parseInt(deptZoneStartInput.value, 10) -1;  let endIdx = parseInt(deptZoneEndInput.value, 10) -1;    const color = deptZoneColorInput.value; const editIdx = parseInt(editingZoneIndexInput.value, 10); if (!deptName) { showFeedbackMessage("部署名を選択してください。", true); return; } if (isNaN(startIdx) || isNaN(endIdx) || startIdx < 0 || endIdx >= seatsPerRow || startIdx > endIdx) { showFeedbackMessage(`席の範囲が無効です。1～${seatsPerRow}の間で、開始席 <= 終了席となるように入力してください。`, true); return; } const zonesInRow = tempDepartmentZones[currentEditingRowType]; if (zonesInRow.some((zone, i) => i !== editIdx && Math.max(startIdx, zone.startSeatIndex) <= Math.min(endIdx, zone.endSeatIndex))) { showFeedbackMessage("指定された席の範囲が既存の範囲と重複しています。", true); return; } const newZone = { deptName, startSeatIndex: startIdx, endSeatIndex: endIdx, color, deptId: deptName.replace(/\s+/g, '').toLowerCase() }; if (editIdx > -1) zonesInRow[editIdx] = newZone; else zonesInRow.push(newZone); zonesInRow.sort((a, b) => a.startSeatIndex - b.startSeatIndex); displayCurrentDeptZones(); resetDeptZoneForm(); }; }
    if (saveDeptZoneSettingsBtn) { saveDeptZoneSettingsBtn.onclick = () => { if (currentAppMode === 'view') return; if (!allFloorData[currentFloorId]) allFloorData[currentFloorId] = initializeNewFloorData(); allFloorData[currentFloorId].departmentZones = JSON.parse(JSON.stringify(tempDepartmentZones)); departmentZoneSettings = JSON.parse(JSON.stringify(tempDepartmentZones)); saveToLocal(); renderDepartmentZoneHeaders(); if(deptZoneModal) deptZoneModal.style.display = "none"; showFeedbackMessage("部署範囲設定を保存しました。"); }; }

    if (enterAdminModeBtn) { enterAdminModeBtn.onclick = () => { if (currentAppMode === 'view') { setAppMode('admin'); showFeedbackMessage("管理モードに移行しました。"); }}; }
    if (exitAdminModeBtn) { exitAdminModeBtn.onclick = () => { if (currentAppMode === 'admin') { setAppMode('view'); showFeedbackMessage("閲覧モードに戻りました。"); }}; }
    if (departmentFilterSelect) { departmentFilterSelect.onchange = (event) => renderList(event.target.value); }
    if (resetFilterBtn) { resetFilterBtn.onclick = () => { if (departmentFilterSelect) departmentFilterSelect.value = ""; renderList(); }; }

    if (deptZoneNameSelect) deptZoneNameSelect.addEventListener('change', handleDeptZoneNameChangeForColor);

    // --- 印刷設定アイコンボタンのイベントリスナー ---
    if (togglePrintControlsBtn && printControlsDiv) {
        togglePrintControlsBtn.addEventListener('click', () => {
            printControlsDiv.classList.toggle('active');
            updateUIBasedOnMode();
        });
    }

    // --- 印刷設定ボタンのイベントリスナー ---
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

    // --- 初期化処理 ---
    loadAllFloorDataFromLocal();
    populateDepartmentDropdown();
    populateDepartmentFilterDropdown();
    updatePrintHeader();
    setAppMode('view');

    window.addEventListener('beforeprint', updatePrintHeader);
  });
