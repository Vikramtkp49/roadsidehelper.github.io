const getApiBase = () => {
    if (window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1') || window.location.protocol === 'file:') {
        return 'http://localhost:5000/api';
    }
    const backend = localStorage.getItem('BACKEND_URL') || 'https://roadside-helper-tc7q.onrender.com';
    return backend + '/api';
};
const API_BASE = getApiBase();
let authToken = localStorage.getItem('adminToken');
if (!authToken) window.location.href = 'index.html';

let currentPage   = 1;
let currentStatus = 'all';
let searchQuery   = '';
let searchTimer   = null;
let selectedRequestId = null;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('admin-name').textContent = localStorage.getItem('adminName') || 'Admin';
    updateTime();
    setInterval(updateTime, 1000);
    loadRequests();
});

function updateTime() {
    document.getElementById('current-time').textContent =
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function debounceSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
        searchQuery = document.getElementById('searchInput').value.trim();
        currentPage = 1;
        loadRequests();
    }, 400);
}

function setStatus(btn) {
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    currentStatus = btn.dataset.status;
    currentPage   = 1;
    loadRequests();
}

async function loadRequests() {
    const tbody = document.getElementById('requests-tbody');
    tbody.innerHTML = '<tr><td colspan="9" class="loading-row"><div class="spinner"></div> Loading...</td></tr>';

    try {
        let url = `${API_BASE}/admin/requests?page=${currentPage}&limit=10`;
        if (currentStatus !== 'all') url += `&status=${currentStatus}`;
        if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;

        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${authToken}` } });
        if (res.status === 401 || res.status === 403) { logout(); return; }
        const result = await res.json();

        document.getElementById('total-label').textContent = result.pagination.total;

        if (!result.data || result.data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="loading-row">No requests found</td></tr>';
            document.getElementById('pagination').innerHTML = '';
            return;
        }

        tbody.innerHTML = result.data.map(req => `
            <tr>
                <td class="id-cell">${req._id.substring(0, 8)}…</td>
                <td>
                    <div class="cell-primary">${req.name}</div>
                    <div class="cell-secondary">${req.phone}</div>
                </td>
                <td>
                    <div class="cell-primary">${req.vehicle}</div>
                </td>
                <td class="problem-cell">${req.problem}</td>
                <td class="cell-secondary">
                    ${req.location?.city || '—'}
                    ${req.location?.pincode && req.location.pincode !== '—'
                        ? `<br><span style="font-size:11px;">📮 ${req.location.pincode}</span>`
                        : ''}
                </td>
                <td><span class="badge badge-${req.status}">${capitalize(req.status)}</span></td>
                <td class="mechanic-cell">
                    ${buildMechanicCell(req)}
                </td>
                <td class="cell-secondary">${new Date(req.createdAt).toLocaleDateString()}</td>
                <td>
                    <div class="action-group">
                        <button class="action-btn"
                            onclick="openStatusModal('${req._id}', '${req.name}', '${req.status}')">
                            Change Status
                        </button>
                        ${req.status !== 'completed' && req.status !== 'cancelled'
                            ? `<button class="rematch-btn" id="rematch-${req._id}"
                                onclick="rematch('${req._id}', this)">
                                🔄 Re-match
                              </button>`
                            : ''}
                    </div>
                </td>
            </tr>
        `).join('');

        renderPagination(result.pagination);
    } catch (err) {
        console.error(err);
        tbody.innerHTML = '<tr><td colspan="9" class="loading-row">Failed to load requests</td></tr>';
    }
}

// ── Build the mechanic cell HTML ──────────────────────────────
function buildMechanicCell(req) {
    const methodLabel = {
        pincode_exact: '📮 Pincode',
        radius_15km:   '📍 15 km',
        manual:        '✍️ Manual',
        none:          ''
    };
    const methodClass = {
        pincode_exact: 'pincode',
        radius_15km:   'radius',
        manual:        'manual',
        none:          'none'
    };

    if (req.assignedMechanic) {
        const m = req.assignedMechanic;
        const method = req.matchMethod || 'none';
        return `
            <div class="mech-name">${m.name}</div>
            <div class="mech-phone">📞 ${m.phone}</div>
            ${method !== 'none'
                ? `<span class="match-badge ${methodClass[method] || 'none'}">
                       ${methodLabel[method] || method}
                   </span>`
                : ''}
        `;
    }
    return `<span class="mech-unassigned">Not assigned</span>`;
}

// ── Re-match a request ────────────────────────────────────────
async function rematch(requestId, btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Matching…';
    try {
        const res = await fetch(`${API_BASE}/admin/requests/${requestId}/rematch`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const result = await res.json();
        if (res.ok) {
            showToast(result.message, result.data?.assignedMechanic ? 'success' : 'warning');
            loadRequests();
        } else {
            showToast(result.message || 'Re-match failed', 'error');
            btn.disabled = false;
            btn.textContent = '🔄 Re-match';
        }
    } catch (err) {
        showToast('Network error during re-match', 'error');
        btn.disabled = false;
        btn.textContent = '🔄 Re-match';
    }
}

// ── Pagination ────────────────────────────────────────────────
function renderPagination(p) {
    const container = document.getElementById('pagination');
    if (p.pages <= 1) { container.innerHTML = ''; return; }
    let html = `<button class="page-btn" ${p.page <= 1 ? 'disabled' : ''} onclick="goToPage(${p.page - 1})">← Prev</button>`;
    for (let i = 1; i <= p.pages; i++) {
        html += `<button class="page-btn ${i === p.page ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
    }
    html += `<button class="page-btn" ${p.page >= p.pages ? 'disabled' : ''} onclick="goToPage(${p.page + 1})">Next →</button>`;
    container.innerHTML = html;
}

function goToPage(page) { currentPage = page; loadRequests(); }

// ── Status modal ──────────────────────────────────────────────
function openStatusModal(id, name, status) {
    selectedRequestId = id;
    document.getElementById('modal-req-info').textContent = `Updating status for: ${name}`;
    document.getElementById('statusModal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('statusModal').style.display = 'none';
    selectedRequestId = null;
}

async function updateStatus(status) {
    if (!selectedRequestId) return;
    try {
        const res = await fetch(`${API_BASE}/admin/requests/${selectedRequestId}/status`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        if (res.ok) { closeModal(); loadRequests(); }
        else showToast('Failed to update status', 'error');
    } catch (err) {
        showToast('Error updating status', 'error');
    }
}

// ── Helpers ───────────────────────────────────────────────────
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

function logout() {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminName');
    window.location.href = 'index.html';
}

function showToast(message, type = 'info') {
    const existing = document.getElementById('toast-notif');
    if (existing) existing.remove();
    const colors = {
        success: { bg: '#d1fae5', border: '#059669', text: '#065f46' },
        error:   { bg: '#fee2e2', border: '#dc2626', text: '#7f1d1d' },
        warning: { bg: '#fef3c7', border: '#d97706', text: '#78350f' },
        info:    { bg: '#dbeafe', border: '#2563eb', text: '#1e3a8a' }
    };
    const c = colors[type] || colors.info;
    const toast = document.createElement('div');
    toast.id = 'toast-notif';
    toast.style.cssText = `
        position:fixed; top:24px; right:24px; z-index:9999;
        padding:12px 20px; border-radius:10px;
        background:${c.bg}; border:1px solid ${c.border}; color:${c.text};
        font-size:13px; font-weight:600; box-shadow:0 4px 12px rgba(0,0,0,0.1);
        animation: fadeInDown .3s ease; max-width:340px;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 4000);
}