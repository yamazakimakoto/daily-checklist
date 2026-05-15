// ===== State =====
const DEFAULT_ITEMS = [
  '早起き（目標時刻に起床）', '朝の挨拶・声かけ', '新聞・ニュースの確認',
  '読書（10分以上）', '日記・メモの記録', '運動・ストレッチ',
  'ウォーキング（30分）', '水を十分に飲む', '感謝の言葉を伝える',
  '整理整頓（5分）', '計画の見直し', '優先事項の確認',
  '一つ新しいことを学ぶ', '人の話を傾聴する', '笑顔で接する',
  '時間を守る', '約束を守る', '報告・連絡・相談',
  '丁寧な言葉遣い', '食事をよく噛む', '間食を控える',
  '姿勢を正す', '深呼吸（3回）', 'スマホ時間の制限',
  '寝る前の振り返り', '明日の準備', '家族との会話',
  '地域への貢献', '目標の確認', '感謝の気持ちで就寝'
];

let state = {
  year: new Date().getFullYear(),
  month: new Date().getMonth(),
  mobileDay: new Date().getDate(),
  items: [],
  checks: {},
  reflections: {},
  monthGoals: {},
  monthReviews: {},
  todos: {} // YYYY-MM-DD → text
};

// ===== Storage (IndexedDB primary + localStorage backup) =====
var DB_NAME = 'checklist_db';
var DB_VERSION = 1;
var DB_STORE = 'data';
var _db = null;

function openDB() {
  return new Promise(function(resolve, reject) {
    if (_db) { resolve(_db); return; }
    var req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = function(e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE);
      }
    };
    req.onsuccess = function(e) { _db = e.target.result; resolve(_db); };
    req.onerror = function() { reject(req.error); };
  });
}

function idbGet(key) {
  return openDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(DB_STORE, 'readonly');
      var req = tx.objectStore(DB_STORE).get(key);
      req.onsuccess = function() { resolve(req.result); };
      req.onerror = function() { reject(req.error); };
    });
  });
}

function idbSet(key, value) {
  return openDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(value, key);
      tx.oncomplete = function() { resolve(); };
      tx.onerror = function() { reject(tx.error); };
    });
  });
}

// Dual-write: save to both IndexedDB and localStorage
function dualSave(key, value) {
  // localStorage (sync, fast, but may be purged by Safari ITP)
  try { localStorage.setItem(key, value); } catch(e) {}
  // IndexedDB (async, persistent)
  idbSet(key, value).catch(function(e) {
    console.error('IndexedDB save error:', e);
  });
}

// Read from IndexedDB first, fall back to localStorage
function dualLoad(key) {
  return idbGet(key).then(function(val) {
    if (val !== undefined && val !== null) return val;
    // Fallback to localStorage
    return localStorage.getItem(key);
  }).catch(function() {
    // IndexedDB failed, use localStorage
    return localStorage.getItem(key);
  });
}

function storageKey(prefix) {
  var mm = String(state.month + 1).padStart(2, '0');
  return 'checklist_' + prefix + '_' + state.year + '-' + mm;
}

function globalKey(key) { return 'checklist_' + key; }

function monthKey() {
  return state.year + '-' + String(state.month + 1).padStart(2, '0');
}

// Async load from IndexedDB with localStorage fallback
function loadData() {
  var keys = {
    items: globalKey('items'),
    checks: storageKey('checks'),
    reflections: storageKey('reflections'),
    goal: storageKey('goal'),
    review: storageKey('review'),
    todos: globalKey('todos')
  };

  return Promise.all([
    dualLoad(keys.items),
    dualLoad(keys.checks),
    dualLoad(keys.reflections),
    dualLoad(keys.goal),
    dualLoad(keys.review),
    dualLoad(keys.todos)
  ]).then(function(results) {
    var mk = monthKey();

    // Items
    if (results[0]) {
      try { state.items = JSON.parse(results[0]); } catch(e) { state.items = DEFAULT_ITEMS.slice(); }
    } else {
      state.items = DEFAULT_ITEMS.slice();
    }
    // Always persist items to both stores
    dualSave(keys.items, JSON.stringify(state.items));

    // Checks
    if (results[1]) {
      try { state.checks[mk] = JSON.parse(results[1]); } catch(e) { state.checks[mk] = {}; }
    } else {
      state.checks[mk] = {};
    }

    // Reflections
    if (results[2]) {
      try { state.reflections[mk] = JSON.parse(results[2]); } catch(e) { state.reflections[mk] = {}; }
    } else {
      state.reflections[mk] = {};
    }

    // Goal
    state.monthGoals[mk] = results[3] || '';

    // Review
    state.monthReviews[mk] = results[4] || '';

    // Todos (global, keyed by YYYY-MM-DD)
    if (results[5]) {
      try { state.todos = JSON.parse(results[5]); } catch(e) { state.todos = {}; }
    } else {
      state.todos = {};
    }
  }).catch(function(e) {
    console.error('データ読み込みエラー:', e);
    state.items = DEFAULT_ITEMS.slice();
    var mk = monthKey();
    state.checks[mk] = {};
    state.reflections[mk] = {};
    state.monthGoals[mk] = '';
    state.monthReviews[mk] = '';
    state.todos = {};
  });
}

function saveItems() {
  dualSave(globalKey('items'), JSON.stringify(state.items));
  markUnsavedBackup();
}
function saveChecks() {
  dualSave(storageKey('checks'), JSON.stringify(state.checks[monthKey()] || {}));
  markUnsavedBackup();
}
function saveReflections() {
  dualSave(storageKey('reflections'), JSON.stringify(state.reflections[monthKey()] || {}));
  markUnsavedBackup();
}
function saveGoal() {
  dualSave(storageKey('goal'), state.monthGoals[monthKey()] || '');
  markUnsavedBackup();
}
function saveReview() {
  dualSave(storageKey('review'), state.monthReviews[monthKey()] || '');
  markUnsavedBackup();
}
function saveTodos() {
  dualSave(globalKey('todos'), JSON.stringify(state.todos || {}));
  markUnsavedBackup();
}

// ===== Today's TODO =====
function todayDateKey() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function todayDateLabel() {
  var d = new Date();
  return (d.getMonth() + 1) + '/' + d.getDate() + '(' + DOW[d.getDay()] + ')';
}

function getTodayTodo() {
  return state.todos[todayDateKey()] || '';
}

function setTodayTodo(text) {
  var key = todayDateKey();
  if (text) state.todos[key] = text;
  else delete state.todos[key];
  saveTodos();
}

function renderTodayTodo() {
  var val = getTodayTodo();
  var label = todayDateLabel();
  var pcTa = document.getElementById('todayTodo');
  if (pcTa) {
    pcTa.value = val;
    document.getElementById('todoCharCount').textContent = val.length;
    document.getElementById('todayTodoDate').textContent = label;
  }
  var mTa = document.getElementById('mobileTodayTodo');
  if (mTa) {
    mTa.value = val;
    document.getElementById('mobileTodoCharCount').textContent = val.length;
    document.getElementById('mobileTodayTodoDate').textContent = label;
  }
}

function copyTodoToNotes() {
  var text = (getTodayTodo() || '').trim();
  if (!text) {
    alert('今日のＴＯＤＯが空です。');
    return;
  }
  var fullText = '今日のＴＯＤＯ ' + todayDateLabel() + '\n' + text;

  // 1) Try Web Share API (iOS Safari: share sheet includes Notes)
  if (navigator.share) {
    navigator.share({ title: '今日のＴＯＤＯ ' + todayDateLabel(), text: fullText })
      .catch(function() { fallbackClipboard(fullText); });
    return;
  }
  fallbackClipboard(fullText);
}

function fallbackClipboard(text) {
  // 2) Clipboard API
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function() {
      alert('クリップボードにコピーしました。\nメモ帳を開いて貼り付けてください。');
    }).catch(function() { execCopy(text); });
    return;
  }
  execCopy(text);
}

function execCopy(text) {
  // 3) Legacy fallback
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand('copy');
    alert('クリップボードにコピーしました。\nメモ帳を開いて貼り付けてください。');
  } catch(e) {
    alert('コピーに失敗しました。');
  }
  document.body.removeChild(ta);
}

// Track if data has changed since last full backup
function markUnsavedBackup() {
  try { localStorage.setItem('checklist_lastModified', String(Date.now())); } catch(e) {}
}
function markBackupDone() {
  try {
    localStorage.setItem('checklist_lastBackup', String(Date.now()));
    localStorage.setItem('checklist_lastModified', String(Date.now() - 1));
  } catch(e) {}
}
function hasUnsavedChanges() {
  try {
    var mod = parseInt(localStorage.getItem('checklist_lastModified') || '0');
    var bk = parseInt(localStorage.getItem('checklist_lastBackup') || '0');
    return mod > bk;
  } catch(e) { return false; }
}

// Show backup reminder if last backup is older than 7 days and there's data
function checkBackupReminder() {
  try {
    var bk = parseInt(localStorage.getItem('checklist_lastBackup') || '0');
    var mod = parseInt(localStorage.getItem('checklist_lastModified') || '0');
    var now = Date.now();
    var SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    // No backup ever made and there is data
    if (bk === 0 && mod > 0) {
      setTimeout(function() {
        if (confirm('まだ一度もバックアップが取られていません。\n「全データバックアップ」を実行しますか？\n\n（推奨：週1回、データ消失防止のため）')) {
          exportAllExcel();
        }
      }, 3000);
      return;
    }
    // Last backup too old
    if (mod > bk && (now - bk) > SEVEN_DAYS) {
      setTimeout(function() {
        if (confirm('前回のバックアップから7日以上経過しています。\n「全データバックアップ」を実行しますか？')) {
          exportAllExcel();
        }
      }, 3000);
    }
  } catch(e) {}
}

// Get all months that have data in storage
function getAllStoredMonths() {
  return openDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(DB_STORE, 'readonly');
      var req = tx.objectStore(DB_STORE).getAllKeys();
      req.onsuccess = function() { resolve(req.result || []); };
      req.onerror = function() { reject(req.error); };
    });
  }).catch(function() {
    // Fallback: scan localStorage
    var keys = [];
    for (var i = 0; i < localStorage.length; i++) {
      keys.push(localStorage.key(i));
    }
    return keys;
  }).then(function(allKeys) {
    // Merge with localStorage keys
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (allKeys.indexOf(k) < 0) allKeys.push(k);
    }
    var months = {};
    allKeys.forEach(function(k) {
      var m = String(k).match(/^checklist_(checks|reflections|goal|review)_(\d{4}-\d{2})$/);
      if (m) months[m[2]] = true;
    });
    return Object.keys(months).sort();
  });
}

// Load data for a specific month (without changing state)
function loadMonthData(yyyymm) {
  var parts = yyyymm.split('-');
  var year = parseInt(parts[0]);
  var month = parseInt(parts[1]) - 1;
  var prefix = 'checklist_';
  var suffix = '_' + yyyymm;
  return Promise.all([
    dualLoad(prefix + 'checks' + suffix),
    dualLoad(prefix + 'reflections' + suffix),
    dualLoad(prefix + 'goal' + suffix),
    dualLoad(prefix + 'review' + suffix)
  ]).then(function(r) {
    var checks = {}, reflections = {};
    try { if (r[0]) checks = JSON.parse(r[0]); } catch(e) {}
    try { if (r[1]) reflections = JSON.parse(r[1]); } catch(e) {}
    return {
      year: year, month: month, yyyymm: yyyymm,
      checks: checks, reflections: reflections,
      goal: r[2] || '', review: r[3] || ''
    };
  });
}

// ===== Helpers =====
function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function dayOfWeek(y, m, d) { return new Date(y, m, d).getDay(); }
var DOW = ['日', '月', '火', '水', '木', '金', '土'];

function getCheck(day, itemIdx) {
  var ck = String(day).padStart(2, '0') + '-' + itemIdx;
  return (state.checks[monthKey()] || {})[ck] || '';
}

function setCheck(day, itemIdx, val) {
  var mk = monthKey();
  if (!state.checks[mk]) state.checks[mk] = {};
  var ck = String(day).padStart(2, '0') + '-' + itemIdx;
  if (val) state.checks[mk][ck] = val;
  else delete state.checks[mk][ck];
  saveChecks();
}

function toggleCheck(day, itemIdx) {
  var cur = getCheck(day, itemIdx);
  if (cur === '') return 'ok';
  if (cur === 'ok') return 'ng';
  if (cur === 'ng') return 'planned';
  return '';
}

function getReflection(day) {
  return (state.reflections[monthKey()] || {})[String(day).padStart(2, '0')] || '';
}

function setReflection(day, text) {
  var mk = monthKey();
  if (!state.reflections[mk]) state.reflections[mk] = {};
  state.reflections[mk][String(day).padStart(2, '0')] = text;
  saveReflections();
}

// ===== Rate Calculation =====
function calcItemRate(itemIdx) {
  var days = daysInMonth(state.year, state.month);
  var today = new Date();
  var isCurrentMonth = state.year === today.getFullYear() && state.month === today.getMonth();
  var maxDay = isCurrentMonth ? today.getDate() : days;
  var ok = 0, total = 0;
  for (var d = 1; d <= maxDay; d++) {
    var v = getCheck(d, itemIdx);
    if (v === 'ok') ok++;
    if (v === 'ok' || v === 'ng') total++;
  }
  if (total === 0) return '-';
  return Math.round((ok / total) * 100) + '%';
}

function calcDayRate(day) {
  var ok = 0, total = 0;
  for (var i = 0; i < state.items.length; i++) {
    var v = getCheck(day, i);
    if (v === 'ok') ok++;
    if (v === 'ok' || v === 'ng') total++;
  }
  if (total === 0) return '-';
  return Math.round((ok / total) * 100) + '%';
}

function calcMonthlyRate() {
  var days = daysInMonth(state.year, state.month);
  var today = new Date();
  var isCurrentMonth = state.year === today.getFullYear() && state.month === today.getMonth();
  var maxDay = isCurrentMonth ? today.getDate() : days;
  var ok = 0, total = 0;
  for (var d = 1; d <= maxDay; d++) {
    for (var i = 0; i < state.items.length; i++) {
      var v = getCheck(d, i);
      if (v === 'ok') ok++;
      if (v === 'ok' || v === 'ng') total++;
    }
  }
  if (total === 0) return '-';
  return Math.round((ok / total) * 100) + '%';
}

// ===== Row Operations =====
function reindexChecks(oldIdx, newIdx, operation) {
  // Reindex check data when items are moved/deleted/inserted
  var mk = monthKey();
  var oldChecks = state.checks[mk] || {};
  var newChecks = {};
  var days = daysInMonth(state.year, state.month);

  for (var d = 1; d <= days; d++) {
    var dd = String(d).padStart(2, '0');
    for (var i = 0; i < state.items.length; i++) {
      var sourceIdx = i;
      if (operation === 'delete') {
        if (i >= oldIdx) sourceIdx = i + 1;
      } else if (operation === 'insert') {
        if (i === newIdx) continue; // new row, no data
        if (i > newIdx) sourceIdx = i - 1;
      } else if (operation === 'swap') {
        if (i === oldIdx) sourceIdx = newIdx;
        else if (i === newIdx) sourceIdx = oldIdx;
      }
      var val = oldChecks[dd + '-' + sourceIdx];
      if (val) newChecks[dd + '-' + i] = val;
    }
  }
  state.checks[mk] = newChecks;
  saveChecks();
}

function addItem(name) {
  state.items.push(name || '新しい項目');
  saveItems();
  renderAll();
}

function deleteItem(idx) {
  if (state.items.length <= 1) { alert('最低1つの項目が必要です。'); return; }
  if (!confirm('「' + state.items[idx] + '」を削除しますか？\nチェックデータも削除されます。')) return;
  state.items.splice(idx, 1);
  reindexChecks(idx, -1, 'delete');
  saveItems();
  renderAll();
}

function copyItem(idx) {
  var newIdx = idx + 1;
  state.items.splice(newIdx, 0, state.items[idx] + '（コピー）');
  reindexChecks(-1, newIdx, 'insert');
  saveItems();
  renderAll();
}

function moveItem(idx, direction) {
  var target = idx + direction;
  if (target < 0 || target >= state.items.length) return;
  var temp = state.items[idx];
  state.items[idx] = state.items[target];
  state.items[target] = temp;
  reindexChecks(idx, target, 'swap');
  saveItems();
  renderAll();
}

// ===== Row Menu =====
var activeMenuIdx = -1;

function showRowMenu(idx, x, y) {
  activeMenuIdx = idx;
  var menu = document.getElementById('rowMenu');
  menu.style.display = 'block';
  menu.style.left = Math.min(x, window.innerWidth - 160) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - 200) + 'px';
}

function hideRowMenu() {
  document.getElementById('rowMenu').style.display = 'none';
  activeMenuIdx = -1;
}

// ===== Goal =====
function renderGoalBar() {
  var goal = state.monthGoals[monthKey()] || '';
  var el = document.getElementById('goalDisplay');
  if (goal) {
    el.textContent = goal;
    el.classList.remove('empty');
  } else {
    el.textContent = 'クリックして今月の目標を設定';
    el.classList.add('empty');
  }
}

function openGoalModal() {
  var modal = document.getElementById('goalModal');
  var input = document.getElementById('goalInput');
  input.value = state.monthGoals[monthKey()] || '';
  document.getElementById('goalCharCount').textContent = input.value.length;
  modal.style.display = 'flex';
  input.focus();
}

function closeGoalModal() {
  document.getElementById('goalModal').style.display = 'none';
}

function saveGoalFromModal() {
  var val = document.getElementById('goalInput').value;
  state.monthGoals[monthKey()] = val;
  saveGoal();
  renderGoalBar();
  closeGoalModal();
}

// ===== Month Review =====
function renderMonthReview() {
  var val = state.monthReviews[monthKey()] || '';
  var ta = document.getElementById('monthReview');
  if (ta) {
    ta.value = val;
    document.getElementById('reviewCharCount').textContent = val.length;
  }
  // Mobile
  var mta = document.getElementById('mobileMonthReview');
  if (mta) {
    mta.value = val;
    document.getElementById('mobileReviewCharCount').textContent = val.length;
  }
}

// ===== Sticky Top Calculation =====
function updateStickyTop() {
  var header = document.getElementById('mainHeader');
  var goalBar = document.getElementById('goalBar');
  var hh = header.offsetHeight;
  goalBar.style.top = hh + 'px';
}

// ===== PC Render =====
function renderPC() {
  var days = daysInMonth(state.year, state.month);
  var today = new Date();
  var isToday = function(d) {
    return state.year === today.getFullYear() && state.month === today.getMonth() && d === today.getDate();
  };

  // Header
  var headHtml = '<tr><th>実践項目</th>';
  for (var d = 1; d <= days; d++) {
    var dow = dayOfWeek(state.year, state.month, d);
    var cls = [];
    if (dow === 0 || dow === 6) cls.push('weekend');
    if (isToday(d)) cls.push('today');
    headHtml += '<th class="' + cls.join(' ') + '">' + d + '<br>' + DOW[dow] + '</th>';
  }
  headHtml += '<th>実施率</th></tr>';
  document.getElementById('gridHead').innerHTML = headHtml;

  // Body
  var bodyHtml = '';
  for (var i = 0; i < state.items.length; i++) {
    bodyHtml += '<tr>';
    bodyHtml += '<td><div class="item-cell">'
      + '<button class="row-action-btn" data-idx="' + i + '" title="操作">&#8942;</button>'
      + '<span class="item-name" data-idx="' + i + '" title="クリックで編集">' + escHtml(state.items[i]) + '</span>'
      + '</div></td>';
    for (var d = 1; d <= days; d++) {
      var v = getCheck(d, i);
      var cls = '', txt = '';
      if (v === 'ok') { cls = 'mark-ok'; txt = '\u25CE'; }
      else if (v === 'ng') { cls = 'mark-ng'; txt = '\u00D7'; }
      else if (v === 'planned') { cls = 'mark-planned'; txt = '予'; }
      bodyHtml += '<td class="' + cls + '" data-day="' + d + '" data-item="' + i + '">' + txt + '</td>';
    }
    bodyHtml += '<td>' + calcItemRate(i) + '</td>';
    bodyHtml += '</tr>';
  }
  document.getElementById('gridBody').innerHTML = bodyHtml;

  // Footer
  var grid = document.getElementById('checkGrid');
  var tfoot = grid.querySelector('tfoot');
  if (!tfoot) { tfoot = document.createElement('tfoot'); grid.appendChild(tfoot); }
  var footHtml = '<tr><td>日別実施率</td>';
  for (var d = 1; d <= days; d++) {
    footHtml += '<td>' + calcDayRate(d) + '</td>';
  }
  footHtml += '<td></td></tr>';
  tfoot.innerHTML = footHtml;

  renderReflections();
  renderMonthReview();
  // Update sticky positions after render
  requestAnimationFrame(updateStickyTop);
}

function renderReflections() {
  var days = daysInMonth(state.year, state.month);
  var html = '';
  for (var d = 1; d <= days; d++) {
    var dow = DOW[dayOfWeek(state.year, state.month, d)];
    var text = getReflection(d);
    html += '<div class="reflection-card">'
      + '<div class="date-label">' + (state.month + 1) + '/' + d + '(' + dow + ')</div>'
      + '<textarea data-day="' + d + '" maxlength="200" placeholder="振り返りを入力（200字以内）">' + escHtml(text) + '</textarea>'
      + '<div class="char-count"><span class="rc-count">' + text.length + '</span>/200</div>'
      + '</div>';
  }
  document.getElementById('reflectionGrid').innerHTML = html;

  document.querySelectorAll('#reflectionGrid textarea').forEach(function(ta) {
    ta.addEventListener('input', function() {
      var day = parseInt(this.dataset.day);
      setReflection(day, this.value);
      this.parentElement.querySelector('.rc-count').textContent = this.value.length;
    });
  });
}

// ===== Mobile Mode =====
var mobileMode = 'check'; // 'check' or 'edit'

function setMobileMode(mode) {
  mobileMode = mode;
  var checkBtn = document.getElementById('mobileCheckMode');
  var editBtn = document.getElementById('mobileEditMode');
  var checkList = document.getElementById('mobileCheckList');
  var editList = document.getElementById('mobileEditList');
  var addItem = document.getElementById('mobileAddItem');

  if (mode === 'check') {
    checkBtn.classList.add('active');
    editBtn.classList.remove('active');
    checkList.style.display = '';
    editList.style.display = 'none';
    addItem.style.display = 'none';
  } else {
    checkBtn.classList.remove('active');
    editBtn.classList.add('active');
    checkList.style.display = 'none';
    editList.style.display = '';
    addItem.style.display = '';
    renderMobileEditList();
  }
}

function renderMobileEditList() {
  var html = '';
  for (var i = 0; i < state.items.length; i++) {
    html += '<div class="mobile-edit-item" data-idx="' + i + '">'
      + '<span class="edit-num">' + (i + 1) + '</span>'
      + '<span class="edit-name">' + escHtml(state.items[i]) + '</span>'
      + '<div class="mobile-edit-actions">'
      + '<button data-act="up" title="上へ">↑</button>'
      + '<button data-act="down" title="下へ">↓</button>'
      + '<button data-act="edit" title="編集">✎</button>'
      + '<button data-act="copy" title="コピー">⧉</button>'
      + '<button data-act="delete" class="danger" title="削除">✕</button>'
      + '</div></div>';
  }
  document.getElementById('mobileEditList').innerHTML = html;
}

// ===== Mobile Render =====
function renderMobile() {
  var days = daysInMonth(state.year, state.month);
  if (state.mobileDay > days) state.mobileDay = days;

  var dow = DOW[dayOfWeek(state.year, state.month, state.mobileDay)];
  document.getElementById('currentDay').textContent = (state.month + 1) + '/' + state.mobileDay + '(' + dow + ')';
  document.getElementById('mobileDayRate').textContent = '本日の実施率: ' + calcDayRate(state.mobileDay);

  var html = '';
  for (var i = 0; i < state.items.length; i++) {
    var v = getCheck(state.mobileDay, i);
    var markCls = '', markTxt = '';
    if (v === 'ok') { markCls = 'ok'; markTxt = '\u25CE'; }
    else if (v === 'ng') { markCls = 'ng'; markTxt = '\u00D7'; }
    else if (v === 'planned') { markCls = 'planned'; markTxt = '予'; }
    html += '<div class="mobile-check-item" data-item="' + i + '">'
      + '<div class="mobile-check-mark ' + markCls + '">' + markTxt + '</div>'
      + '<div class="mobile-check-label">' + escHtml(state.items[i]) + '</div>'
      + '</div>';
  }
  document.getElementById('mobileCheckList').innerHTML = html;

  document.querySelectorAll('.mobile-check-item').forEach(function(el) {
    el.addEventListener('click', function() {
      var item = parseInt(this.dataset.item);
      var newVal = toggleCheck(state.mobileDay, item);
      setCheck(state.mobileDay, item, newVal);
      renderMobile();
      updateMonthlyRate();
    });
  });

  // Also update edit list if in edit mode
  if (mobileMode === 'edit') renderMobileEditList();

  // Reflection
  var ref = getReflection(state.mobileDay);
  var ta = document.getElementById('mobileReflection');
  ta.value = ref;
  document.getElementById('mobileCharCount').textContent = ref.length;
  ta.oninput = function() {
    setReflection(state.mobileDay, this.value);
    document.getElementById('mobileCharCount').textContent = this.value.length;
  };

  renderMonthReview();
}

// ===== Navigation =====
function updateMonthDisplay() {
  document.getElementById('currentMonth').textContent = state.year + '年' + (state.month + 1) + '月';
}

function updateMonthlyRate() {
  document.getElementById('monthlyRate').textContent = '月間実施率: ' + calcMonthlyRate();
}

function renderAll() {
  renderPC();
  renderMobile();
  renderGoalBar();
  renderTodayTodo();
  updateMonthlyRate();
}

function changeMonth(delta) {
  state.month += delta;
  if (state.month < 0) { state.month = 11; state.year--; }
  if (state.month > 11) { state.month = 0; state.year++; }
  state.mobileDay = 1;
  updateMonthDisplay();
  loadData().then(function() {
    renderAll();
  });
}

function changeDay(delta) {
  var days = daysInMonth(state.year, state.month);
  state.mobileDay += delta;
  if (state.mobileDay < 1) state.mobileDay = days;
  if (state.mobileDay > days) state.mobileDay = 1;
  renderMobile();
}

// ===== Excel Export =====
function exportExcel() {
  if (typeof XLSX === 'undefined') {
    alert('Excelライブラリの読み込みに失敗しました。インターネット接続を確認してください。');
    return;
  }

  var days = daysInMonth(state.year, state.month);
  var mm = String(state.month + 1).padStart(2, '0');
  var wb = XLSX.utils.book_new();

  // Sheet 1: Check data
  var header = ['実践項目'];
  for (var d = 1; d <= days; d++) {
    header.push(d + '(' + DOW[dayOfWeek(state.year, state.month, d)] + ')');
  }
  header.push('実施率');

  var rows = [header];
  for (var i = 0; i < state.items.length; i++) {
    var row = [state.items[i]];
    for (var d = 1; d <= days; d++) {
      var v = getCheck(d, i);
      row.push(v === 'ok' ? '\u25CE' : v === 'ng' ? '\u00D7' : v === 'planned' ? '予' : '');
    }
    row.push(calcItemRate(i));
    rows.push(row);
  }

  var rateRow = ['日別実施率'];
  for (var d = 1; d <= days; d++) rateRow.push(calcDayRate(d));
  rateRow.push(calcMonthlyRate());
  rows.push(rateRow);

  var ws1 = XLSX.utils.aoa_to_sheet(rows);
  ws1['!cols'] = [{ wch: 25 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'チェックリスト');

  // Sheet 2: Goal & Review
  var goalRows = [
    ['今月の目標'],
    [state.monthGoals[monthKey()] || ''],
    [],
    ['今月のメモ・反省'],
    [state.monthReviews[monthKey()] || '']
  ];
  var ws2 = XLSX.utils.aoa_to_sheet(goalRows);
  ws2['!cols'] = [{ wch: 60 }];
  XLSX.utils.book_append_sheet(wb, ws2, '目標・メモ');

  // Sheet 3: Reflections
  var refRows = [['日付', '振り返り']];
  for (var d = 1; d <= days; d++) {
    refRows.push([(state.month + 1) + '/' + d + '(' + DOW[dayOfWeek(state.year, state.month, d)] + ')', getReflection(d)]);
  }
  var ws3 = XLSX.utils.aoa_to_sheet(refRows);
  ws3['!cols'] = [{ wch: 12 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, ws3, '振り返り');

  XLSX.writeFile(wb, '実践チェックリスト_' + state.year + '年' + mm + '月.xlsx');
  markBackupDone();
}

// ===== Full Backup Export (All Months) =====
function exportAllExcel(opts) {
  opts = opts || {};
  if (typeof XLSX === 'undefined') {
    alert('Excelライブラリの読み込みに失敗しました。インターネット接続を確認してください。');
    return Promise.reject(new Error('XLSX not loaded'));
  }

  return getAllStoredMonths().then(function(months) {
    if (months.length === 0 && !opts.silent) {
      alert('バックアップ対象のデータがありません。');
      return;
    }

    var wb = XLSX.utils.book_new();

    // Sheet 1: Master items list
    var itemRows = [['No', '項目名']];
    state.items.forEach(function(it, idx) {
      itemRows.push([idx + 1, it]);
    });
    var wsItems = XLSX.utils.aoa_to_sheet(itemRows);
    wsItems['!cols'] = [{ wch: 6 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, wsItems, '_項目一覧');

    // Sheet 2: All goals & reviews summary
    var grRows = [['年月', '今月の目標', '今月のメモ・反省']];

    // Sheet 3: All reflections summary
    var refRows = [['年月日', '曜日', '振り返り']];

    return Promise.all(months.map(loadMonthData)).then(function(allData) {
      // Build summary rows + per-month sheets
      allData.forEach(function(md) {
        // Goals/reviews row
        if (md.goal || md.review) {
          grRows.push([md.yyyymm, md.goal, md.review]);
        }

        // Reflections rows
        var days = daysInMonth(md.year, md.month);
        for (var d = 1; d <= days; d++) {
          var dd = String(d).padStart(2, '0');
          if (md.reflections[dd]) {
            refRows.push([
              md.yyyymm + '-' + dd,
              DOW[dayOfWeek(md.year, md.month, d)],
              md.reflections[dd]
            ]);
          }
        }

        // Per-month checks sheet
        var header = ['実践項目'];
        for (var d2 = 1; d2 <= days; d2++) {
          header.push(d2 + '(' + DOW[dayOfWeek(md.year, md.month, d2)] + ')');
        }
        var rows = [header];
        for (var i = 0; i < state.items.length; i++) {
          var row = [state.items[i]];
          for (var d3 = 1; d3 <= days; d3++) {
            var ck = String(d3).padStart(2, '0') + '-' + i;
            var v = md.checks[ck] || '';
            row.push(v === 'ok' ? '◎' : v === 'ng' ? '×' : v === 'planned' ? '予' : '');
          }
          rows.push(row);
        }
        var wsM = XLSX.utils.aoa_to_sheet(rows);
        wsM['!cols'] = [{ wch: 25 }];
        XLSX.utils.book_append_sheet(wb, wsM, md.yyyymm);
      });

      var wsGR = XLSX.utils.aoa_to_sheet(grRows);
      wsGR['!cols'] = [{ wch: 10 }, { wch: 50 }, { wch: 50 }];
      XLSX.utils.book_append_sheet(wb, wsGR, '_目標・メモ一覧');

      var wsRef = XLSX.utils.aoa_to_sheet(refRows);
      wsRef['!cols'] = [{ wch: 14 }, { wch: 6 }, { wch: 60 }];
      XLSX.utils.book_append_sheet(wb, wsRef, '_振り返り一覧');

      // Filename
      var now = new Date();
      var yyyy = now.getFullYear();
      var mm2 = String(now.getMonth() + 1).padStart(2, '0');
      var dd2 = String(now.getDate()).padStart(2, '0');
      var hh = String(now.getHours()).padStart(2, '0');
      var mi = String(now.getMinutes()).padStart(2, '0');
      var fname = '実践チェックリスト_全データ_' + yyyy + mm2 + dd2 + '_' + hh + mi + '.xlsx';

      XLSX.writeFile(wb, fname);
      markBackupDone();

      if (!opts.silent) {
        alert('全データ（' + months.length + 'ヶ月分）をバックアップしました。\nファイル: ' + fname);
      }
    });
  });
}

// ===== Full Backup Import (All Months) =====
function importAllExcel(file) {
  if (typeof XLSX === 'undefined') {
    alert('Excelライブラリの読み込みに失敗しました。インターネット接続を確認してください。');
    return;
  }

  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var wb = XLSX.read(e.target.result, { type: 'array' });

      // Detect month sheets (named like "2026-04")
      var monthSheets = wb.SheetNames.filter(function(n) {
        return /^\d{4}-\d{2}$/.test(n);
      });

      if (monthSheets.length === 0) {
        // Not a full-backup file. Show error.
        alert('このファイルは全データバックアップ形式ではありません。\n「今月読込」を使ってください。');
        return;
      }

      // Parse items list
      var newItems = [];
      var wsItems = wb.Sheets['_項目一覧'];
      if (wsItems) {
        var itemRows = XLSX.utils.sheet_to_json(wsItems, { header: 1 });
        for (var r = 1; r < itemRows.length; r++) {
          var name = String(itemRows[r][1] || '').trim();
          if (name) newItems.push(name);
        }
      }

      // If no items sheet, derive from first month sheet
      if (newItems.length === 0) {
        var ws0 = wb.Sheets[monthSheets[0]];
        var d0 = XLSX.utils.sheet_to_json(ws0, { header: 1 });
        for (var r = 1; r < d0.length; r++) {
          var nm = String(d0[r][0] || '').trim();
          if (nm && nm !== '日別実施率') newItems.push(nm);
        }
      }

      if (newItems.length === 0) {
        alert('項目データが見つかりません。');
        return;
      }

      // Parse goals/reviews (新形式 "_目標・メモ一覧" / 旧形式 "_目標・反省一覧" を両対応)
      var goalsByMonth = {};
      var reviewsByMonth = {};
      var wsGR = wb.Sheets['_目標・メモ一覧'] || wb.Sheets['_目標・反省一覧'];
      if (wsGR) {
        var grRows = XLSX.utils.sheet_to_json(wsGR, { header: 1, defval: '' });
        for (var r = 1; r < grRows.length; r++) {
          var ym = String(grRows[r][0] || '').trim();
          if (/^\d{4}-\d{2}$/.test(ym)) {
            goalsByMonth[ym] = String(grRows[r][1] || '');
            reviewsByMonth[ym] = String(grRows[r][2] || '');
          }
        }
      }

      // Parse reflections
      var reflectionsByMonth = {};
      var wsRef = wb.Sheets['_振り返り一覧'];
      if (wsRef) {
        var refRows = XLSX.utils.sheet_to_json(wsRef, { header: 1, defval: '' });
        for (var r = 1; r < refRows.length; r++) {
          var ymd = String(refRows[r][0] || '').trim();
          var m = ymd.match(/^(\d{4}-\d{2})-(\d{2})$/);
          if (m) {
            if (!reflectionsByMonth[m[1]]) reflectionsByMonth[m[1]] = {};
            reflectionsByMonth[m[1]][m[2]] = String(refRows[r][2] || '');
          }
        }
      }

      // Parse per-month checks
      var checksByMonth = {};
      monthSheets.forEach(function(sheetName) {
        var ws = wb.Sheets[sheetName];
        var data = XLSX.utils.sheet_to_json(ws, { header: 1 });
        if (data.length < 2) return;

        var headerRow = data[0];
        var dayColumns = {};
        for (var c = 1; c < headerRow.length; c++) {
          var hdr = String(headerRow[c] || '');
          var dayMatch = hdr.match(/^(\d{1,2})\(/);
          if (dayMatch) dayColumns[parseInt(dayMatch[1])] = c;
        }

        var checks = {};
        for (var r = 1; r < data.length; r++) {
          var row = data[r];
          var itemName = String(row[0] || '').trim();
          if (!itemName || itemName === '日別実施率') continue;
          var itemIdx = newItems.indexOf(itemName);
          if (itemIdx < 0) continue;

          for (var day in dayColumns) {
            var cellVal = String(row[dayColumns[day]] || '').trim();
            var checkVal = '';
            if (cellVal === '◎' || cellVal === '◎' || cellVal === '○') checkVal = 'ok';
            else if (cellVal === '×' || cellVal === '×' || cellVal === 'x' || cellVal === 'X') checkVal = 'ng';
            else if (cellVal === '予') checkVal = 'planned';
            if (checkVal) {
              var ck = String(day).padStart(2, '0') + '-' + itemIdx;
              checks[ck] = checkVal;
            }
          }
        }
        checksByMonth[sheetName] = checks;
      });

      // Confirm
      var totalChecks = 0;
      Object.keys(checksByMonth).forEach(function(m) { totalChecks += Object.keys(checksByMonth[m]).length; });
      var totalRef = 0;
      Object.keys(reflectionsByMonth).forEach(function(m) { totalRef += Object.keys(reflectionsByMonth[m]).length; });

      var msg = '以下のデータを復元します：\n\n'
        + '■ 対象月数: ' + monthSheets.length + 'ヶ月\n'
        + '■ 月: ' + monthSheets.join(', ') + '\n'
        + '■ 項目数: ' + newItems.length + '件\n'
        + '■ チェックデータ: ' + totalChecks + '件\n'
        + '■ 振り返り: ' + totalRef + '日分\n'
        + '■ 目標: ' + Object.keys(goalsByMonth).filter(function(k){return goalsByMonth[k];}).length + 'ヶ月分\n'
        + '■ メモ・反省: ' + Object.keys(reviewsByMonth).filter(function(k){return reviewsByMonth[k];}).length + 'ヶ月分\n\n'
        + '⚠️ 現在のデータは全て上書きされます。よろしいですか？';

      if (!confirm(msg)) return;

      // Save items globally
      state.items = newItems;
      saveItems();

      // Save each month's data
      monthSheets.forEach(function(ym) {
        dualSave('checklist_checks_' + ym, JSON.stringify(checksByMonth[ym] || {}));
      });
      Object.keys(goalsByMonth).forEach(function(ym) {
        dualSave('checklist_goal_' + ym, goalsByMonth[ym] || '');
      });
      Object.keys(reviewsByMonth).forEach(function(ym) {
        dualSave('checklist_review_' + ym, reviewsByMonth[ym] || '');
      });
      Object.keys(reflectionsByMonth).forEach(function(ym) {
        dualSave('checklist_reflections_' + ym, JSON.stringify(reflectionsByMonth[ym] || {}));
      });

      // Reload current month data
      loadData().then(function() {
        renderAll();
      });
      markBackupDone();

      alert('全データを復元しました。\n' + monthSheets.length + 'ヶ月分のデータを読み込みました。');

    } catch (err) {
      console.error('Full import error:', err);
      alert('Excelファイルの読み込みに失敗しました。\nバックアップファイルを使用してください。\n\nエラー: ' + err.message);
    }
  };

  reader.readAsArrayBuffer(file);
}

// ===== Excel Import =====
function importExcel(file) {
  if (typeof XLSX === 'undefined') {
    alert('Excelライブラリの読み込みに失敗しました。インターネット接続を確認してください。');
    return;
  }

  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var wb = XLSX.read(e.target.result, { type: 'array' });

      // --- Detect month from filename (e.g. "実践チェックリスト_2026年04月.xlsx") ---
      var fileYear = state.year;
      var fileMonth = state.month;
      var nameMatch = file.name.match(/(\d{4})\D+(\d{1,2})\D*月/);
      if (nameMatch) {
        fileYear = parseInt(nameMatch[1]);
        fileMonth = parseInt(nameMatch[2]) - 1; // 0-indexed
      }

      // --- Sheet 1: チェックリスト ---
      var ws1 = wb.Sheets[wb.SheetNames[0]];
      if (!ws1) { alert('チェックリストシートが見つかりません。'); return; }
      var data1 = XLSX.utils.sheet_to_json(ws1, { header: 1 });

      if (data1.length < 2) { alert('チェックリストのデータが空です。'); return; }

      var headerRow = data1[0];
      // Find day columns: parse day numbers from header (e.g. "1(水)", "2(木)")
      var dayColumns = {};
      for (var c = 1; c < headerRow.length; c++) {
        var hdr = String(headerRow[c] || '');
        var dayMatch = hdr.match(/^(\d{1,2})\(/);
        if (dayMatch) {
          dayColumns[parseInt(dayMatch[1])] = c;
        }
      }

      // Extract items and checks
      var newItems = [];
      var newChecks = {};
      for (var r = 1; r < data1.length; r++) {
        var row = data1[r];
        var itemName = String(row[0] || '').trim();
        // Skip rate row and empty rows
        if (!itemName || itemName === '日別実施率') continue;
        var itemIdx = newItems.length;
        newItems.push(itemName);

        for (var day in dayColumns) {
          var colIdx = dayColumns[day];
          var cellVal = String(row[colIdx] || '').trim();
          var checkVal = '';
          if (cellVal === '\u25CE' || cellVal === '◎' || cellVal === '○') checkVal = 'ok';
          else if (cellVal === '\u00D7' || cellVal === '×' || cellVal === 'x' || cellVal === 'X') checkVal = 'ng';
          else if (cellVal === '予') checkVal = 'planned';

          if (checkVal) {
            var ck = String(day).padStart(2, '0') + '-' + itemIdx;
            newChecks[ck] = checkVal;
          }
        }
      }

      if (newItems.length === 0) { alert('項目データが見つかりません。'); return; }

      // --- Sheet 2: 目標・反省 ---
      var newGoal = '';
      var newReview = '';
      if (wb.SheetNames.length >= 2) {
        var ws2 = wb.Sheets[wb.SheetNames[1]];
        var data2 = XLSX.utils.sheet_to_json(ws2, { header: 1, defval: '' });
        // Export format is fixed:
        //   Row 0: "今月の目標"
        //   Row 1: goal text
        //   Row 2: (empty)
        //   Row 3: "今月の反省・メモ"
        //   Row 4: review text
        if (data2.length >= 2) {
          newGoal = String(data2[1][0] || '');
        }
        if (data2.length >= 5) {
          newReview = String(data2[4][0] || '');
        }
        // Fallback: if positional read got empty, search by label
        if (!newGoal && !newReview) {
          var foundGoalLabel = false;
          var foundReviewLabel = false;
          for (var r = 0; r < data2.length; r++) {
            var label = String(data2[r][0] || '').trim();
            if (!foundGoalLabel && label.indexOf('目標') >= 0) {
              foundGoalLabel = true;
              if (r + 1 < data2.length) newGoal = String(data2[r + 1][0] || '');
              continue;
            }
            if (!foundReviewLabel && (label.indexOf('反省') >= 0 || label.indexOf('メモ') >= 0)) {
              foundReviewLabel = true;
              if (r + 1 < data2.length) newReview = String(data2[r + 1][0] || '');
              continue;
            }
          }
        }
      }

      // --- Sheet 3: 振り返り ---
      var newReflections = {};
      if (wb.SheetNames.length >= 3) {
        var ws3 = wb.Sheets[wb.SheetNames[2]];
        var data3 = XLSX.utils.sheet_to_json(ws3, { header: 1 });
        for (var r = 1; r < data3.length; r++) {
          var dateStr = String(data3[r][0] || '');
          var refText = String(data3[r][1] || '').trim();
          // Parse day from "4/1(月)" format
          var dMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})/);
          if (dMatch && refText) {
            var dd = String(parseInt(dMatch[2])).padStart(2, '0');
            newReflections[dd] = refText;
          }
        }
      }

      // --- Confirm and apply ---
      var msg = '以下のデータを読み込みます：\n\n'
        + '■ 対象月: ' + fileYear + '年' + (fileMonth + 1) + '月\n'
        + '■ 項目数: ' + newItems.length + '件\n'
        + '■ チェックデータ: ' + Object.keys(newChecks).length + '件\n'
        + '■ 振り返り: ' + Object.keys(newReflections).length + '日分\n'
        + '■ 目標: ' + (newGoal ? 'あり' : 'なし') + '\n'
        + '■ メモ・反省: ' + (newReview ? 'あり' : 'なし') + '\n\n'
        + '現在のデータは上書きされます。よろしいですか？';

      if (!confirm(msg)) return;

      // Switch to the imported month
      state.year = fileYear;
      state.month = fileMonth;
      state.mobileDay = 1;

      // Save items
      state.items = newItems;
      saveItems();

      // Save checks
      var mk = monthKey();
      state.checks[mk] = newChecks;
      saveChecks();

      // Save reflections
      state.reflections[mk] = newReflections;
      saveReflections();

      // Save goal
      state.monthGoals[mk] = newGoal;
      saveGoal();

      // Save review
      state.monthReviews[mk] = newReview;
      saveReview();

      // Refresh UI
      updateMonthDisplay();
      renderAll();

      alert('データを復元しました。\n' + fileYear + '年' + (fileMonth + 1) + '月のデータを読み込みました。');

    } catch (err) {
      console.error('Import error:', err);
      alert('Excelファイルの読み込みに失敗しました。\nエクスポートしたファイルを使用してください。\n\nエラー: ' + err.message);
    }
  };

  reader.readAsArrayBuffer(file);
}

// ===== Utilities =====
function escHtml(s) {
  var div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

// ===== Touch Swipe for Mobile =====
var touchStartX = 0;
function initSwipe() {
  var mv = document.getElementById('mobileView');
  mv.addEventListener('touchstart', function(e) { touchStartX = e.touches[0].clientX; }, { passive: true });
  mv.addEventListener('touchend', function(e) {
    var dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 60) {
      if (dx > 0) changeDay(-1);
      else changeDay(1);
    }
  }, { passive: true });
}

// ===== Init =====
function init() {
  // Request persistent storage (prevents Safari/iOS from auto-deleting data)
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().then(function(granted) {
      console.log('Persistent storage:', granted ? 'granted' : 'denied');
    });
  }

  updateMonthDisplay();
  loadData().then(function() {
    renderAll();
  });

  // Grid click delegation
  document.getElementById('gridBody').addEventListener('click', function(e) {
    // Row action button
    var btn = e.target.closest('.row-action-btn');
    if (btn) {
      e.stopPropagation();
      var rect = btn.getBoundingClientRect();
      showRowMenu(parseInt(btn.dataset.idx), rect.left, rect.bottom + 4);
      return;
    }
    // Item name editing
    var span = e.target.closest('.item-name');
    if (span) {
      var idx = parseInt(span.dataset.idx);
      var td = span.parentElement;
      td.innerHTML = '';
      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'item-edit';
      input.value = state.items[idx];
      input.maxLength = 30;
      td.appendChild(input);
      input.focus();
      input.select();
      function commit() {
        var val = input.value.trim();
        if (val) state.items[idx] = val;
        saveItems();
        renderPC();
      }
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', function(ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
        if (ev.key === 'Escape') { renderPC(); }
      });
      return;
    }
    // Check toggle
    var td = e.target.closest('td[data-day]');
    if (!td) return;
    var day = parseInt(td.dataset.day);
    var item = parseInt(td.dataset.item);
    var newVal = toggleCheck(day, item);
    setCheck(day, item, newVal);
    renderPC();
    updateMonthlyRate();
  });

  // Row menu actions
  document.getElementById('rowMenu').addEventListener('click', function(e) {
    var action = e.target.dataset.action;
    if (!action || activeMenuIdx < 0) return;
    var idx = activeMenuIdx;
    hideRowMenu();
    switch (action) {
      case 'edit':
        var name = prompt('項目名を入力:', state.items[idx]);
        if (name && name.trim()) { state.items[idx] = name.trim(); saveItems(); renderAll(); }
        break;
      case 'copy': copyItem(idx); break;
      case 'moveup': moveItem(idx, -1); break;
      case 'movedown': moveItem(idx, 1); break;
      case 'delete': deleteItem(idx); break;
    }
  });

  // Close menu on outside click
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.row-menu') && !e.target.closest('.row-action-btn')) {
      hideRowMenu();
    }
  });

  // Add item button
  document.getElementById('addItemBtn').addEventListener('click', function() {
    var name = prompt('新しい項目名を入力:');
    if (name && name.trim()) addItem(name.trim());
  });

  // Goal bar
  document.getElementById('goalDisplay').addEventListener('click', openGoalModal);
  document.getElementById('goalSave').addEventListener('click', saveGoalFromModal);
  document.getElementById('goalCancel').addEventListener('click', closeGoalModal);
  document.getElementById('goalModal').addEventListener('click', function(e) {
    if (e.target === this) closeGoalModal();
  });
  document.getElementById('goalInput').addEventListener('input', function() {
    document.getElementById('goalCharCount').textContent = this.value.length;
  });

  // Month review (PC)
  document.getElementById('monthReview').addEventListener('input', function() {
    state.monthReviews[monthKey()] = this.value;
    saveReview();
    document.getElementById('reviewCharCount').textContent = this.value.length;
    // Sync to mobile
    var m = document.getElementById('mobileMonthReview');
    if (m) { m.value = this.value; document.getElementById('mobileReviewCharCount').textContent = this.value.length; }
  });

  // Month review (Mobile)
  document.getElementById('mobileMonthReview').addEventListener('input', function() {
    state.monthReviews[monthKey()] = this.value;
    saveReview();
    document.getElementById('mobileReviewCharCount').textContent = this.value.length;
    // Sync to PC
    var p = document.getElementById('monthReview');
    if (p) { p.value = this.value; document.getElementById('reviewCharCount').textContent = this.value.length; }
  });

  // Today's TODO (PC)
  document.getElementById('todayTodo').addEventListener('input', function() {
    setTodayTodo(this.value);
    document.getElementById('todoCharCount').textContent = this.value.length;
    var m = document.getElementById('mobileTodayTodo');
    if (m) { m.value = this.value; document.getElementById('mobileTodoCharCount').textContent = this.value.length; }
  });
  document.getElementById('copyTodoBtn').addEventListener('click', copyTodoToNotes);

  // Today's TODO (Mobile)
  document.getElementById('mobileTodayTodo').addEventListener('input', function() {
    setTodayTodo(this.value);
    document.getElementById('mobileTodoCharCount').textContent = this.value.length;
    var p = document.getElementById('todayTodo');
    if (p) { p.value = this.value; document.getElementById('todoCharCount').textContent = this.value.length; }
  });
  document.getElementById('mobileCopyTodoBtn').addEventListener('click', copyTodoToNotes);

  // Mobile mode toggle
  document.getElementById('mobileCheckMode').addEventListener('click', function() { setMobileMode('check'); });
  document.getElementById('mobileEditMode').addEventListener('click', function() { setMobileMode('edit'); });

  // Mobile edit list actions (event delegation)
  document.getElementById('mobileEditList').addEventListener('click', function(e) {
    var btn = e.target.closest('button[data-act]');
    if (!btn) return;
    var item = btn.closest('.mobile-edit-item');
    var idx = parseInt(item.dataset.idx);
    var act = btn.dataset.act;
    switch (act) {
      case 'edit':
        var name = prompt('項目名を入力:', state.items[idx]);
        if (name && name.trim()) { state.items[idx] = name.trim(); saveItems(); renderAll(); }
        break;
      case 'copy': copyItem(idx); break;
      case 'up': moveItem(idx, -1); break;
      case 'down': moveItem(idx, 1); break;
      case 'delete': deleteItem(idx); break;
    }
  });

  // Mobile add item
  document.getElementById('mobileAddItemBtn').addEventListener('click', function() {
    var name = prompt('新しい項目名を入力:');
    if (name && name.trim()) addItem(name.trim());
  });

  document.getElementById('prevMonth').addEventListener('click', function() { changeMonth(-1); });
  document.getElementById('nextMonth').addEventListener('click', function() { changeMonth(1); });
  document.getElementById('prevDay').addEventListener('click', function() { changeDay(-1); });
  document.getElementById('nextDay').addEventListener('click', function() { changeDay(1); });
  document.getElementById('exportBtn').addEventListener('click', exportExcel);

  // Import from Excel (current month)
  document.getElementById('importFile').addEventListener('change', function() {
    if (this.files && this.files[0]) {
      importExcel(this.files[0]);
      this.value = '';
    }
  });

  // Full backup buttons
  document.getElementById('exportAllBtn').addEventListener('click', function() {
    exportAllExcel().catch(function(e) { console.error(e); });
  });
  document.getElementById('importAllFile').addEventListener('change', function() {
    if (this.files && this.files[0]) {
      importAllExcel(this.files[0]);
      this.value = '';
    }
  });

  // Backup reminder on exit (beforeunload)
  window.addEventListener('beforeunload', function(e) {
    if (hasUnsavedChanges()) {
      // Modern browsers show generic message; setting returnValue triggers prompt
      e.preventDefault();
      e.returnValue = 'バックアップを取らずに閉じようとしています。「全データバックアップ」ボタンでExcelに保存できます。';
      return e.returnValue;
    }
  });

  // Periodic backup reminder (if last backup is too old)
  checkBackupReminder();

  initSwipe();

  // Recalculate sticky on resize
  window.addEventListener('resize', updateStickyTop);
}

// PWA registration with update handling
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js').then(function(reg) {
    // Check for updates periodically
    reg.addEventListener('updatefound', function() {
      var newWorker = reg.installing;
      newWorker.addEventListener('statechange', function() {
        if (newWorker.state === 'activated') {
          // New service worker activated - reload to use fresh code
          // but only if this is an update, not the first install
          if (navigator.serviceWorker.controller) {
            location.reload();
          }
        }
      });
    });
  }).catch(function() {});

  // Detect when a new SW takes control and reload
  navigator.serviceWorker.addEventListener('controllerchange', function() {
    // Avoid infinite reload loops
    if (!window._swReloaded) {
      window._swReloaded = true;
      location.reload();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
