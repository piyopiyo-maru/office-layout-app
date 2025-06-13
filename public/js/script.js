document.addEventListener('DOMContentLoaded', async () => {
    // --- グローバル変数 ---
    let allFloorData = {}, seatMap = [], mergedSeats = [], memoData = {}, departmentZoneSettings = { topRow: [], bottomRow: [] };
    let tempDepartmentZones = { topRow: [], bottomRow: [] };
    let cardDB = {}, teamColorDefaults = {}, departmentColorDefaults = {};
    let tempJsonData = null;
    const floorIds = ['3F', '4F'];
    const rows = 4, cols = 2, totalIslands = 22, islandsPerRow = 11, seatsPerRow = 22;
    const LS_KEY_DRAFT_LAYOUT = 'seating-layout-draft-multi-floor-zones-v1';
    let currentFloorId = floorIds[0], currentAppMode = 'view', currentLayoutVersion = null, currentEditingRowType = 'topRow';
    let selectedEmpNo = null, selectedCell = null, mergeMode = false;
    let draggedEmployeeInfo = null, draggedElement = null, isDragging = false, mousedownOnDraggable = null;

    // --- DOM要素取得 ---
    const feedbackMessageDiv = document.getElementById('feedbackMessage');
    const sidePanelWrapper = document.querySelector('.side-panel-wrapper');
    const jsonInput = document.getElementById('jsonInput');
    const htmlElement = document.documentElement;
    const currentFloorNameDisplay = document.getElementById('currentFloorName');
    const switchFloorButton = document.getElementById('switchFloorButton');
    const enterAdminModeBtn = document.getElementById('enterAdminModeBtn');
    const exitAdminModeBtn = document.getElementById('exitAdminModeBtn');
    const togglePrintControlsBtn = document.getElementById('togglePrintControlsBtn');
    const printControlsDiv = document.getElementById('printControls');
    const toggleMasterControlsBtn = document.getElementById('toggleMasterControlsBtn');
    const masterControls = document.getElementById('masterControls');
    const masterLoadFileBtn = document.getElementById('masterLoadFileBtn');
    const masterSelectedFile = document.getElementById('masterSelectedFile');
    const masterSaveBtn = document.getElementById('masterSaveBtn');
    const masterReloadBtn = document.getElementById('masterReloadBtn');
    const unassignedListContainer = document.getElementById('unassigned-list-container');
    const departmentFilterSelect = document.getElementById('departmentFilter');
    const resetFilterBtn = document.getElementById('resetFilterBtn');
    const controlsWrapper = document.querySelector('.controls-wrapper');
    const controlsToggleBtn = document.getElementById('controlsToggleBtn');
    const controlsPanel = document.getElementById('controlsPanel');
    const toggleListBtn = document.getElementById('toggleListBtn');
    const deptZoneSettingsBtn = document.getElementById('deptZoneSettingsBtn');
    const mergeBtn = document.getElementById('mergeBtn');
    const saveDraftBtn = document.getElementById('saveDraftBtn');
    const loadDraftBtn = document.getElementById('loadDraftBtn');
    const saveServerBtn = document.getElementById('saveServerBtn');
    const loadServerBtn = document.getElementById('loadServerBtn');
    const deptZoneModal = document.getElementById('deptZoneModal');
    
    // --- 関数定義 ---
    
    function showFeedbackMessage(message, isError = false) {
        if (!feedbackMessageDiv) { alert(message); return; }
        feedbackMessageDiv.textContent = message;
        feedbackMessageDiv.className = isError ? 'feedback-error' : 'feedback-success';
        feedbackMessageDiv.style.opacity = '1';
        setTimeout(() => { feedbackMessageDiv.style.opacity = '0'; }, 3000);
    }
    
    function moveSelected(direction) {
        if (currentAppMode === 'view' || !selectedCell) return;
        let cIsl = parseInt(selectedCell.dataset.island, 10), cRow = parseInt(selectedCell.dataset.row, 10), cCol = parseInt(selectedCell.dataset.col, 10);
        let tIsl = cIsl, tRow = cRow, tCol = cCol;
        const isTopIslandGroup = cIsl < islandsPerRow;
        switch (direction) {
            case 'up': if (cRow > 0) tRow--; else if (!isTopIslandGroup) { tIsl -= islandsPerRow; tRow = rows - 1; } break;
            case 'down': if (cRow < rows - 1) tRow++; else if (isTopIslandGroup) { tIsl += islandsPerRow; tRow = 0; } break;
            case 'left': if (cCol > 0) tCol--; else if (cIsl % islandsPerRow !== 0) { tIsl--; tCol = cols - 1; } break;
            case 'right': if (cCol < cols - 1) tCol++; else if ((cIsl + 1) % islandsPerRow !== 0 && cIsl < totalIslands -1) { tIsl++; tCol = 0; } break;
        }
        if (mergedSeats.some(ms => ms.island === tIsl && ms.row === tRow && ms.col === tCol - 1)) tCol--;
        if (tIsl === cIsl && tRow === cRow && tCol === cCol || !seatMap?.[tIsl]?.[tRow]) return;
        const origEmp = seatMap[cIsl][cRow][cCol];
        const targetEmp = seatMap[tIsl][tRow][tCol];
        seatMap[tIsl][tRow][tCol] = origEmp;
        seatMap[cIsl][cRow][cCol] = targetEmp;
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

    function createCard(empNo) {
        const info = cardDB[empNo];
        const card = document.createElement('div');
        card.className = 'seat-card';
        if (!info) {
            card.style.backgroundColor = teamColorDefaults['unknown_team'] || '#eeeeee';
            card.innerHTML = `<div><strong>${empNo}</strong></div><div>(社員情報なし)</div>`;
            return card;
        }
        card.dataset.empNo = empNo;
        const teamColor = teamColorDefaults[info.team] || teamColorDefaults['unknown_team'] || '#eeeeee';
        card.style.backgroundColor = teamColor;
        let cardHTML = (info.title && info.title !== "0" && info.title !== "一般") ? `<div>${info.title}</div>` : `<div>&nbsp;</div>`;
        cardHTML += `<div><strong>${empNo}</strong></div><div class="employee-name">${info.name}</div>`;
        cardHTML += `<div>内線: ${info.ext || '-'}</div><div>Tel.: ${info.ctstage || '-'}</div>`;
        card.innerHTML = cardHTML;
        if (currentAppMode === 'admin') {
            card.draggable = true;
            card.addEventListener('mousedown', handleMouseDownDraggable);
            card.addEventListener('dragstart', handleDragStartSeatCard);
            card.addEventListener('dragend', handleDragEnd);
        }
        return card;
    }
    
    function createMemoElement(id, type, memoKey, placeholder, groupIndex = 0) {
        const actualKey = `${type}-${groupIndex}-${id}`;
        if (!memoData) memoData = {};
        if (!memoData[actualKey] || typeof memoData[actualKey] !== 'object') memoData[actualKey] = {};
        const memoSection = document.createElement('div');
        memoSection.className = `memo-section memo-${memoKey}`;
        const memoDisplay = document.createElement('div');
        memoDisplay.className = 'memo-display';
        memoDisplay.textContent = memoData[actualKey][memoKey] || placeholder;
        const memoInput = document.createElement('textarea');
        memoInput.className = 'memo-input';
        memoInput.value = memoData[actualKey][memoKey] || '';
        memoInput.style.display = 'none';
        memoInput.disabled = currentAppMode === 'view';
        memoSection.append(memoDisplay, memoInput);
        memoDisplay.onclick = () => { if (currentAppMode === 'admin') { memoDisplay.style.display = 'none'; memoInput.style.display = 'block'; memoInput.focus(); } };
        memoInput.onblur = () => {
            memoData[actualKey][memoKey] = memoInput.value;
            memoDisplay.textContent = memoInput.value || placeholder;
            memoInput.style.display = 'none';
            memoDisplay.style.display = 'flex';
        };
        return memoSection;
    }

    function toggleMerge(island, row, col) {
        if (currentAppMode !== 'admin' || col !== 0) return;
        const idx = mergedSeats.findIndex(ms => ms.island === island && ms.row === row && ms.col === col);
        if (idx >= 0) mergedSeats.splice(idx, 1);
        else if (!mergedSeats.some(ms => ms.island === island && ms.row === row && ms.col === col + 1)) mergedSeats.push({ island, row, col });
        renderFloor();
    }

    function onCellClick(cell) {
        if (isDragging || mousedownOnDraggable) return;
        const isl = parseInt(cell.dataset.island, 10), r = parseInt(cell.dataset.row, 10), c = parseInt(cell.dataset.col, 10);
        if (currentAppMode === 'admin' && mergeMode) { toggleMerge(isl, r, c); return; }
        if (selectedEmpNo && !seatMap?.[isl]?.[r]?.[c]) {
            seatMap[isl][r][c] = selectedEmpNo;
            selectedEmpNo = null;
            renderFloor();
            renderList(departmentFilterSelect.value);
            return;
        }
        document.querySelectorAll('.seat-cell.selected').forEach(el => el.classList.remove('selected'));
        if (selectedCell !== cell) { cell.classList.add('selected'); selectedCell = cell; }
        else selectedCell = null;
    }

    function renderDepartmentZoneHeaders() {
        const topHeader = document.getElementById('departmentZoneHeaderTop');
        const bottomHeader = document.getElementById('departmentZoneHeaderBottom');
        if (!topHeader || !bottomHeader) return;
        topHeader.innerHTML = ''; bottomHeader.innerHTML = '';
        topHeader.style.gridTemplateColumns = `repeat(${seatsPerRow}, 1fr)`;
        bottomHeader.style.gridTemplateColumns = `repeat(${seatsPerRow}, 1fr)`;
        const renderZone = (header, zones) => {
            if (!zones) return;
            zones.forEach(zone => {
                if (typeof zone.startSeatIndex !== 'number' || typeof zone.endSeatIndex !== 'number') return;
                const block = document.createElement('div');
                block.className = 'dept-zone-block';
                block.textContent = zone.deptName;
                block.style.gridColumn = `${zone.startSeatIndex + 1} / span ${Math.max(1, zone.endSeatIndex - zone.startSeatIndex + 1)}`;
                block.style.backgroundColor = zone.color || '#f0f0f0';
                header.appendChild(block);
            });
        };
        renderZone(topHeader, departmentZoneSettings.topRow);
        renderZone(bottomHeader, departmentZoneSettings.bottomRow);
    }
    
    function renderFloor() {
        const floorMap = document.getElementById('floorMap');
        if (!floorMap) return;
        for (let isl = 0; isl < totalIslands; isl++) {
            const islDiv = floorMap.querySelector(`.grid-island[data-island="${isl}"]`);
            if (!islDiv) continue;
            islDiv.innerHTML = '';
            const islandCabinet = document.createElement('div');
            islandCabinet.className = 'island-cabinet';
            islandCabinet.append(createMemoElement(isl, 'island', 'left', ''), createMemoElement(isl, 'island', 'right', ''));
            islDiv.appendChild(islandCabinet);
            const islandSeatsContainer = document.createElement('div');
            islandSeatsContainer.className = 'island-seats-container';
            islDiv.appendChild(islandSeatsContainer);
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if (mergedSeats.some(ms => ms.island === isl && ms.row === r && ms.col === c - 1)) continue;
                    const cell = document.createElement('div');
                    cell.className = 'seat-cell';
                    cell.dataset.island = isl; cell.dataset.row = r; cell.dataset.col = c;
                    cell.onclick = () => onCellClick(cell);
                    if (currentAppMode === 'admin') {
                        cell.addEventListener('dragover', handleDragOverSeat);
                        cell.addEventListener('dragleave', handleDragLeaveSeat);
                        cell.addEventListener('drop', handleDropOnSeat);
                    }
                    if (selectedCell === cell) cell.classList.add('selected');
                    const isMerged = mergedSeats.some(ms => ms.island === isl && ms.row === r && ms.col === c);
                    if (isMerged) {
                        cell.classList.add('merged-seat');
                        cell.style.gridColumn = 'span 2';
                        if (mergeMode) cell.innerHTML = '<span class="merged-mark">合体席</span>';
                    }
                    const empNo = seatMap?.[isl]?.[r]?.[c];
                    if (empNo) cell.appendChild(createCard(empNo));
                    else if (!isMerged) cell.textContent = '空席';
                    islandSeatsContainer.appendChild(cell);
                }
            }
        }
        renderDepartmentZoneHeaders();
        updateUIBasedOnMode();
    }
    
    function renderList(filterDept = "") {
        if (!unassignedListContainer) return;
        unassignedListContainer.innerHTML = '';
        const assignedEmpNos = new Set(Object.values(allFloorData).flatMap(floor => floor.seatMap.flat(2).filter(Boolean)));
        let unassignedEmployees = Object.keys(cardDB).filter(empNo => !assignedEmpNos.has(empNo));
        if (filterDept) {
            unassignedEmployees = unassignedEmployees.filter(empNo => cardDB[empNo]?.dept === filterDept);
        }
        unassignedEmployees.forEach(empNo => {
            const info = cardDB[empNo];
            if (!info) return;
            const div = document.createElement('div');
            div.className = 'employee-item';
            div.dataset.empNo = empNo;
            div.innerHTML = `<i class="fas fa-user"></i> <span>${info.empNo} ${info.name} (${info.dept || '部署未定'})</span>`;
            div.style.backgroundColor = teamColorDefaults[info.team] || '#ffffff';
            div.onclick = () => selectEmployee(div, empNo);
            if (currentAppMode === 'admin') {
                div.draggable = true;
                div.addEventListener('dragstart', handleDragStartEmployeeItem);
                div.addEventListener('dragend', handleDragEnd);
            }
            unassignedListContainer.appendChild(div);
        });
    }

    function selectEmployee(div, empNo) {
        document.querySelectorAll('.employee-item.selected').forEach(el => el.classList.remove('selected'));
        if (selectedEmpNo !== empNo) {
            div.classList.add('selected');
            selectedEmpNo = empNo;
        } else {
            selectedEmpNo = null;
        }
    }

    function updateUIBasedOnMode() {
        const isAdminMode = currentAppMode === 'admin';
        if (enterAdminModeBtn) enterAdminModeBtn.style.display = isAdminMode ? 'none' : '';
        if (exitAdminModeBtn) exitAdminModeBtn.style.display = isAdminMode ? '' : 'none';
        if (controlsWrapper) controlsWrapper.style.display = isAdminMode ? 'flex' : 'none';
        if (toggleMasterControlsBtn) toggleMasterControlsBtn.style.display = isAdminMode ? 'flex' : 'none';
        if (masterLoadFileBtn) masterLoadFileBtn.disabled = !isAdminMode;
        if (masterSaveBtn) masterSaveBtn.disabled = !isAdminMode || !tempJsonData;
        if (masterReloadBtn) masterReloadBtn.disabled = !isAdminMode;
        if (departmentFilterSelect) departmentFilterSelect.disabled = !isAdminMode;
        if (resetFilterBtn) resetFilterBtn.disabled = !isAdminMode;
    }

    function setAppMode(newMode) {
        if (newMode !== 'view' && newMode !== 'admin') return;
        currentAppMode = newMode;
        document.body.className = newMode + '-mode';
        updateUIBasedOnMode();
        if (newMode === 'view') {
            sidePanelWrapper.style.display = 'none';
            masterControls.classList.remove('active');
            printControlsDiv.classList.remove('active');
            controlsPanel.classList.remove('active');
            if (controlsToggleBtn) controlsToggleBtn.innerHTML = '<i class="fa-solid fa-gear"></i>';
        }
        renderFloor();
        renderList(departmentFilterSelect.value);
    }

    function switchFloor(newFloorId, isInitialOrDataLoad = false) {
        if (!isInitialOrDataLoad && allFloorData[currentFloorId]) {
            allFloorData[currentFloorId] = {
                seatMap: JSON.parse(JSON.stringify(seatMap)),
                mergedSeats: JSON.parse(JSON.stringify(mergedSeats)),
                memoData: JSON.parse(JSON.stringify(memoData)),
                departmentZones: JSON.parse(JSON.stringify(departmentZoneSettings))
            };
        }
        currentFloorId = newFloorId;
        const targetFloorData = allFloorData[currentFloorId] || initializeNewFloorData();
        seatMap = JSON.parse(JSON.stringify(targetFloorData.seatMap || []));
        mergedSeats = JSON.parse(JSON.stringify(targetFloorData.mergedSeats || []));
        memoData = JSON.parse(JSON.stringify(targetFloorData.memoData || {}));
        departmentZoneSettings = JSON.parse(JSON.stringify(targetFloorData.departmentZones || { topRow: [], bottomRow: [] }));
        if (currentFloorNameDisplay) currentFloorNameDisplay.textContent = `現在のフロア: ${currentFloorId}`;
        if (switchFloorButton) {
            const nextFloorIndex = (floorIds.indexOf(currentFloorId) + 1) % floorIds.length;
            switchFloorButton.textContent = `${floorIds[nextFloorIndex]}へ移動`;
        }
        renderFloor();
        renderList(departmentFilterSelect.value);
    }
    
    function initializeNewFloorData() {
        return {
            seatMap: Array.from({ length: totalIslands }, () => Array.from({ length: rows }, () => Array(cols).fill(null))),
            mergedSeats: [], memoData: {}, departmentZones: { topRow: [], bottomRow: [] }
        };
    }
    
    function initializeAllFloorData(loadedData = null) {
        const sourceData = loadedData || {};
        floorIds.forEach(id => {
            allFloorData[id] = initializeNewFloorData();
            if (sourceData[id]) Object.assign(allFloorData[id], JSON.parse(JSON.stringify(sourceData[id])));
        });
    }

    function populateDepartmentDropdown() {
        const deptZoneNameSelect = deptZoneModal.querySelector('#deptZoneName');
        if (!deptZoneNameSelect) return;
        const depts = new Set(Object.values(cardDB).map(e => e.dept).filter(Boolean));
        deptZoneNameSelect.innerHTML = '';
        Array.from(depts).sort().forEach(d => deptZoneNameSelect.add(new Option(d, d)));
        handleDeptZoneNameChangeForColor();
    }
    function populateDepartmentFilterDropdown() {
        if (!departmentFilterSelect) return;
        const depts = new Set(Object.values(cardDB).map(e => e.dept).filter(Boolean));
        departmentFilterSelect.innerHTML = '<option value="">すべての部署</option>';
        Array.from(depts).sort().forEach(d => departmentFilterSelect.add(new Option(d, d)));
    }
    
    async function loadInitialServerData() {
        try {
            const response = await fetch('/api/initial-data');
            if (!response.ok) throw new Error(`サーバエラー (${response.status})`);
            const data = await response.json();
            cardDB = data.employeeData || {};
            teamColorDefaults = data.teamColors || {};
            departmentColorDefaults = data.departmentColors || {};
        } catch (error) {
            showFeedbackMessage("基本データの読込に失敗しました。", true);
            console.error(error);
            throw error;
        }
    }
    
    function saveDraftToLocal() {
        if (currentAppMode === 'view') return;
        allFloorData[currentFloorId] = {
            seatMap: JSON.parse(JSON.stringify(seatMap)),
            mergedSeats: JSON.parse(JSON.stringify(mergedSeats)),
            memoData: JSON.parse(JSON.stringify(memoData)),
            departmentZones: JSON.parse(JSON.stringify(departmentZoneSettings))
        };
        localStorage.setItem(LS_KEY_DRAFT_LAYOUT, JSON.stringify(allFloorData));
        showFeedbackMessage('下書きを保存しました。');
    }

    function loadDraftFromLocal() {
        if (!confirm('現在の編集内容は破棄されます。よろしいですか？')) return;
        const storedData = localStorage.getItem(LS_KEY_DRAFT_LAYOUT);
        if (storedData) {
            initializeAllFloorData(JSON.parse(storedData));
            switchFloor(currentFloorId, true);
            showFeedbackMessage('下書きを読み込みました。');
        } else {
            showFeedbackMessage('保存された下書きはありません。', true);
        }
    }

    async function saveLayoutToServer() {
        if (currentAppMode === 'view') return;
        allFloorData[currentFloorId] = {
            seatMap: JSON.parse(JSON.stringify(seatMap)),
            mergedSeats: JSON.parse(JSON.stringify(mergedSeats)),
            memoData: JSON.parse(JSON.stringify(memoData)),
            departmentZones: JSON.parse(JSON.stringify(departmentZoneSettings))
        };
        const payload = { _version: currentLayoutVersion, layout: allFloorData };
        try {
            showFeedbackMessage('サーバへ保存中...');
            const response = await fetch('/api/layouts/default', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (response.ok) {
                const result = await response.json();
                currentLayoutVersion = result._newVersion;
                showFeedbackMessage(`レイアウトをサーバに保存しました (Ver: ${currentLayoutVersion})`);
            } else if (response.status === 409) {
                alert("競合発生: レイアウトが他で更新されました。最新版を読み込みます。");
                await loadLayoutFromServer(true);
            } else throw new Error(await response.text());
        } catch (error) {
            showFeedbackMessage('サーバへの保存に失敗しました。', true);
            console.error(error);
        }
    }

    async function loadLayoutFromServer(isInitialLoad = false) {
        if (!isInitialLoad && !confirm("現在の編集内容は破棄されます。よろしいですか？")) return;
        try {
            const response = await fetch('/api/layouts/default');
            if (!response.ok) {
                if (response.status === 404) {
                    showFeedbackMessage("サーバにレイアウトはありません。", false);
                    initializeAllFloorData(); currentLayoutVersion = 0;
                    switchFloor(currentFloorId, true);
                    return;
                }
                throw new Error(`サーバエラー (${response.status})`);
            }
            const serverResponse = await response.json();
            currentLayoutVersion = serverResponse._version;
            initializeAllFloorData(serverResponse.layout);
            switchFloor(currentFloorId, true);
            if (!isInitialLoad) showFeedbackMessage(`レイアウトを読込 (Ver: ${currentLayoutVersion})`);
        } catch (error) {
            showFeedbackMessage("レイアウトの読込に失敗しました。", true);
            console.error(error);
            initializeAllFloorData(); currentLayoutVersion = 0;
            switchFloor(currentFloorId, true);
        }
    }
    
    function handleMouseDownDraggable(e) { mousedownOnDraggable = e.currentTarget; }
    function handleDragEnd(e) { isDragging = false; mousedownOnDraggable = null; draggedEmployeeInfo = null; draggedElement?.classList.remove('dragging'); document.querySelectorAll('.seat-cell.dragover').forEach(c => c.classList.remove('dragover')); }
    function handleDragOverSeat(e) { e.preventDefault(); e.currentTarget.classList.add('dragover'); }
    function handleDragLeaveSeat(e) { e.currentTarget.classList.remove('dragover'); }
    function handleDragStartSeatCard(e) { e.stopPropagation(); isDragging = true; const card = e.currentTarget; const empNo = card.dataset.empNo; const cell = card.closest('.seat-cell'); draggedEmployeeInfo = { empNo, island: +cell.dataset.island, row: +cell.dataset.row, col: +cell.dataset.col }; draggedElement = card; setTimeout(() => card.classList.add('dragging'), 0); }
    function handleDragStartEmployeeItem(e) { isDragging = true; const item = e.currentTarget; const empNo = item.dataset.empNo; draggedEmployeeInfo = { empNo, origin: 'unassigned' }; draggedElement = item; setTimeout(() => item.classList.add('dragging'), 0); }
    function handleDropOnSeat(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('dragover');
        if (!draggedEmployeeInfo) return;
        const targetCell = e.currentTarget;
        const targetIsl = +targetCell.dataset.island, targetRow = +targetCell.dataset.row, targetCol = +targetCell.dataset.col;
        const draggedEmpNo = draggedEmployeeInfo.empNo;
        const { island: originIsl, row: originRow, col: originCol, origin } = draggedEmployeeInfo;
        if (originIsl === targetIsl && originRow === targetRow && originCol === targetCol) return;
        const targetEmpNo = seatMap[targetIsl][targetRow][targetCol];
        seatMap[targetIsl][targetRow][targetCol] = draggedEmpNo;
        if (origin !== 'unassigned') seatMap[originIsl][originRow][originCol] = targetEmpNo;
        renderFloor();
        renderList(departmentFilterSelect.value);
    }
    
    function openDeptZoneModal() {
        if (currentAppMode !== 'admin' || !deptZoneModal) return;
        const modalCurrentFloorSpan = deptZoneModal.querySelector('#modalCurrentFloor');
        const currentEditingRowDisplay = deptZoneModal.querySelector('#currentEditingRowDisplay');
        const maxSeatLabelSpans = deptZoneModal.querySelectorAll('.max-seat-label');
        const editTopRowRadio = deptZoneModal.querySelector('#editTopRowRadio');
        if (!modalCurrentFloorSpan || !currentEditingRowDisplay || !maxSeatLabelSpans || !editTopRowRadio) {
            console.error("部署範囲設定モーダルの内部要素が見つかりません。");
            return;
        }
        
        modalCurrentFloorSpan.textContent = currentFloorId;
        currentEditingRowType = editTopRowRadio.checked ? 'topRow' : 'bottomRow';
        currentEditingRowDisplay.textContent = currentEditingRowType === 'topRow' ? '上段' : '下段';
        maxSeatLabelSpans.forEach(span => span.textContent = seatsPerRow);
        
        tempDepartmentZones = JSON.parse(JSON.stringify(departmentZoneSettings));
        populateDepartmentDropdown();
        displayCurrentDeptZones();
        resetDeptZoneForm();
        deptZoneModal.style.display = "block";
    }

    function displayCurrentDeptZones() {
        const currentDeptZonesList = deptZoneModal.querySelector('#currentDeptZonesList');
        if (!currentDeptZonesList) return;
        currentDeptZonesList.innerHTML = '';
        const zonesToShow = tempDepartmentZones[currentEditingRowType];
        if (!zonesToShow || zonesToShow.length === 0) {
            currentDeptZonesList.innerHTML = '<li>範囲設定はありません。</li>';
            return;
        }
        zonesToShow.forEach((zone, index) => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${zone.deptName} (席${zone.startSeatIndex + 1}～${zone.endSeatIndex + 1})</span>
                            <span class="zone-actions">
                                <button class="edit-zone-btn" data-index="${index}">編集</button>
                                <button class="delete-zone-btn" data-index="${index}">削除</button>
                            </span>`;
            li.querySelector('.edit-zone-btn').onclick = () => loadZoneForEditing(index);
            li.querySelector('.delete-zone-btn').onclick = () => {
                if(confirm('この部署範囲を削除しますか？')){
                    tempDepartmentZones[currentEditingRowType].splice(index, 1);
                    displayCurrentDeptZones();
                }
            };
            currentDeptZonesList.appendChild(li);
        });
    }

    function loadZoneForEditing(index) {
        const zone = tempDepartmentZones[currentEditingRowType][index];
        if (!zone) return;
        const { deptZoneNameSelect, deptZoneColorInput, deptZoneStartInput, deptZoneEndInput, editingZoneIndexInput, addOrUpdateDeptZoneBtn } = getModalElements();
        deptZoneNameSelect.value = zone.deptName;
        deptZoneColorInput.value = zone.color;
        deptZoneStartInput.value = zone.startSeatIndex + 1;
        deptZoneEndInput.value = zone.endSeatIndex + 1;
        editingZoneIndexInput.value = index;
        addOrUpdateDeptZoneBtn.textContent = '範囲を更新';
    }

    function resetDeptZoneForm() {
        const { deptZoneNameSelect, deptZoneStartInput, deptZoneEndInput, editingZoneIndexInput, addOrUpdateDeptZoneBtn } = getModalElements();
        if (deptZoneNameSelect && deptZoneNameSelect.options.length > 0) deptZoneNameSelect.selectedIndex = 0;
        if(deptZoneStartInput) deptZoneStartInput.value = 1;
        if(deptZoneEndInput) deptZoneEndInput.value = 1;
        if(editingZoneIndexInput) editingZoneIndexInput.value = "-1";
        if(addOrUpdateDeptZoneBtn) addOrUpdateDeptZoneBtn.textContent = '範囲を追加';
        handleDeptZoneNameChangeForColor();
    }
    
    function handleDeptZoneNameChangeForColor() {
        const { deptZoneNameSelect, deptZoneColorInput } = getModalElements();
        const selectedDeptName = deptZoneNameSelect.value;
        if(deptZoneColorInput) deptZoneColorInput.value = departmentColorDefaults[selectedDeptName] || "#cccccc";
    }
    
    function getModalElements() {
        return {
            deptZoneNameSelect: deptZoneModal.querySelector('#deptZoneName'),
            deptZoneColorInput: deptZoneModal.querySelector('#deptZoneColor'),
            deptZoneStartInput: deptZoneModal.querySelector('#deptZoneStart'),
            deptZoneEndInput: deptZoneModal.querySelector('#deptZoneEnd'),
            editingZoneIndexInput: deptZoneModal.querySelector('#editingZoneIndex'),
            addOrUpdateDeptZoneBtn: deptZoneModal.querySelector('#addOrUpdateDeptZoneBtn'),
        };
    }

    function setupEventListeners() {
        if (enterAdminModeBtn) enterAdminModeBtn.onclick = () => setAppMode('admin');
        if (exitAdminModeBtn) exitAdminModeBtn.onclick = () => setAppMode('view');
        if (controlsToggleBtn) {
            controlsToggleBtn.onclick = () => {
                if (currentAppMode === 'admin') {
                    const isActive = controlsPanel.classList.toggle('active');
                    controlsToggleBtn.innerHTML = isActive ? '<i class="fa-solid fa-xmark"></i>' : '<i class="fa-solid fa-gear"></i>';
                }
            };
        }
        if (toggleMasterControlsBtn) {
            toggleMasterControlsBtn.onclick = () => {
                if (currentAppMode === 'admin') {
                    masterControls.classList.toggle('active');
                    printControlsDiv?.classList.remove('active');
                }
            };
        }
        if (togglePrintControlsBtn) {
            togglePrintControlsBtn.onclick = () => {
                printControlsDiv.classList.toggle('active');
                masterControls?.classList.remove('active');
            };
        }
        if (masterLoadFileBtn) masterLoadFileBtn.onclick = () => jsonInput.click();
        if (jsonInput) jsonInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    tempJsonData = JSON.parse(e.target.result);
                    if (!tempJsonData.employeeData || !tempJsonData.teamColors || !tempJsonData.departmentColors) throw new Error("必須キーが不足しています。");
                    cardDB = tempJsonData.employeeData;
                    teamColorDefaults = tempJsonData.teamColors;
                    departmentColorDefaults = tempJsonData.departmentColors;
                    populateDepartmentDropdown(); populateDepartmentFilterDropdown();
                    renderList(departmentFilterSelect.value); renderFloor();
                    masterSelectedFile.textContent = file.name;
                    showFeedbackMessage(`「${file.name}」をプレビュー中。`, false);
                } catch (error) {
                    tempJsonData = null; masterSelectedFile.textContent = '読込失敗';
                    showFeedbackMessage(`JSON読込失敗: ${error.message}`, true);
                } finally {
                    event.target.value = ''; updateUIBasedOnMode();
                }
            };
            reader.readAsText(file);
        });
        if (masterSaveBtn) masterSaveBtn.onclick = async () => {
            if (!tempJsonData) { showFeedbackMessage("保存するデータがありません。", true); return; }
            if (confirm("サーバーのマスターデータを上書きしますか？")) {
                try {
                    showFeedbackMessage("保存中...", false);
                    const response = await fetch('/api/initial-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tempJsonData) });
                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({ message: '不明なエラー' }));
                        throw new Error(errorData.message);
                    }
                    showFeedbackMessage("マスターデータを保存しました。", false);
                    tempJsonData = null; masterSelectedFile.textContent = '未選択';
                    updateUIBasedOnMode();
                } catch (error) { showFeedbackMessage(`保存失敗: ${error.message}`, true); }
            }
        };
        if (masterReloadBtn) masterReloadBtn.onclick = async () => {
            if (confirm("サーバーから最新のマスター情報を再読込しますか？")) {
                try {
                    showFeedbackMessage("再読込中...", false);
                    await loadInitialServerData();
                    populateDepartmentDropdown();
                    populateDepartmentFilterDropdown();
                    renderFloor(); renderList(departmentFilterSelect.value);
                    showFeedbackMessage("マスター情報を再読込しました。", false);
                } catch (error) { showFeedbackMessage("再読込に失敗しました。", true); }
            }
        };
        if (switchFloorButton) {
            switchFloorButton.onclick = () => {
                const nextFloorIndex = (floorIds.indexOf(currentFloorId) + 1) % floorIds.length;
                switchFloor(floorIds[nextFloorIndex]);
            };
        }
        if (toggleListBtn) toggleListBtn.onclick = () => { sidePanelWrapper.style.display = sidePanelWrapper.style.display === 'none' ? 'flex' : 'none'; };
        if (mergeBtn) { mergeBtn.onclick = () => { mergeMode = !mergeMode; mergeBtn.classList.toggle('active', mergeMode); renderFloor(); }; }
        ['up', 'down', 'left', 'right'].forEach(dir => { document.getElementById(`${dir}Btn`)?.addEventListener('click', () => moveSelected(dir)); });
        if(saveDraftBtn) saveDraftBtn.onclick = saveDraftToLocal;
        if(loadDraftBtn) loadDraftBtn.onclick = loadDraftFromLocal;
        if(saveServerBtn) saveServerBtn.onclick = saveLayoutToServer;
        if(loadServerBtn) loadServerBtn.onclick = () => loadLayoutFromServer();
        if(deptZoneSettingsBtn) deptZoneSettingsBtn.onclick = openDeptZoneModal;
        if(departmentFilterSelect) departmentFilterSelect.onchange = (e) => renderList(e.target.value);
        if(resetFilterBtn) resetFilterBtn.onclick = () => { departmentFilterSelect.value = ""; renderList(); };
        
        // Modal Event Listeners
        const closeModalBtns = deptZoneModal.querySelectorAll('.close-btn, #cancelDeptZoneSettingsBtn');
        const saveDeptZoneSettingsBtn = deptZoneModal.querySelector('#saveDeptZoneSettingsBtn');
        const addOrUpdateDeptZoneBtn = deptZoneModal.querySelector('#addOrUpdateDeptZoneBtn');
        const deptZoneNameSelect = deptZoneModal.querySelector('#deptZoneName');

        closeModalBtns.forEach(btn => btn.onclick = () => deptZoneModal.style.display = "none");
        if(saveDeptZoneSettingsBtn) saveDeptZoneSettingsBtn.onclick = () => {
            departmentZoneSettings = JSON.parse(JSON.stringify(tempDepartmentZones));
            renderDepartmentZoneHeaders();
            deptZoneModal.style.display = "none";
            showFeedbackMessage('部署範囲を適用しました。');
        };
        if(addOrUpdateDeptZoneBtn) addOrUpdateDeptZoneBtn.onclick = () => {
            const { deptZoneNameSelect, deptZoneStartInput, deptZoneEndInput, editingZoneIndexInput, deptZoneColorInput } = getModalElements();
            const deptName = deptZoneNameSelect.value;
            let startIdx = parseInt(deptZoneStartInput.value, 10) -1;
            let endIdx = parseInt(deptZoneEndInput.value, 10) -1;
            const editIdx = parseInt(editingZoneIndexInput.value, 10);

            if (!deptName || isNaN(startIdx) || isNaN(endIdx) || startIdx > endIdx || startIdx < 0 || endIdx >= seatsPerRow) {
                showFeedbackMessage('入力が無効です。', true); return;
            }
             if (tempDepartmentZones[currentEditingRowType].some((zone, i) => i !== editIdx && Math.max(startIdx, zone.startSeatIndex) <= Math.min(endIdx, zone.endSeatIndex))) {
                showFeedbackMessage("指定された席の範囲が既存の範囲と重複しています。", true); return;
            }
            const newZone = { deptName, startSeatIndex: startIdx, endSeatIndex: endIdx, color: deptZoneColorInput.value };
            if(editIdx > -1) {
                tempDepartmentZones[currentEditingRowType][editIdx] = newZone;
            } else {
                tempDepartmentZones[currentEditingRowType].push(newZone);
            }
            tempDepartmentZones[currentEditingRowType].sort((a,b) => a.startSeatIndex - b.startSeatIndex);
            displayCurrentDeptZones();
            resetDeptZoneForm();
        };
        if(deptZoneNameSelect) deptZoneNameSelect.onchange = handleDeptZoneNameChangeForColor;
        deptZoneModal.querySelectorAll('input[name="editRowType"]').forEach(radio => {
            radio.onchange = (event) => {
                currentEditingRowType = event.target.value;
                deptZoneModal.querySelector('#currentEditingRowDisplay').textContent = currentEditingRowType === 'topRow' ? '上段' : '下段';
                displayCurrentDeptZones();
                resetDeptZoneForm();
            };
        });
    }

    async function initializeApp() {
        try {
            await loadInitialServerData();
            await loadLayoutFromServer(true);
            populateDepartmentDropdown();
            populateDepartmentFilterDropdown();
            setupEventListeners();
            switchFloor(currentFloorId, true);
            setAppMode('view');
        } catch (error) {
            console.error("アプリケーションの初期化に失敗しました。", error);
            showFeedbackMessage("アプリケーションの起動に失敗しました。リロードしてください。", true);
        }
    }

    // --- アプリケーションの開始 ---
    initializeApp();
});
