/* ==========================================================================
   Admin Management — Complete Logic
   ========================================================================== */

const getApiBase = () => {
    if (window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1') || window.location.protocol === 'file:') {
        return 'http://localhost:5000/api';
    }
    const backend = localStorage.getItem('BACKEND_URL') || 'https://roadside-helper-tc7q.onrender.com';
    return backend + '/api';
};

const API_BASE = getApiBase();
let authToken = localStorage.getItem('adminToken');

// ── State ──────────────────────────────────────────────────────────────────
let allAdmins = [];
let filteredAdmins = [];
let selectedIds = new Set();
let currentPage = 1;
let pageSize = 10;
let currentSort = { field: 'createdAt', dir: 'desc' };
let currentFilters = { role: 'all', status: 'all' };
let searchQuery = '';
let confirmCallback = null;

// ── Auth Guard ───────────────────────────────────────────────────────────────
if (!authToken) {
    window.location.href = 'index.html';
}

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const adminName = localStorage.getItem('adminName') || 'Admin';
    const adminRole = localStorage.getItem('adminRole') || 'Admin';

    // Set names and avatars everywhere
    document.getElementById('admin-name').textContent = adminName;
    document.getElementById('sidebar-name').textContent = adminName;
    document.getElementById('topbar-username') && (document.getElementById('topbar-username').textContent = adminName);

    const roleText = adminRole.replace('_', ' ');
    document.getElementById('admin-role').textContent = roleText;
    document.getElementById('sidebar-role').textContent = roleText;

    const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(adminName)}&background=5D0D18&color=fff&size=64`;
    document.getElementById('header-avatar').src = avatarUrl;
    document.getElementById('sidebar-avatar').src = avatarUrl;

    // Time
    updateTime();
    setInterval(updateTime, 1000);

    // Password strength listener
    document.getElementById('formPassword').addEventListener('input', checkPasswordStrength);

    // Close dropdowns on outside click
    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('filterDropdown');
        const btn = document.querySelector('.filter-dropdown-btn');
        if (dropdown && !dropdown.contains(e.target) && !btn.contains(e.target)) {
            dropdown.classList.remove('show');
        }
    });

    // Close modals on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAdminModal();
            closeDetailModal();
            closeConfirmModal();
        }
    });

    // Close modals on backdrop click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                if (overlay.id === 'adminModal') closeAdminModal();
                if (overlay.id === 'detailModal') closeDetailModal();
                if (overlay.id === 'confirmModal') closeConfirmModal();
            }
        });
    });

    // Load data
    loadAdmins();
});

// ── Time ─────────────────────────────────────────────────────────────────────
function updateTime() {
    const now = new Date();
    document.getElementById('current-time').textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Toast System ───────────────────────────────────────────────────────────
function showToast(title, message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type]}</span>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            ${message ? `<div class="toast-message">${message}</div>` : ''}
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
    `;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ── Confirmation Dialog ────────────────────────────────────────────────────
function showConfirm(title, message, icon, onConfirm, btnText = 'Confirm', btnClass = '') {
    document.getElementById('confirmIcon').textContent = icon;
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    const btn = document.getElementById('confirmBtn');
    btn.textContent = btnText;
    btn.className = 'action-btn' + (btnClass ? ' ' + btnClass : '');
    confirmCallback = onConfirm;
    document.getElementById('confirmModal').style.display = 'flex';
}

function closeConfirmModal() {
    document.getElementById('confirmModal').style.display = 'none';
    confirmCallback = null;
}

function executeConfirm() {
    if (confirmCallback) confirmCallback();
    closeConfirmModal();
}

// ── Load Admins ─────────────────────────────────────────────────────────────
async function loadAdmins() {
    const tbody = document.getElementById('admins-tbody');
    tbody.innerHTML = `<tr><td colspan="7" class="loading-row"><div class="spinner"></div> Loading administrators...</td></tr>`;
    document.getElementById('emptyState').style.display = 'none';

    try {
        const response = await fetch(`${API_BASE}/admin/users`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.status === 401 || response.status === 403) {
            showToast('Session Expired', 'Please log in again.', 'warning');
            setTimeout(logout, 1500);
            return;
        }

        const resData = await response.json();
        if (!response.ok) throw new Error(resData.message || 'Failed to load admins');

        allAdmins = resData.data || [];
        applyFilters();
        updateKPICards();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" class="loading-row" style="color:var(--danger);">❌ ${err.message}</td></tr>`;
        showToast('Error', err.message, 'error');
    }
}

// ── KPI Cards ────────────────────────────────────────────────────────────────
function updateKPICards() {
    const total = allAdmins.length;
    const active = allAdmins.filter(a => a.isActive).length;
    const superAdmins = allAdmins.filter(a => a.role === 'super_admin').length;

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const recent = allAdmins.filter(a => new Date(a.createdAt) > oneWeekAgo).length;

    animateNumber('kpi-total', total);
    animateNumber('kpi-active', active);
    document.getElementById('kpi-active-pct').textContent = total > 0 ? `${Math.round((active / total) * 100)}% of total` : '0% of total';
    animateNumber('kpi-super', superAdmins);
    animateNumber('kpi-recent', recent);
}

function animateNumber(id, target) {
    const el = document.getElementById(id);
    const start = parseInt(el.textContent) || 0;
    if (start === target) return;
    const duration = 600;
    const startTime = performance.now();

    function step(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(start + (target - start) * eased);
        if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

// ── Filter & Search ────────────────────────────────────────────────────────
function applyFilters() {
    let result = [...allAdmins];

    // Role filter
    if (currentFilters.role !== 'all') {
        result = result.filter(a => a.role === currentFilters.role);
    }

    // Status filter
    if (currentFilters.status !== 'all') {
        const isActive = currentFilters.status === 'active';
        result = result.filter(a => a.isActive === isActive);
    }

    // Search
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        result = result.filter(a =>
            (a.name && a.name.toLowerCase().includes(q)) ||
            (a.email && a.email.toLowerCase().includes(q)) ||
            (a.role && a.role.toLowerCase().includes(q))
        );
    }

    // Sort
    result.sort((a, b) => {
        let va = a[currentSort.field];
        let vb = b[currentSort.field];

        if (currentSort.field === 'name') {
            va = (va || '').toLowerCase();
            vb = (vb || '').toLowerCase();
        } else if (currentSort.field === 'role') {
            const roleOrder = { super_admin: 0, admin: 1, moderator: 2, support: 3 };
            va = roleOrder[va] || 99;
            vb = roleOrder[vb] || 99;
        } else if (currentSort.field === 'createdAt') {
            va = new Date(va || 0).getTime();
            vb = new Date(vb || 0).getTime();
        }

        if (va < vb) return currentSort.dir === 'asc' ? -1 : 1;
        if (va > vb) return currentSort.dir === 'asc' ? 1 : -1;
        return 0;
    });

    filteredAdmins = result;
    currentPage = 1;
    renderTable();
}

function debounceSearch() {
    const input = document.getElementById('searchInput');
    searchQuery = input.value.trim();
    document.getElementById('searchClear').style.display = searchQuery ? 'block' : 'none';
    applyFilters();
}

function clearSearch() {
    document.getElementById('searchInput').value = '';
    searchQuery = '';
    document.getElementById('searchClear').style.display = 'none';
    applyFilters();
}

function toggleFilterDropdown() {
    document.getElementById('filterDropdown').classList.toggle('show');
}

// Filter chip clicks
document.addEventListener('click', (e) => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;

    const filterType = chip.dataset.filter;
    const filterValue = chip.dataset.value;

    // Update UI
    document.querySelectorAll(`.filter-chip[data-filter="${filterType}"]`).forEach(c => c.classList.remove('active'));
    chip.classList.add('active');

    // Update state
    currentFilters[filterType] = filterValue;
    applyFilters();
});

function handleSort() {
    const val = document.getElementById('sortSelect').value;
    const [field, dir] = val.split('-');
    currentSort = { field, dir };
    applyFilters();
}

function handlePageSizeChange() {
    pageSize = parseInt(document.getElementById('pageSize').value);
    currentPage = 1;
    renderTable();
}

// ── Render Table ───────────────────────────────────────────────────────────
function renderTable() {
    const tbody = document.getElementById('admins-tbody');
    const total = filteredAdmins.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    currentPage = Math.min(currentPage, totalPages);

    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    const pageItems = filteredAdmins.slice(start, end);

    document.getElementById('total-label').textContent = total;
    document.getElementById('paginationInfo').textContent =
        total === 0 ? 'No results' : `Showing ${start + 1}-${Math.min(end, total)} of ${total}`;

    if (total === 0) {
        tbody.innerHTML = '';
        document.getElementById('emptyState').style.display = 'block';
        renderPagination(0, 0);
        updateBulkBar();
        return;
    }

    document.getElementById('emptyState').style.display = 'none';

    const currentAdminName = localStorage.getItem('adminName');

    tbody.innerHTML = pageItems.map(adm => {
        const isSelf = adm.name === currentAdminName;
        const dateStr = new Date(adm.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
        const initials = adm.name ? adm.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'A';
        const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(adm.name || 'Admin')}&background=${isSelf ? '5D0D18' : '9FB2AC'}&color=fff&size=64`;

        const roleClass = `role-badge ${adm.role}`;
        const roleText = adm.role.replace('_', ' ');

        let permBadgesHtml = '';
        if (adm.role === 'super_admin') {
            permBadgesHtml = `<span class="perm-badge super">✨ All Permissions</span>`;
        } else if (adm.permissions && adm.permissions.length > 0) {
            const visible = adm.permissions.slice(0, 3);
            const hidden = adm.permissions.length - 3;
            permBadgesHtml = visible.map(p => `<span class="perm-badge">${formatPerm(p)}</span>`).join('');
            if (hidden > 0) permBadgesHtml += `<span class="perm-badge more">+${hidden} more</span>`;
        } else {
            permBadgesHtml = `<span style="color:var(--text-muted); font-style:italic; font-size:0.78rem;">No permissions</span>`;
        }

        const isSelected = selectedIds.has(adm._id);

        return `
            <tr class="${isSelected ? 'selected' : ''}" data-id="${adm._id}">
                <td class="col-select" data-label="Select">
                    <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleSelect('${adm._id}')" ${isSelf ? 'disabled' : ''}>
                </td>
                <td class="col-admin" data-label="Admin">
                    <div class="admin-cell">
                        <img src="${avatarUrl}" alt="${adm.name}" class="admin-avatar" onerror="this.src='https://ui-avatars.com/api/?name=A&background=9FB2AC&color=fff'">
                        <div class="admin-info">
                            <div class="admin-name">${adm.name}${isSelf ? '<span class="admin-self-tag">You</span>' : ''}</div>
                            <div class="admin-email">${adm.email}</div>
                        </div>
                    </div>
                </td>
                <td class="col-role" data-label="Role">
                    <span class="${roleClass}">${roleText}</span>
                </td>
                <td class="col-perms" data-label="Permissions">${permBadgesHtml}</td>
                <td class="col-status" data-label="Status">
                    <label class="status-toggle" title="${isSelf ? 'Cannot change own status' : 'Click to toggle'}">
                        <input type="checkbox" ${adm.isActive ? 'checked' : ''}
                            onchange="toggleAdminStatus('${adm._id}', this.checked)"
                            ${isSelf ? 'disabled' : ''}>
                        <span class="status-toggle-text">${adm.isActive ? 'Active' : 'Inactive'}</span>
                    </label>
                </td>
                <td class="col-created" data-label="Created">${dateStr}</td>
                <td class="col-actions" data-label="Actions">
                    <div class="action-group">
                        <button class="btn-icon" title="View Details" onclick="openDetailModal('${adm._id}')">👁️</button>
                        <button class="btn-icon" title="Edit" onclick="openEditModal('${adm._id}')">✏️</button>
                        ${isSelf ? '' : `<button class="btn-icon delete" title="Delete" onclick="confirmDeleteAdmin('${adm._id}')">🗑️</button>`}
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    renderPagination(currentPage, totalPages);
    updateBulkBar();
}

function formatPerm(perm) {
    return perm.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// ── Pagination ─────────────────────────────────────────────────────────────
function renderPagination(current, total) {
    const container = document.getElementById('pagination');
    if (total <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = '';

    // Prev
    html += `<button class="page-btn" onclick="goToPage(${current - 1})" ${current === 1 ? 'disabled' : ''}>←</button>`;

    // First page
    if (current > 3) {
        html += `<button class="page-btn" onclick="goToPage(1)">1</button>`;
        if (current > 4) html += `<button class="page-btn" disabled>...</button>`;
    }

    // Around current
    for (let i = Math.max(1, current - 2); i <= Math.min(total, current + 2); i++) {
        html += `<button class="page-btn ${i === current ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
    }

    // Last page
    if (current < total - 2) {
        if (current < total - 3) html += `<button class="page-btn" disabled>...</button>`;
        html += `<button class="page-btn" onclick="goToPage(${total})">${total}</button>`;
    }

    // Next
    html += `<button class="page-btn" onclick="goToPage(${current + 1})" ${current === total ? 'disabled' : ''}>→</button>`;

    container.innerHTML = html;
}

function goToPage(page) {
    currentPage = page;
    renderTable();
}

// ── Bulk Actions ───────────────────────────────────────────────────────────
function toggleSelect(id) {
    if (selectedIds.has(id)) {
        selectedIds.delete(id);
    } else {
        selectedIds.add(id);
    }
    renderTable();
}

function toggleSelectAll() {
    const allChecked = document.getElementById('selectAllHeader').checked;
    const currentAdminName = localStorage.getItem('adminName');

    if (allChecked) {
        filteredAdmins.forEach(a => {
            if (a.name !== currentAdminName) selectedIds.add(a._id);
        });
    } else {
        selectedIds.clear();
    }
    renderTable();
}

function updateBulkBar() {
    const bar = document.getElementById('bulkBar');
    const count = selectedIds.size;
    if (count > 0) {
        bar.style.display = 'flex';
        document.getElementById('bulkCount').textContent = `${count} selected`;
        document.getElementById('selectAllHeader').checked = count === filteredAdmins.filter(a => a.name !== localStorage.getItem('adminName')).length;
    } else {
        bar.style.display = 'none';
        document.getElementById('selectAllHeader').checked = false;
    }
}

function bulkActivate() {
    if (selectedIds.size === 0) return;
    showConfirm(
        'Activate Selected?',
        `This will activate ${selectedIds.size} admin account(s).`,
        '✅',
        () => bulkUpdateStatus(true),
        'Activate'
    );
}

function bulkDeactivate() {
    if (selectedIds.size === 0) return;
    showConfirm(
        'Deactivate Selected?',
        `This will deactivate ${selectedIds.size} admin account(s).`,
        '⚠️',
        () => bulkUpdateStatus(false),
        'Deactivate'
    );
}

function bulkDelete() {
    if (selectedIds.size === 0) return;
    showConfirm(
        'Delete Selected?',
        `This will permanently delete ${selectedIds.size} admin account(s). This cannot be undone.`,
        '🗑️',
        () => executeBulkDelete(),
        'Delete',
        'delete-btn'
    );
}

async function bulkUpdateStatus(isActive) {
    const ids = Array.from(selectedIds);
    let success = 0, failed = 0;

    for (const id of ids) {
        try {
            const response = await fetch(`${API_BASE}/admin/users/${id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ isActive })
            });
            if (response.ok) success++;
            else failed++;
        } catch {
            failed++;
        }
    }

    selectedIds.clear();
    loadAdmins();
    showToast(
        isActive ? 'Accounts Activated' : 'Accounts Deactivated',
        `${success} succeeded${failed > 0 ? `, ${failed} failed` : ''}`,
        failed > 0 ? 'warning' : 'success'
    );
}

async function executeBulkDelete() {
    const ids = Array.from(selectedIds);
    let success = 0, failed = 0;

    for (const id of ids) {
        try {
            const response = await fetch(`${API_BASE}/admin/users/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            if (response.ok) success++;
            else failed++;
        } catch {
            failed++;
        }
    }

    selectedIds.clear();
    loadAdmins();
    showToast(
        'Accounts Deleted',
        `${success} deleted${failed > 0 ? `, ${failed} failed` : ''}`,
        failed > 0 ? 'warning' : 'success'
    );
}

// ── Toggle Single Status ───────────────────────────────────────────────────
async function toggleAdminStatus(id, isActive) {
    try {
        const response = await fetch(`${API_BASE}/admin/users/${id}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ isActive })
        });

        const resData = await response.json();
        if (!response.ok) throw new Error(resData.message || 'Failed to update status');

        // Update local data
        const admin = allAdmins.find(a => a._id === id);
        if (admin) admin.isActive = isActive;
        applyFilters();
        updateKPICards();
        showToast('Status Updated', `Account is now ${isActive ? 'active' : 'inactive'}.`, 'success');
    } catch (err) {
        showToast('Error', err.message, 'error');
        renderTable(); // Revert UI
    }
}

// ── Detail Modal ─────────────────────────────────────────────────────────────
function openDetailModal(id) {
    const admin = allAdmins.find(a => a._id === id);
    if (!admin) return;

    const initials = admin.name ? admin.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'A';
    document.getElementById('detailAvatar').textContent = initials;
    document.getElementById('detailName').textContent = admin.name;

    const roleEl = document.getElementById('detailRole');
    roleEl.textContent = admin.role.replace('_', ' ');
    roleEl.className = `role-badge ${admin.role}`;

    const statusEl = document.getElementById('detailStatus');
    statusEl.textContent = admin.isActive ? 'Active' : 'Inactive';
    statusEl.className = `badge ${admin.isActive ? 'approved' : 'rejected'}`;

    document.getElementById('detailEmail').textContent = admin.email;
    document.getElementById('detailId').textContent = admin._id;
    document.getElementById('detailCreated').textContent = new Date(admin.createdAt).toLocaleString();
    document.getElementById('detailUpdated').textContent = admin.updatedAt ? new Date(admin.updatedAt).toLocaleString() : '—';

    const permsContainer = document.getElementById('detailPerms');
    if (admin.role === 'super_admin') {
        permsContainer.innerHTML = `<span class="perm-badge super">✨ All Permissions (Wildcard)</span>`;
    } else if (admin.permissions && admin.permissions.length > 0) {
        permsContainer.innerHTML = admin.permissions.map(p => `<span class="perm-badge">${formatPerm(p)}</span>`).join('');
    } else {
        permsContainer.innerHTML = `<span style="color:var(--text-muted); font-style:italic;">No custom permissions assigned</span>`;
    }

    document.getElementById('detailEditBtn').onclick = () => {
        closeDetailModal();
        openEditModal(id);
    };

    document.getElementById('detailModal').style.display = 'flex';
}

function closeDetailModal() {
    document.getElementById('detailModal').style.display = 'none';
}

function editFromDetail() {
    closeDetailModal();
    // The onclick handler in openDetailModal handles this
}

// ── Create / Edit Modal ──────────────────────────────────────────────────────
function openCreateModal() {
    document.getElementById('modal-title').textContent = 'Create Admin Account';
    document.getElementById('formAdminId').value = '';
    document.getElementById('formName').value = '';
    document.getElementById('formEmail').value = '';
    document.getElementById('formPassword').value = '';
    document.getElementById('formPassword').required = true;
    document.getElementById('pwd-hint').textContent = '(Minimum 8 characters)';
    document.getElementById('formRole').value = 'admin';
    document.getElementById('formActive').checked = true;
    document.getElementById('toggleLabel').textContent = 'Active';
    document.getElementById('modalError').style.display = 'none';
    document.getElementById('passwordStrength').style.display = 'none';

    const checkboxes = document.querySelectorAll('input[name="perms"]');
    checkboxes.forEach(cb => {
        cb.checked = false;
        cb.disabled = false;
    });

    updateRoleHint('admin');
    document.getElementById('adminModal').style.display = 'flex';
}

function openEditModal(id) {
    const admin = allAdmins.find(a => a._id === id);
    if (!admin) return;

    document.getElementById('modal-title').textContent = 'Edit Admin Account';
    document.getElementById('formAdminId').value = admin._id;
    document.getElementById('formName').value = admin.name;
    document.getElementById('formEmail').value = admin.email;
    document.getElementById('formPassword').value = '';
    document.getElementById('formPassword').required = false;
    document.getElementById('pwd-hint').textContent = '(Leave blank to keep current password)';
    document.getElementById('formRole').value = admin.role;
    document.getElementById('formActive').checked = admin.isActive;
    document.getElementById('toggleLabel').textContent = admin.isActive ? 'Active' : 'Inactive';
    document.getElementById('modalError').style.display = 'none';
    document.getElementById('passwordStrength').style.display = 'none';

    const checkboxes = document.querySelectorAll('input[name="perms"]');
    checkboxes.forEach(cb => {
        cb.checked = admin.permissions && admin.permissions.includes(cb.value);
        cb.disabled = false;
    });

    handleRoleChange();
    updateRoleHint(admin.role);
    document.getElementById('adminModal').style.display = 'flex';
}

function closeAdminModal() {
    document.getElementById('adminModal').style.display = 'none';
}

function handleRoleChange() {
    const roleValue = document.getElementById('formRole').value;
    const checkboxes = document.querySelectorAll('input[name="perms"]');

    updateRoleHint(roleValue);

    if (roleValue === 'super_admin') {
        checkboxes.forEach(cb => {
            cb.checked = true;
            cb.disabled = true;
        });
    } else {
        const isEditing = document.getElementById('formAdminId').value !== '';
        checkboxes.forEach(cb => {
            cb.disabled = false;
            if (!isEditing) cb.checked = false;
        });
    }
}

function updateRoleHint(role) {
    const hints = {
        super_admin: 'Full access to all features and settings. All permissions are automatically granted.',
        admin: 'Standard admin with customizable permissions. Choose which features they can access.',
        moderator: 'Limited access focused on content moderation and request management.',
        support: 'Basic access for customer support tasks and request viewing only.'
    };
    document.getElementById('roleHint').textContent = hints[role] || '';
}

// Toggle switch label
function updateToggleLabel() {
    const isActive = document.getElementById('formActive').checked;
    document.getElementById('toggleLabel').textContent = isActive ? 'Active' : 'Inactive';
}
document.getElementById('formActive').addEventListener('change', updateToggleLabel);

// Password visibility toggle
function togglePasswordVisibility() {
    const input = document.getElementById('formPassword');
    const btn = document.querySelector('.password-toggle');
    if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = '🙈';
    } else {
        input.type = 'password';
        btn.textContent = '👁️';
    }
}

// Password strength
function checkPasswordStrength() {
    const password = document.getElementById('formPassword').value;
    const strengthEl = document.getElementById('passwordStrength');
    const fillEl = document.getElementById('strengthFill');
    const textEl = document.getElementById('strengthText');

    if (!password) {
        strengthEl.style.display = 'none';
        return;
    }

    strengthEl.style.display = 'flex';

    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    fillEl.className = 'strength-fill';
    if (score <= 2) {
        fillEl.classList.add('weak');
        textEl.textContent = 'Weak';
        textEl.style.color = 'var(--danger)';
    } else if (score <= 4) {
        fillEl.classList.add('fair');
        textEl.textContent = 'Fair';
        textEl.style.color = 'var(--warning)';
    } else {
        fillEl.classList.add('strong');
        textEl.textContent = 'Strong';
        textEl.style.color = 'var(--success)';
    }
}

// ── Form Submit ──────────────────────────────────────────────────────────────
async function handleFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('formAdminId').value;
    const name = document.getElementById('formName').value.trim();
    const email = document.getElementById('formEmail').value.trim();
    const password = document.getElementById('formPassword').value;
    const role = document.getElementById('formRole').value;
    const isActive = document.getElementById('formActive').checked;

    const checkboxes = document.querySelectorAll('input[name="perms"]');
    const permissions = [];
    checkboxes.forEach(cb => {
        if (cb.checked) permissions.push(cb.value);
    });

    const errorDiv = document.getElementById('modalError');
    errorDiv.style.display = 'none';

    // Validation
    if (!name) {
        errorDiv.textContent = 'Please enter a full name';
        errorDiv.style.display = 'block';
        return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errorDiv.textContent = 'Please enter a valid email address';
        errorDiv.style.display = 'block';
        return;
    }
    if (!id && password.length < 8) {
        errorDiv.textContent = 'Password must be at least 8 characters long';
        errorDiv.style.display = 'block';
        return;
    }
    if (role !== 'super_admin' && permissions.length === 0) {
        errorDiv.textContent = 'Please select at least one permission for non-super admin roles';
        errorDiv.style.display = 'block';
        return;
    }

    const payload = { name, email, role, permissions, isActive };
    if (password) payload.password = password;

    const url = id ? `${API_BASE}/admin/users/${id}` : `${API_BASE}/admin/users`;
    const method = id ? 'PATCH' : 'POST';

    // Loading state
    const submitBtn = document.getElementById('submitBtn');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnSpinner = submitBtn.querySelector('.btn-spinner');
    submitBtn.disabled = true;
    btnText.textContent = id ? 'Saving...' : 'Creating...';
    btnSpinner.style.display = 'inline-flex';

    try {
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(payload)
        });

        const resData = await response.json();
        if (!response.ok) {
            throw new Error(resData.errors?.[0]?.message || resData.message || 'Operation failed');
        }

        closeAdminModal();
        showToast(
            id ? 'Account Updated' : 'Account Created',
            id ? `${name}'s account has been updated.` : `${name} has been added as an admin.`,
            'success'
        );
        loadAdmins();
    } catch (err) {
        errorDiv.textContent = err.message;
        errorDiv.style.display = 'block';
    } finally {
        submitBtn.disabled = false;
        btnText.textContent = 'Save Account';
        btnSpinner.style.display = 'none';
    }
}

// ── Delete ───────────────────────────────────────────────────────────────────
function confirmDeleteAdmin(id) {
    const admin = allAdmins.find(a => a._id === id);
    const name = admin ? admin.name : 'this admin';
    showConfirm(
        'Delete Admin Account?',
        `Are you sure you want to permanently delete ${name}'s account? This action cannot be undone.`,
        '🗑️',
        () => deleteAdmin(id),
        'Delete',
        'delete-btn'
    );
}

async function deleteAdmin(id) {
    try {
        const response = await fetch(`${API_BASE}/admin/users/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        const resData = await response.json();
        if (!response.ok) throw new Error(resData.message || 'Failed to delete admin');

        selectedIds.delete(id);
        showToast('Account Deleted', 'The administrator has been removed.', 'success');
        loadAdmins();
    } catch (err) {
        showToast('Error', err.message, 'error');
    }
}

// ── Export ───────────────────────────────────────────────────────────────────
function exportToCSV() {
    const headers = ['Name', 'Email', 'Role', 'Status', 'Permissions', 'Created At'];
    const rows = filteredAdmins.map(a => [
        a.name,
        a.email,
        a.role.replace('_', ' '),
        a.isActive ? 'Active' : 'Inactive',
        a.role === 'super_admin' ? 'All' : (a.permissions || []).join(', '),
        new Date(a.createdAt).toISOString()
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `admins-export-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('Export Complete', `${filteredAdmins.length} records exported to CSV.`, 'success');
}

// ── Logout ───────────────────────────────────────────────────────────────────
function logout() {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminName');
    localStorage.removeItem('adminRole');
    window.location.href = 'index.html';
}
