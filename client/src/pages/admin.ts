import { setState } from '../state';

const TOKEN_KEY = 'dag_admin_token';

const app = document.getElementById('app')!;
app.insertAdjacentHTML('beforeend', `
<div id="page-admin" class="admin-page" style="display:none;">

  <!-- ====== Login ====== -->
  <div id="admin-login" class="admin-login-wrapper">
    <div class="admin-login-bg"></div>
    <div class="admin-login-card">
      <div class="admin-login-icon">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1"/></svg>
      </div>
      <h2 class="admin-login-title">词库管理</h2>
      <p class="admin-login-sub">输入密码以继续</p>
      <div class="admin-login-field">
        <input id="admin-password" type="password" placeholder="管理员密码" autocomplete="off" />
      </div>
      <p id="admin-login-error" class="admin-login-error"></p>
      <button id="admin-login-btn" class="admin-btn-primary admin-btn-full">登 录</button>
      <button id="admin-back-home" class="admin-btn-ghost admin-btn-full" style="margin-top:8px;">返回首页</button>
    </div>
  </div>

  <!-- ====== Dashboard ====== -->
  <div id="admin-dashboard" class="admin-dash" style="display:none;">
    <!-- Sidebar -->
    <aside class="admin-sidebar">
      <div class="admin-sidebar-brand">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        <span>词库管理</span>
      </div>
      <nav class="admin-sidebar-nav">
        <a class="active">全部词条</a>
      </nav>
      <div class="admin-sidebar-footer">
        <button id="admin-home-btn" class="admin-btn-ghost" style="width:100%;justify-content:flex-start;padding:8px 12px;">← 返回游戏</button>
      </div>
    </aside>

    <!-- Main -->
    <main class="admin-main">
      <!-- Top bar -->
      <header class="admin-topbar">
        <div class="admin-topbar-left">
          <h1>词条管理</h1>
          <span class="admin-badge" id="admin-stats">170 词条 / 10 分类</span>
        </div>
        <div class="admin-topbar-right">
          <button id="admin-seed-btn" class="admin-btn-outline">重置默认词库</button>
          <button id="admin-add-btn" class="admin-btn-primary">+ 添加词条</button>
          <button id="admin-logout-btn" class="admin-btn-ghost">退出登录</button>
        </div>
      </header>

      <!-- Toolbar -->
      <div class="admin-toolbar">
        <div class="admin-toolbar-filter">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
          <select id="admin-category-filter">
            <option value="">全部分类</option>
          </select>
        </div>
      </div>

      <!-- Table -->
      <div class="admin-table-wrap" id="admin-words-table">
        <p class="admin-loading">加载中...</p>
      </div>
    </main>
  </div>

  <!-- ====== Add/Edit Modal ====== -->
  <div id="admin-modal" class="admin-overlay" style="display:none;">
    <div class="admin-modal">
      <div class="admin-modal-header">
        <h3 id="admin-modal-title">添加词条</h3>
        <button id="admin-modal-close" class="admin-modal-close">&times;</button>
      </div>
      <div class="admin-modal-body">
        <div class="admin-field">
          <label>词条内容</label>
          <input id="admin-modal-word" type="text" placeholder="例如：无名剑法" maxlength="50" />
        </div>
        <div class="admin-field">
          <label>所属分类</label>
          <input id="admin-modal-category" type="text" placeholder="例如：燕云十六声武学" maxlength="30" list="admin-category-datalist" />
          <datalist id="admin-category-datalist"></datalist>
        </div>
        <p id="admin-modal-error" class="admin-field-error"></p>
      </div>
      <div class="admin-modal-footer">
        <button id="admin-modal-cancel" class="admin-btn-outline">取消</button>
        <button id="admin-modal-save" class="admin-btn-primary">保存</button>
      </div>
    </div>
  </div>

  <!-- ====== Delete Modal ====== -->
  <div id="admin-delete-modal" class="admin-overlay" style="display:none;">
    <div class="admin-modal" style="max-width:400px;">
      <div class="admin-modal-header">
        <h3>确认删除</h3>
      </div>
      <div class="admin-modal-body" style="text-align:center;">
        <div class="admin-delete-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <p id="admin-delete-msg" class="admin-delete-msg"></p>
        <p id="admin-delete-error" class="admin-field-error"></p>
      </div>
      <div class="admin-modal-footer">
        <button id="admin-delete-cancel" class="admin-btn-outline">取消</button>
        <button id="admin-delete-confirm" class="admin-btn-danger">确认删除</button>
      </div>
    </div>
  </div>
</div>
`);

// ---- Elements ----
const loginSection = document.getElementById('admin-login')!;
const dashboard = document.getElementById('admin-dashboard')!;
const passwordInput = document.getElementById('admin-password') as HTMLInputElement;
const loginBtn = document.getElementById('admin-login-btn')!;
const loginError = document.getElementById('admin-login-error')!;
const logoutBtn = document.getElementById('admin-logout-btn')!;
const homeBtn = document.getElementById('admin-home-btn')!;
const backHomeBtn = document.getElementById('admin-back-home')!;
const addBtn = document.getElementById('admin-add-btn')!;
const seedBtn = document.getElementById('admin-seed-btn')!;
const categoryFilter = document.getElementById('admin-category-filter') as HTMLSelectElement;
const wordsTable = document.getElementById('admin-words-table')!;
const statsEl = document.getElementById('admin-stats')!;

const modal = document.getElementById('admin-modal')!;
const modalTitle = document.getElementById('admin-modal-title')!;
const modalWord = document.getElementById('admin-modal-word') as HTMLInputElement;
const modalCategory = document.getElementById('admin-modal-category') as HTMLInputElement;
const modalError = document.getElementById('admin-modal-error')!;
const modalSave = document.getElementById('admin-modal-save')!;
const modalCancel = document.getElementById('admin-modal-cancel')!;
const modalClose = document.getElementById('admin-modal-close')!;
const categoryDatalist = document.getElementById('admin-category-datalist') as HTMLDataListElement;

const deleteModal = document.getElementById('admin-delete-modal')!;
const deleteMsg = document.getElementById('admin-delete-msg')!;
const deleteConfirm = document.getElementById('admin-delete-confirm')!;
const deleteCancel = document.getElementById('admin-delete-cancel')!;
const deleteError = document.getElementById('admin-delete-error')!;

let editingWordId: number | null = null;
let deletingWordId: number | null = null;

// ---- Helpers ----

function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || '';
}

function setToken(t: string) {
  localStorage.setItem(TOKEN_KEY, t);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function api(path: string, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return fetch(`/api/admin${path}`, { ...options, headers });
}

function goHome() {
  clearToken();
  setState({ page: 'home' });
}

// ---- Login ----

loginBtn.addEventListener('click', async () => {
  const password = passwordInput.value;
  if (!password) {
    loginError.textContent = '请输入密码';
    loginError.classList.add('show');
    return;
  }
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ detail: '密码错误' }));
      loginError.textContent = data.detail || '密码错误';
      loginError.classList.add('show');
      return;
    }
    const data = await res.json();
    setToken(data.token);
    loginError.classList.remove('show');
    passwordInput.value = '';
    showDashboard();
  } catch {
    loginError.textContent = '连接失败，请检查服务器';
    loginError.classList.add('show');
  }
});

passwordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loginBtn.click();
});

// ---- Dashboard ----

async function showDashboard() {
  loginSection.style.display = 'none';
  dashboard.style.display = '';
  await loadCategories();
  await loadWords();
}

async function loadCategories() {
  try {
    const res = await api('/categories');
    if (res.status === 401) { clearToken(); showLogin(); return; }
    const cats: string[] = await res.json();
    categoryFilter.innerHTML = '<option value="">全部分类</option>';
    cats.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      categoryFilter.appendChild(opt);
    });
    categoryDatalist.innerHTML = cats.map(c => `<option value="${c}">`).join('');
  } catch { /* ignore */ }
}

async function loadWords() {
  try {
    const cat = categoryFilter.value;
    const query = cat ? `?category=${encodeURIComponent(cat)}` : '';
    const res = await api(`/words${query}`);
    if (res.status === 401) { clearToken(); showLogin(); return; }
    const words: Array<{id: number; word: string; category: string; created_at: string}> = await res.json();

    // Update stats
    const cats = new Set(words.map(w => w.category));
    statsEl.textContent = `${words.length} 词条 / ${cats.size} 分类`;

    if (words.length === 0) {
      wordsTable.innerHTML = `
        <div class="admin-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          <p>暂无词条</p>
          <span>点击「添加词条」或「重置默认词库」来添加内容</span>
        </div>`;
      return;
    }

    wordsTable.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr><th class="col-id">#</th><th class="col-word">词条</th><th class="col-cat">分类</th><th class="col-act">操作</th></tr>
        </thead>
        <tbody>
          ${words.map((w, i) => `
            <tr>
              <td class="col-id">${w.id}</td>
              <td class="col-word"><span class="word-tag">${escHtml(w.word)}</span></td>
              <td class="col-cat"><span class="cat-tag">${escHtml(w.category)}</span></td>
              <td class="col-act">
                <button class="admin-btn-sm edit-word" data-id="${w.id}" data-word="${escHtml(w.word)}" data-category="${escHtml(w.category)}">编辑</button>
                <button class="admin-btn-sm admin-btn-sm-del delete-word" data-id="${w.id}" data-word="${escHtml(w.word)}">删除</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    // Attach event listeners
    wordsTable.querySelectorAll('.edit-word').forEach(btn => {
      btn.addEventListener('click', () => {
        const el = btn as HTMLElement;
        openEditModal(parseInt(el.dataset.id!), el.dataset.word!, el.dataset.category!);
      });
    });
    wordsTable.querySelectorAll('.delete-word').forEach(btn => {
      btn.addEventListener('click', () => {
        const el = btn as HTMLElement;
        openDeleteModal(parseInt(el.dataset.id!), el.dataset.word!);
      });
    });
  } catch {
    wordsTable.innerHTML = '<p style="color:var(--danger);text-align:center;padding:40px;">加载失败，请刷新重试</p>';
  }
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

categoryFilter.addEventListener('change', loadWords);

// ---- Modal: Add/Edit ----

addBtn.addEventListener('click', () => openAddModal());

function openAddModal() {
  editingWordId = null;
  modalTitle.textContent = '添加词条';
  modalWord.value = '';
  modalCategory.value = '';
  modalError.classList.remove('show');
  modal.style.display = '';
  setTimeout(() => modalWord.focus(), 100);
}

function openEditModal(id: number, word: string, category: string) {
  editingWordId = id;
  modalTitle.textContent = '编辑词条';
  modalWord.value = word;
  modalCategory.value = category;
  modalError.classList.remove('show');
  modal.style.display = '';
}

function closeModal() {
  modal.style.display = 'none';
}

modalCancel.addEventListener('click', closeModal);
modalClose.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModal();
});

modalSave.addEventListener('click', async () => {
  const word = modalWord.value.trim();
  const category = modalCategory.value.trim();
  if (!word) { modalError.textContent = '词条不能为空'; modalError.classList.add('show'); return; }
  if (!category) { modalError.textContent = '分类不能为空'; modalError.classList.add('show'); return; }

  try {
    let res: Response;
    if (editingWordId) {
      res = await api(`/words/${editingWordId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word, category }),
      });
    } else {
      res = await api('/words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word, category }),
      });
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({ detail: '保存失败' }));
      modalError.textContent = data.detail || '保存失败';
      modalError.classList.add('show');
      return;
    }
    closeModal();
    await loadCategories();
    await loadWords();
  } catch {
    modalError.textContent = '请求失败，请重试';
    modalError.classList.add('show');
  }
});

// ---- Modal: Delete ----

function openDeleteModal(id: number, word: string) {
  deletingWordId = id;
  deleteMsg.textContent = `确定要删除词条「${word}」吗？此操作不可撤销。`;
  deleteError.classList.remove('show');
  deleteModal.style.display = '';
}

deleteCancel.addEventListener('click', () => { deleteModal.style.display = 'none'; });
deleteModal.addEventListener('click', (e) => {
  if (e.target === deleteModal) deleteModal.style.display = 'none';
});

deleteConfirm.addEventListener('click', async () => {
  if (!deletingWordId) return;
  try {
    const res = await api(`/words/${deletingWordId}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ detail: '删除失败' }));
      deleteError.textContent = data.detail || '删除失败';
      deleteError.classList.add('show');
      return;
    }
    deleteModal.style.display = 'none';
    await loadCategories();
    await loadWords();
  } catch {
    deleteError.textContent = '请求失败，请重试';
    deleteError.classList.add('show');
  }
});

// ---- Seed ----

seedBtn.addEventListener('click', async () => {
  if (!confirm('确定要用默认词库重置所有词条吗？这将删除当前所有自定义词条并恢复默认。')) return;
  try {
    const res = await api('/words/seed', { method: 'POST' });
    if (res.status === 401) { clearToken(); showLogin(); return; }
    await loadCategories();
    await loadWords();
  } catch { /* ignore */ }
});

// ---- Logout / Home ----

function showLogin() {
  dashboard.style.display = 'none';
  loginSection.style.display = '';
}

logoutBtn.addEventListener('click', () => {
  clearToken();
  showLogin();
});

homeBtn.addEventListener('click', goHome);
backHomeBtn.addEventListener('click', goHome);

// ---- Init ----

if (getToken()) {
  api('/categories').then(res => {
    if (res.ok) { showDashboard(); }
    else { clearToken(); }
  }).catch(() => {});
}
