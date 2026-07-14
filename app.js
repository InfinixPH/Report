// ---------- State ----------
let state = { categories: [], links: [] };
let editingLinkId = null;
let editingCategoryId = null;
let pendingDeleteAction = null;

// ---------- DOM ----------
const categoriesContainer = document.getElementById('categoriesContainer');
const loadingState = document.getElementById('loadingState');
const errorState = document.getElementById('errorState');
const lastUpdatedEl = document.getElementById('lastUpdated');

const linkModal = document.getElementById('linkModal');
const linkForm = document.getElementById('linkForm');
const linkModalTitle = document.getElementById('linkModalTitle');
const linkTitleInput = document.getElementById('linkTitleInput');
const linkUrlInput = document.getElementById('linkUrlInput');
const linkCategorySelect = document.getElementById('linkCategorySelect');
const linkStatusInput = document.getElementById('linkStatusInput');

const categoryModal = document.getElementById('categoryModal');
const categoryForm = document.getElementById('categoryForm');
const categoryModalTitle = document.getElementById('categoryModalTitle');
const categoryNameInput = document.getElementById('categoryNameInput');

const confirmModal = document.getElementById('confirmModal');
const confirmMessage = document.getElementById('confirmMessage');

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

loadData();

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
  categoriesContainer.innerHTML = '';
  try {
    state = await apiGet();
    render();
    lastUpdatedEl.textContent = 'Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (err) {
    errorState.textContent = 'Could not load data. Check that API_URL in config.js is set correctly. (' + err.message + ')';
    errorState.classList.remove('hidden');
  } finally {
    loadingState.classList.add('hidden');
  }
}

// ---------- Render ----------
function render() {
  categoriesContainer.innerHTML = '';

  if (state.categories.length === 0) {
    categoriesContainer.innerHTML = '<div class="state-msg">No categories yet. Click "+ Add Category" to get started.</div>';
    return;
  }

  state.categories.forEach(cat => {
    const links = state.links.filter(l => l.categoryId === cat.id);

    const section = document.createElement('section');
    section.className = 'category-section';

    section.innerHTML = `
      <div class="category-header">
        <div class="category-title">${escapeHtml(cat.name)} <span class="count">${links.length}</span></div>
        <div class="category-header-actions">
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
      grid.innerHTML = '<div class="empty-category">No links yet in this category.</div>';
    } else {
      links.forEach(link => grid.appendChild(renderLinkCard(link)));
    }
  });

  // wire up category action buttons
  document.querySelectorAll('.add-link-btn').forEach(btn =>
    btn.addEventListener('click', () => openLinkModal(null, btn.dataset.cat)));
  document.querySelectorAll('.rename-cat-btn').forEach(btn =>
    btn.addEventListener('click', () => openCategoryModal(btn.dataset.cat)));
  document.querySelectorAll('.delete-cat-btn').forEach(btn =>
    btn.addEventListener('click', () => confirmDeleteCategory(btn.dataset.cat)));
}

function renderLinkCard(link) {
  const card = document.createElement('div');
  card.className = 'link-card';

  const statusClass = statusClassFor(link.status);
  const statusHtml = link.status
    ? `<span class="link-status ${statusClass}">${escapeHtml(link.status)}</span>`
    : '';

  card.innerHTML = `
    <div class="link-title">${escapeHtml(link.title)}</div>
    ${statusHtml}
    <div class="link-card-footer">
      <a class="btn btn-primary btn-small btn-open" href="${escapeAttr(link.url)}" target="_blank" rel="noopener noreferrer">Open ↗</a>
      <div>
        <button class="icon-btn edit-link-btn" data-id="${link.id}">Edit</button>
        <button class="icon-btn danger delete-link-btn" data-id="${link.id}">Delete</button>
      </div>
    </div>
  `;

  card.querySelector('.edit-link-btn').addEventListener('click', () => openLinkModal(link.id));
  card.querySelector('.delete-link-btn').addEventListener('click', () => confirmDeleteLink(link.id, link.title));

  return card;
}

function statusClassFor(status) {
  if (!status) return 'neutral';
  const s = status.toLowerCase();
  if (s.includes('pending')) return 'pending';
  if (s.includes('update')) return 'update';
  return 'neutral';
}

// ---------- Link Modal ----------
function openLinkModal(linkId, defaultCategoryId) {
  editingLinkId = linkId;
  linkForm.reset();

  linkCategorySelect.innerHTML = state.categories
    .map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
    .join('');

  if (linkId) {
    const link = state.links.find(l => l.id === linkId);
    linkModalTitle.textContent = 'Edit Link';
    linkTitleInput.value = link.title;
    linkUrlInput.value = link.url;
    linkStatusInput.value = link.status || '';
    linkCategorySelect.value = link.categoryId;
  } else {
    linkModalTitle.textContent = 'Add Link';
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
  const payload = {
    title: linkTitleInput.value.trim(),
    url: linkUrlInput.value.trim(),
    categoryId: linkCategorySelect.value,
    status: linkStatusInput.value.trim()
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
