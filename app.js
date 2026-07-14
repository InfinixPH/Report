// ---------- State ----------
let state = { categories: [], links: [] };
let editingLinkId = null;
let editingCategoryId = null;
let pendingDeleteAction = null;
let role = sessionStorage.getItem('reportLinksRole') === 'admin' ? 'admin' : 'view';

const CATEGORY_COLORS = ['#0F9E97', '#E8A23D', '#4C5FD5', '#D2577A', '#3F9142', '#6B7385'];

// ---------- DOM ----------
const categoriesContainer = document.getElementById('categoriesContainer');
const loadingState = document.getElementById('loadingState');
const errorState = document.getElementById('errorState');
const emptyState = document.getElementById('emptyState');
const lastUpdatedEl = document.getElementById('lastUpdated');

const roleToggleBtn = document.getElementById('roleToggleBtn');
const roleLabel = document.getElementById('roleLabel');

const linkModal = document.getElementById('linkModal');
const linkForm = document.getElementById('linkForm');
const linkModalTitle = document.getElementById('linkModalTitle');
const linkTitleInput = document.getElementById('linkTitleInput');
const linkUrlInput = document.getElementById('linkUrlInput');
const linkCategorySelect = document.getElementById('linkCategorySelect');
const linkStatusSelect = document.getElementById('linkStatusSelect');
const linkStatusOtherInput = document.getElementById('linkStatusOtherInput');

const PRESET_STATUSES = ['Active', 'Upcoming', 'Complete', 'Pending'];

linkStatusSelect.addEventListener('change', () => {
  linkStatusOtherInput.classList.toggle('hidden', linkStatusSelect.value !== 'Other');
  if (linkStatusSelect.value === 'Other') linkStatusOtherInput.focus();
});

const categoryModal = document.getElementById('categoryModal');
const categoryForm = document.getElementById('categoryForm');
const categoryModalTitle = document.getElementById('categoryModalTitle');
const categoryNameInput = document.getElementById('categoryNameInput');

const confirmModal = document.getElementById('confirmModal');
const confirmMessage = document.getElementById('confirmMessage');

const pinModal = document.getElementById('pinModal');
const pinForm = document.getElementById('pinForm');
const pinInput = document.getElementById('pinInput');
const pinError = document.getElementById('pinError');
const pinCancelBtn = document.getElementById('pinCancelBtn');

// ---------- Init ----------
document.getElementById('addCategoryBtn').addEventListener('click', () => openCategoryModal());
document.getElementById('linkCancelBtn').addEventListener('click', closeLinkModal);
document.getElementById('categoryCancelBtn').addEventListener('click', closeCategoryModal);
document.getElementById('confirmCancelBtn').addEventListener('click', closeConfirmModal);
document.getElementById('confirmOkBtn').addEventListener('click', () => {
  if (pendingDeleteAction) pendingDeleteAction();
  closeConfirmModal();
});
linkForm.addEventListener('submit', handleLinkFormSubmit);
categoryForm.addEventListener('submit', handleCategoryFormSubmit);

roleToggleBtn.addEventListener('click', handleRoleToggleClick);
pinForm.addEventListener('submit', handlePinSubmit);
pinCancelBtn.addEventListener('click', closePinModal);

applyRoleUI();
loadData();

// ---------- Role handling ----------
function applyRoleUI() {
  const isAdmin = role === 'admin';
  roleLabel.textContent = isAdmin ? 'Admin' : 'Viewer';
  roleToggleBtn.classList.toggle('role-admin', isAdmin);
  roleToggleBtn.classList.toggle('role-view', !isAdmin);
  document.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('hidden', !isAdmin));
}

function handleRoleToggleClick() {
  if (role === 'admin') {
    role = 'view';
    sessionStorage.setItem('reportLinksRole', 'view');
    applyRoleUI();
    render();
  } else {
    pinInput.value = '';
    pinError.classList.add('hidden');
    pinModal.classList.remove('hidden');
    pinInput.focus();
  }
}

function handlePinSubmit(e) {
  e.preventDefault();
  if (pinInput.value === ADMIN_PIN) {
    role = 'admin';
    sessionStorage.setItem('reportLinksRole', 'admin');
    closePinModal();
    applyRoleUI();
    render();
  } else {
    pinError.classList.remove('hidden');
    pinInput.value = '';
    pinInput.focus();
  }
}

function closePinModal() {
  pinModal.classList.add('hidden');
}

// ---------- API ----------
async function apiGet() {
  const res = await fetch(API_URL);
  if (!res.ok) throw new Error('Failed to load data');
  return res.json();
}

async function apiPost(action, payload) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, payload })
  });
  if (!res.ok) throw new Error('Request failed');
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Request failed');
  return data;
}

async function loadData() {
  loadingState.classList.remove('hidden');
  errorState.classList.add('hidden');
  emptyState.classList.add('hidden');
  categoriesContainer.innerHTML = '';
  try {
    state = await apiGet();
    render();
    lastUpdatedEl.textContent = 'Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (err) {
    errorState.textContent = 'Sync failed — check that API_URL in config.js is set correctly. (' + err.message + ')';
    errorState.classList.remove('hidden');
  } finally {
    loadingState.classList.add('hidden');
  }
}

// ---------- Render ----------
function render() {
  categoriesContainer.innerHTML = '';

  if (state.categories.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  state.categories.forEach((cat, index) => {
    const color = CATEGORY_COLORS[index % CATEGORY_COLORS.length];
    const links = state.links.filter(l => l.categoryId === cat.id);

    const section = document.createElement('section');
    section.className = 'category-section';

    section.innerHTML = `
      <div class="category-header">
        <div class="category-title-wrap">
          <div class="category-swatch" style="background:${color}"></div>
          <div class="category-title">${escapeHtml(cat.name)}</div>
          <div class="category-count">${links.length}</div>
        </div>
        <div class="category-header-actions admin-only ${role === 'admin' ? '' : 'hidden'}">
          <button class="icon-btn add-link-btn" data-cat="${cat.id}">+ Add Link</button>
          <button class="icon-btn rename-cat-btn" data-cat="${cat.id}">Rename</button>
          <button class="icon-btn danger delete-cat-btn" data-cat="${cat.id}">Delete</button>
        </div>
      </div>
      <div class="links-grid" id="grid-${cat.id}"></div>
    `;

    categoriesContainer.appendChild(section);

    const grid = section.querySelector(`#grid-${CSS.escape(cat.id)}`);
    if (links.length === 0) {
      grid.innerHTML = '<div class="empty-category">No links logged in this category.</div>';
    } else {
      links.forEach(link => grid.appendChild(renderLinkCard(link, color)));
    }
  });

  document.querySelectorAll('.add-link-btn').forEach(btn =>
    btn.addEventListener('click', () => openLinkModal(null, btn.dataset.cat)));
  document.querySelectorAll('.rename-cat-btn').forEach(btn =>
    btn.addEventListener('click', () => openCategoryModal(btn.dataset.cat)));
  document.querySelectorAll('.delete-cat-btn').forEach(btn =>
    btn.addEventListener('click', () => confirmDeleteCategory(btn.dataset.cat)));
}

function renderLinkCard(link, color) {
  const card = document.createElement('div');
  card.className = 'link-card';
  if (color) card.style.setProperty('--card-accent', color);

  const statusClass = statusClassFor(link.status);
  const statusHtml = link.status
    ? `<span class="link-status ${statusClass}"><span class="dot"></span>${escapeHtml(link.status)}</span>`
    : '';

  const dateHtml = link.dateAdded
    ? `<div class="link-meta">Added ${formatDate(link.dateAdded)}</div>`
    : '';

  const adminActions = role === 'admin'
    ? `<div class="link-card-admin-actions">
         <button class="icon-btn edit-link-btn" data-id="${link.id}">Edit</button>
         <button class="icon-btn danger delete-link-btn" data-id="${link.id}">Delete</button>
       </div>`
    : '';

  card.innerHTML = `
    <div class="link-title">${escapeHtml(link.title)}</div>
    ${statusHtml}
    ${dateHtml}
    <div class="link-card-footer">
      <a class="btn btn-small btn-open" href="${escapeAttr(link.url)}" target="_blank" rel="noopener noreferrer">Open ↗</a>
      ${adminActions}
    </div>
  `;

  if (role === 'admin') {
    card.querySelector('.edit-link-btn').addEventListener('click', () => openLinkModal(link.id));
    card.querySelector('.delete-link-btn').addEventListener('click', () => confirmDeleteLink(link.id, link.title));
  }

  return card;
}

function statusClassFor(status) {
  if (!status) return 'neutral';
  const s = status.toLowerCase();
  if (s.includes('pending')) return 'pending';
  if (s.includes('active')) return 'active';
  if (s.includes('upcoming')) return 'upcoming';
  if (s.includes('complete')) return 'complete';
  if (s.includes('update')) return 'update';
  return 'neutral';
}

// ---------- Link Modal ----------
function openLinkModal(linkId, defaultCategoryId) {
  if (role !== 'admin') return;
  editingLinkId = linkId;
  linkForm.reset();

  linkCategorySelect.innerHTML = state.categories
    .map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
    .join('');

  linkStatusOtherInput.classList.add('hidden');
  linkStatusOtherInput.value = '';

  if (linkId) {
    const link = state.links.find(l => l.id === linkId);
    linkModalTitle.textContent = 'Edit Link';
    linkTitleInput.value = link.title;
    linkUrlInput.value = link.url;
    linkCategorySelect.value = link.categoryId;

    const status = link.status || '';
    if (!status) {
      linkStatusSelect.value = '';
    } else if (PRESET_STATUSES.includes(status)) {
      linkStatusSelect.value = status;
    } else {
      linkStatusSelect.value = 'Other';
      linkStatusOtherInput.value = status;
      linkStatusOtherInput.classList.remove('hidden');
    }
  } else {
    linkModalTitle.textContent = 'Add Link';
    linkStatusSelect.value = '';
    if (defaultCategoryId) linkCategorySelect.value = defaultCategoryId;
  }

  linkModal.classList.remove('hidden');
}

function closeLinkModal() {
  linkModal.classList.add('hidden');
  editingLinkId = null;
}

async function handleLinkFormSubmit(e) {
  e.preventDefault();
  if (role !== 'admin') return;
  const finalStatus = linkStatusSelect.value === 'Other'
    ? linkStatusOtherInput.value.trim()
    : linkStatusSelect.value;

  const payload = {
    title: linkTitleInput.value.trim(),
    url: linkUrlInput.value.trim(),
    categoryId: linkCategorySelect.value,
    status: finalStatus
  };

  try {
    if (editingLinkId) {
      await apiPost('updateLink', { id: editingLinkId, ...payload });
    } else {
      await apiPost('addLink', payload);
    }
    closeLinkModal();
    await loadData();
  } catch (err) {
    alert('Error saving link: ' + err.message);
  }
}

function confirmDeleteLink(id, title) {
  if (role !== 'admin') return;
  confirmMessage.textContent = `Delete the link "${title}"? This cannot be undone.`;
  pendingDeleteAction = async () => {
    try {
      await apiPost('deleteLink', { id });
      await loadData();
    } catch (err) {
      alert('Error deleting link: ' + err.message);
    }
  };
  confirmModal.classList.remove('hidden');
}

// ---------- Category Modal ----------
function openCategoryModal(categoryId) {
  if (role !== 'admin') return;
  editingCategoryId = categoryId || null;
  categoryForm.reset();

  if (categoryId) {
    const cat = state.categories.find(c => c.id === categoryId);
    categoryModalTitle.textContent = 'Rename Category';
    categoryNameInput.value = cat.name;
  } else {
    categoryModalTitle.textContent = 'Add Category';
  }

  categoryModal.classList.remove('hidden');
}

function closeCategoryModal() {
  categoryModal.classList.add('hidden');
  editingCategoryId = null;
}

async function handleCategoryFormSubmit(e) {
  e.preventDefault();
  if (role !== 'admin') return;
  const name = categoryNameInput.value.trim();

  try {
    if (editingCategoryId) {
      await apiPost('renameCategory', { id: editingCategoryId, name });
    } else {
      await apiPost('addCategory', { name });
    }
    closeCategoryModal();
    await loadData();
  } catch (err) {
    alert('Error saving category: ' + err.message);
  }
}

function confirmDeleteCategory(id) {
  if (role !== 'admin') return;
  const cat = state.categories.find(c => c.id === id);
  const linkCount = state.links.filter(l => l.categoryId === id).length;
  confirmMessage.textContent = linkCount > 0
    ? `Delete "${cat.name}" and its ${linkCount} link(s)? This cannot be undone.`
    : `Delete category "${cat.name}"?`;
  pendingDeleteAction = async () => {
    try {
      await apiPost('deleteCategory', { id });
      await loadData();
    } catch (err) {
      alert('Error deleting category: ' + err.message);
    }
  };
  confirmModal.classList.remove('hidden');
}

function closeConfirmModal() {
  confirmModal.classList.add('hidden');
  pendingDeleteAction = null;
}

// ---------- Helpers ----------
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function escapeAttr(str) {
  return escapeHtml(str);
}

function formatDate(value) {
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}
