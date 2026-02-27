const MAX_USERS = 25;
const DEFAULT_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23555555'%3E%3Ccircle cx='12' cy='12' r='12'/%3E%3C/svg%3E";

let currentTab = 'friends';
let ui = {};
let tooltipEl = null;
let lastRefreshAnim = 0;

if (document.readyState === 'complete') {
    setTimeout(initWidget, 500);
} else {
    window.addEventListener('load', () => setTimeout(initWidget, 500));
}

function initWidget() {
    if (document.getElementById('ip-widget')) return;

    chrome.storage.local.get(['ipCollapsed', 'lastTab'], (res) => {
        const isCollapsed = res.ipCollapsed || false;
        const startTab = res.lastTab || 'friends';
        currentTab = startTab;

        renderWidgetHTML(isCollapsed, startTab);
        createTooltipElement();
        setupEventListeners();

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                ui.widget.classList.add('ip-visible');
            });
        });

        checkAuth();
        chrome.storage.onChanged.addListener(handleStorageChanges);
    });
}

function handleStorageChanges(changes, namespace) {
    if (namespace === 'local' && changes.access_token) {
        checkAuth();
    }
    if (namespace === 'local' || namespace === 'sync') {
        if (currentTab === 'friends') renderFriendsList();
        if (currentTab === 'exam') renderExamList();
        if (currentTab === 'rank') renderRankings();
    }
}

function createTooltipElement() {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'ip-hover-card';
    document.body.appendChild(tooltipEl);
}

function renderWidgetHTML(isCollapsed, startTab) {
    const div = document.createElement('div');
    div.id = 'ip-widget';

    if (isCollapsed) div.classList.add('ip-collapsed');
    const arrowIcon = isCollapsed ? '▲' : '▼';
    const isActive = (name) => name === startTab ? 'active' : '';

    div.innerHTML = `
        <div id="ip-header">
            <div style="display:flex; align-items:center; gap:8px">
                <span>Friends Tracker</span>
                <span id="ip-logout-btn" title="Logout" style="font-size:12px; cursor:pointer; opacity:0.7">⏻</span>
            </div>
            <span id="ip-toggle" style="font-size:12px">${arrowIcon}</span>
        </div>

        <div id="ip-tabs">
            <button class="ip-tab-btn ${isActive('friends')}" data-tab="friends">👥 Friends</button>
            <button class="ip-tab-btn ${isActive('rank')}" data-tab="rank">🏆 Rank</button>
            <button class="ip-tab-btn ${isActive('exam')}" data-tab="exam">🕵️ Exam</button>
        </div>

        <div id="ip-body">
            <div id="ip-login-screen" style="display:none; text-align:center; padding:20px;">
                <p style="color:#aaa; font-size:12px; margin-bottom:15px;">Connect to 42 to start.</p>
                <button id="ip-login-btn" class="ip-btn" style="width:100%">Login with 42</button>
            </div>

            <div id="tab-friends" class="ip-section ${isActive('friends')}">
                <ul id="list-friends" class="ip-list"></ul>
                <div id="error-friends" style="color:#d9534f; font-size:11px; margin-bottom:5px; display:none"></div>
                <div class="ip-input-group" style="margin-top: 10px; border-top: 1px solid #333; padding-top: 10px;">
                    <input type="text" id="ip-input-friends" class="ip-input" placeholder="Add friend...">
                    <button id="ip-add-friends" class="ip-btn">Add</button>
                </div>
            </div>

            <div id="tab-rank" class="ip-section ${isActive('rank')}">
                <div class="ip-rank-filters">
                    <button class="ip-filter-btn active" data-sort="level">Level</button>
                    <button class="ip-filter-btn" data-sort="pp">Eval Points 💰</button>
                </div>
                <ul id="list-rank" class="ip-list"></ul>
            </div>

            <div id="tab-exam" class="ip-section ${isActive('exam')}">
                <p style="font-size:11px; color:#666; text-align:center; margin-bottom:5px">
                    <span id="exam-timer">Live Tracking (1m)</span>
                </p>
                <ul id="list-exam" class="ip-list"></ul>
                <div id="error-exam" style="color:#d9534f; font-size:11px; margin-bottom:5px; display:none"></div>
                <div class="ip-input-group" style="margin-top: 10px; border-top: 1px solid #333; padding-top: 10px;">
                    <input type="text" id="ip-input-exam" class="ip-input" placeholder="Add to tracker...">
                    <button id="ip-add-exam" class="ip-btn">Add</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(div);

    ui = {
        widget: div,
        toggle: document.getElementById('ip-toggle'),
        loginScreen: document.getElementById('ip-login-screen'),
        loginBtn: document.getElementById('ip-login-btn'),
        inputs: { friends: document.getElementById('ip-input-friends'), exam: document.getElementById('ip-input-exam') },
        addBtns: { friends: document.getElementById('ip-add-friends'), exam: document.getElementById('ip-add-exam') },
        errors: { friends: document.getElementById('error-friends'), exam: document.getElementById('error-exam') },
        lists: { friends: document.getElementById('list-friends'), rank: document.getElementById('list-rank'), exam: document.getElementById('list-exam') }
    };
}

function setupEventListeners() {
    document.getElementById('ip-header').addEventListener('click', (e) => {
        if (e.target.id === 'ip-logout-btn') return;
        const collapsed = ui.widget.classList.toggle('ip-collapsed');
        ui.toggle.innerText = collapsed ? '▲' : '▼';
        chrome.storage.local.set({ ipCollapsed: collapsed });
    });

    document.getElementById('ip-logout-btn').addEventListener('click', () => { 
        if(confirm("Logout?")) chrome.storage.local.remove('access_token'); 
    });

    document.querySelectorAll('.ip-tab-btn').forEach(btn => btn.addEventListener('click', (e) => switchTab(e.target.dataset.tab)));
    
    document.querySelectorAll('.ip-filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.ip-filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            renderRankings(e.target.dataset.sort);
        });
    });

    ui.loginBtn.addEventListener('click', () => {
        ui.loginBtn.innerText = "...";
        chrome.runtime.sendMessage({ action: "login" }, (res) => {
            if (!res || !res.success) { 
                ui.loginBtn.innerText = "Login"; 
                showError('friends', "Login Failed"); 
            }
        });
    });

    ui.addBtns.friends.addEventListener('click', () => addUser('friends'));
    ui.inputs.friends.addEventListener('keypress', (e) => { if (e.key === 'Enter') addUser('friends'); });
    ui.addBtns.exam.addEventListener('click', () => addUser('exam_users'));
    ui.inputs.exam.addEventListener('keypress', (e) => { if (e.key === 'Enter') addUser('exam_users'); });
}

function showTooltip(e, projects) {
    if (!projects || projects.length === 0) {
        tooltipEl.innerHTML = '<div style="padding: 4px 0; color: #888; font-size: 11px;">Not subscribed to any project</div>';
        tooltipEl.classList.add('visible');
    } else {
        let html = '';
        projects.forEach(p => {
            const startDate = new Date(p.created_at);
            const now = new Date();
            const diffTime = Math.abs(now - startDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            html += `
                <div class="ip-project-row">
                    <span class="ip-project-name">${p.name}</span>
                    <span class="ip-project-time">🕒 ${diffDays}d</span>
                </div>
            `;
        });
        tooltipEl.innerHTML = html;
        tooltipEl.classList.add('visible');
    }
    const rect = e.target.getBoundingClientRect();
    tooltipEl.style.top = `${rect.top}px`;
    tooltipEl.style.left = `${rect.left - 170}px`;
}

function hideTooltip() {
    tooltipEl.classList.remove('visible');
}

function showError(tab, msg) {
    const el = tab === 'friends' ? ui.errors.friends : ui.errors.exam;
    if(el) { 
        el.innerText = msg; 
        el.style.display = 'block'; 
        setTimeout(() => el.style.display = 'none', 3000); 
    }
}

function switchTab(tabName) {
    currentTab = tabName;
    chrome.storage.local.set({ lastTab: tabName });
    document.querySelectorAll('.ip-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');
    document.querySelectorAll('.ip-section').forEach(s => s.classList.remove('active'));
    document.getElementById(`tab-${tabName}`)?.classList.add('active');

    if (tabName === 'friends') renderFriendsList();
    if (tabName === 'rank') renderRankings();
    if (tabName === 'exam') renderExamList();
}

function checkAuth() {
    chrome.storage.local.get(['access_token'], (res) => {
        if (res.access_token) {
            ui.loginScreen.style.display = 'none';
            document.getElementById('ip-tabs').style.display = 'flex';
            switchTab(currentTab);
        } else {
            ui.loginScreen.style.display = 'block';
            document.getElementById('ip-tabs').style.display = 'none';
            document.querySelectorAll('.ip-section').forEach(s => s.classList.remove('active'));
        }
    });
}

function addUser(storageKey) {
    const isFriend = storageKey === 'friends';
    const inputEl = isFriend ? ui.inputs.friends : ui.inputs.exam;
    const btnEl = isFriend ? ui.addBtns.friends : ui.addBtns.exam;
    const tabName = isFriend ? 'friends' : 'exam';
    const login = inputEl.value.trim().toLowerCase();

    if (!login) return;

    inputEl.classList.add('loading');
    btnEl.classList.add('loading');
    inputEl.disabled = true;
    btnEl.disabled = true;

    const resetLoading = () => {
        inputEl.classList.remove('loading');
        btnEl.classList.remove('loading');
        inputEl.disabled = false;
        btnEl.disabled = false;
        inputEl.focus();
    };

    chrome.runtime.sendMessage({ action: "validateUser", login }, (response) => {
        if (!response || !response.valid) {
            showError(tabName, response?.error || "User invalid");
            resetLoading();
            return;
        }

        chrome.storage.sync.get([storageKey], (res) => {
            const list = res[storageKey] || [];
            if (list.length >= MAX_USERS) {
                showError(tabName, `Limit reached (${MAX_USERS})`);
                resetLoading();
            } else if (!list.includes(login)) {
                list.push(login);
                chrome.storage.sync.set({ [storageKey]: list }, () => {
                    inputEl.value = '';
                    resetLoading();
                });
            } else {
                showError(tabName, "User already added");
                resetLoading();
            }
        });
    });
}

function updateListDOM(listId, itemsData, renderItemFn, storageKey = '', showTooltipOnHover = false) {
    const list = document.getElementById(listId);
    if (!list) return;

    const existingIds = new Set();
    list.querySelectorAll('.ip-item').forEach(el => existingIds.add(el.id));

    itemsData.forEach((item, index) => {
        const itemId = `${listId}-item-${item.login}`;
        let el = document.getElementById(itemId);
        existingIds.delete(itemId);

        if (!el) {
            el = document.createElement('li');
            el.id = itemId;
            el.className = 'ip-item';
            list.appendChild(el);
        }

        const newContent = renderItemFn(item, index);
        if (el.innerHTML !== newContent) {
            el.innerHTML = newContent;

            const infoDiv = el.querySelector('.ip-user-info');
            if (infoDiv) {
                infoDiv.onclick = () => window.open(`https://profile.intra.42.fr/users/${item.login}`, '_blank');
                if (showTooltipOnHover) {
                    infoDiv.onmouseenter = (e) => showTooltip(e, item.active_projects);
                    infoDiv.onmouseleave = hideTooltip;
                }
            }

            const delBtn = el.querySelector('.del-btn');
            if (delBtn) {
                delBtn.onclick = (e) => {
                    e.stopPropagation();
                    chrome.storage.sync.get([storageKey], (r) => {
                        const newL = (r[storageKey] || []).filter(f => f !== item.login);
                        chrome.storage.sync.set({ [storageKey]: newL }, () => el.remove());
                    });
                };
            }
        }
        list.appendChild(el);
    });
    existingIds.forEach(id => document.getElementById(id)?.remove());
}

function renderFriendsList() {
    if (currentTab !== 'friends') return;
    chrome.storage.sync.get(['friends'], (res) => {
        const items = (res.friends || []).map(login => new Promise(r => chrome.storage.local.get([`data_${login}`], d => r({ login, ...(d[`data_${login}`] || {}) }))));
        Promise.all(items).then(dataList => {
            dataList.sort((a, b) => {
                const aOnline = !!a.location;
                const bOnline = !!b.location;
                if (aOnline !== bOnline) return bOnline - aOnline;
                return a.login.localeCompare(b.login);
            });
            updateListDOM('list-friends', dataList, (u) => {
                let status = '<span style="color:#666">Loading...</span>';
                if (u.location) status = `<span class="ip-status-online">🟢 ${u.location}</span>`;
                else if (u.status === 'success') status = `<span class="ip-status-offline">🔴 Offline</span>`;

                return `
                    <div class="ip-user-info">
                        <img src="${u.image || DEFAULT_AVATAR}" class="ip-avatar">
                        <div>
                            <div class="ip-login">${u.login}</div>
                            <div class="ip-subtext">${status}</div>
                        </div>
                    </div>
                    <button class="ip-btn del-btn" style="background:transparent; color:#666; padding:0;">×</button>
                `;
            }, 'friends', true);
        });
    });
}

function showRefreshingAnimation() {
    const now = Date.now();
    if (now - lastRefreshAnim < 30000) return;
    lastRefreshAnim = now;

    const timer = document.getElementById('exam-timer');
    if (timer) {
        timer.innerText = "Refreshing...";
        setTimeout(() => { if (timer) timer.innerText = "Live Tracking (1m)"; }, 2000);
    }
}

function renderExamList() {
    if (currentTab !== 'exam') return;
    showRefreshingAnimation();
    
    chrome.storage.sync.get(['exam_users'], (res) => {
        const items = (res.exam_users || []).map(login => new Promise(r => chrome.storage.local.get([`data_${login}`], d => r({ login, ...(d[`data_${login}`] || {}) }))));
        Promise.all(items).then(dataList => {
            dataList.sort((a, b) => {
                const aHasExam = !!a.exam_project;
                const bHasExam = !!b.exam_project;
                if (aHasExam !== bHasExam) return bHasExam - aHasExam;
                return a.login.localeCompare(b.login);
            });
            updateListDOM('list-exam', dataList, (u) => {
                let status = `<span style="font-size:11px; color:#555">No Exam</span>`;
                if (u.exam_project) {
                    let markText = 'NOT STARTED';
                    let markValue = 0;
                    if (u.exam_mark !== null && u.exam_mark !== undefined) {
                        markText = `${u.exam_mark}%`;
                        markValue = Math.max(0, Math.min(100, u.exam_mark));
                    }
                    const hue = (markValue / 100) * 120;
                    const color = `hsl(${hue}, 80%, 45%)`;
                    status = `<div style="text-align:right"><div style="font-size:11px; font-weight:bold">${u.exam_project}</div><div style="font-weight:bold; color:${color}">${markText}</div></div>`;
                }
                return `
                    <div class="ip-user-info">
                        <img src="${u.image || DEFAULT_AVATAR}" class="ip-avatar">
                        <span class="ip-login">${u.login}</span>
                    </div>
                    ${status}
                    <button class="ip-btn del-btn" style="background:transparent; color:#666; padding:0; margin-left:10px">×</button>
                `;
            }, 'exam_users', false);
        });
    });
}

function renderRankings(sortMode) {
    if (currentTab !== 'rank') return;
    if (!sortMode) sortMode = document.querySelector('.ip-filter-btn.active')?.dataset.sort || 'level';
    chrome.storage.sync.get(['friends'], async (res) => {
        const items = (res.friends || []).map(login => new Promise(r => chrome.storage.local.get([`data_${login}`], d => r({ login, ...(d[`data_${login}`] || {}) }))));
        Promise.all(items).then(dataList => {
            dataList.sort((a, b) => sortMode === 'level' ? (b.level || 0) - (a.level || 0) : (b.correction_point || 0) - (a.correction_point || 0));
            updateListDOM('list-rank', dataList, (u, index) => {
                let val = sortMode === 'level' ? `Lvl ${(u.level || 0).toFixed(2)}` : `${u.correction_point || 0} Points`;
                return `
                    <div class="ip-user-info">
                        <span style="font-weight:bold; color:#666; width:25px">${index === 0 ? '👑' : `#${index + 1}`}</span>
                        <img src="${u.image || DEFAULT_AVATAR}" class="ip-avatar" style="width:24px; height:24px">
                        <span class="ip-login">${u.login}</span>
                    </div>
                    <div class="ip-rank-val ${index === 0 ? 'gold' : ''}">${val}</div>
                `;
            }, '', false);
        });
    });
}