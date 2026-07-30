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

let currentPage = 1;
let currentStatus = 'all';
let searchQuery = '';
let searchTimer = null;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('admin-name').textContent = localStorage.getItem('adminName') || 'Admin';
    updateTime();
    setInterval(updateTime, 1000);
    loadMechanics();
});

function updateTime() {
    document.getElementById('current-time').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function debounceSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
        searchQuery = document.getElementById('searchInput').value.trim();
        currentPage = 1;
        loadMechanics();
    }, 400);
}

function setStatus(btn) {
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    currentStatus = btn.dataset.status;
    currentPage = 1;
    loadMechanics();
}

async function loadMechanics() {
    const grid = document.getElementById('mechanics-grid');
    grid.innerHTML = '<div class="loading-placeholder"><div class="spinner"></div> Loading mechanics...</div>';

    try {
        let url = `${API_BASE}/admin/mechanics?page=${currentPage}&limit=12`;
        if (currentStatus !== 'all') url += `&status=${currentStatus}`;
        if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;

        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${authToken}` } });
        if (res.status === 401 || res.status === 403) { logout(); return; }
        const result = await res.json();

        if (!result.data || result.data.length === 0) {
            grid.innerHTML = '<div class="loading-placeholder">No mechanics found</div>';
            document.getElementById('pagination').innerHTML = '';
            return;
        }

        grid.innerHTML = result.data.map(m => `
            <div class="mechanic-card" onclick="openMechanicModal('${m._id}')">
                <div class="mc-header">
                    <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(m.name)}&background=${statusColor(m.status)}&color=fff&size=50" alt="${m.name}">
                    <div>
                        <h4>${m.name}</h4>
                        <p class="cell-secondary">${m.location?.city || '—'}</p>
                    </div>
                    <span class="badge badge-${m.status === 'approved' ? 'completed' : m.status}">${capitalize(m.status)}</span>
                </div>
                <div class="mc-stats">
                    <div class="mc-stat"><span class="mc-stat-value">⭐ ${m.rating.toFixed(1)}</span><span class="mc-stat-label">Rating</span></div>
                    <div class="mc-stat"><span class="mc-stat-value">${m.totalJobs}</span><span class="mc-stat-label">Jobs</span></div>
                    <div class="mc-stat"><span class="mc-stat-value">${m.experience}y</span><span class="mc-stat-label">Exp</span></div>
                </div>
                <div class="mc-skills">${m.skills.map(s => `<span class="skill-tag">${s}</span>`).join('')}</div>
                ${m.status === 'pending' ? `
                    <div class="mc-pending-actions" onclick="event.stopPropagation()">
                        <button class="approve-btn" onclick="approveMechanic('${m._id}')">✅ Approve</button>
                        <button class="reject-btn" onclick="rejectMechanic('${m._id}')">❌ Reject</button>
                    </div>
                ` : ''}
            </div>
        `).join('');

        // Store data for modal
        window._mechanicsData = {};
        result.data.forEach(m => { window._mechanicsData[m._id] = m; });

        renderPagination(result.pagination);
    } catch (err) {
        console.error(err);
        grid.innerHTML = '<div class="loading-placeholder">Failed to load mechanics</div>';
    }
}

function statusColor(status) {
    return { pending: 'f59e0b', approved: '10b981', rejected: 'ef4444' }[status] || '3b82f6';
}

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

function goToPage(page) { currentPage = page; loadMechanics(); }

function openMechanicModal(id) {
    const m = window._mechanicsData[id];
    if (!m) return;

    document.getElementById('modal-avatar').src = `https://ui-avatars.com/api/?name=${encodeURIComponent(m.name)}&background=${statusColor(m.status)}&color=fff&size=80`;
    document.getElementById('modal-name').textContent = m.name;
    document.getElementById('modal-location').textContent = `${m.location?.address || ''} ${m.location?.city || ''}`.trim();
    document.getElementById('modal-phone').textContent = m.phone;
    document.getElementById('modal-pincode').textContent = m.location?.pincode || '—';
    document.getElementById('modal-jobs').textContent = m.totalJobs;

    // Show vehicleType from server; fall back to 'Not specified' if missing
    document.getElementById('modal-vehicle-type').textContent =
        (m.vehicleType && m.vehicleType !== '—') ? m.vehicleType : 'Not specified';

    document.getElementById('modal-skills').textContent = m.skills.join(', ');

    const badge = document.getElementById('modal-status-badge');
    badge.className = `badge badge-${m.status === 'approved' ? 'completed' : m.status}`;
    badge.textContent = capitalize(m.status);

    const actions = document.getElementById('modal-actions');
    if (m.status === 'pending') {
        actions.innerHTML = `
            <button class="approve-btn" onclick="approveMechanic('${m._id}'); closeMechanicModal();">✅ Approve</button>
            <button class="reject-btn" onclick="rejectMechanic('${m._id}'); closeMechanicModal();">❌ Reject</button>
        `;
    } else if (m.status === 'approved') {
        actions.innerHTML = `<button class="reject-btn" onclick="rejectMechanic('${m._id}'); closeMechanicModal();">🚫 Revoke Approval</button>`;
    } else {
        actions.innerHTML = `<button class="approve-btn" onclick="approveMechanic('${m._id}'); closeMechanicModal();">✅ Approve</button>`;
    }
    actions.innerHTML += `<button class="delete-btn" onclick="deleteMechanic('${m._id}'); closeMechanicModal();">🗑️ Delete</button>`;

    document.getElementById('mechanicModal').style.display = 'flex';
}

function closeMechanicModal() {
    document.getElementById('mechanicModal').style.display = 'none';
}

async function approveMechanic(id) {
    await fetch(`${API_BASE}/admin/mechanics/${id}/approve`, {
        method: 'PATCH', headers: { 'Authorization': `Bearer ${authToken}` }
    });
    loadMechanics();
}

async function rejectMechanic(id) {
    await fetch(`${API_BASE}/admin/mechanics/${id}/reject`, {
        method: 'PATCH', headers: { 'Authorization': `Bearer ${authToken}` }
    });
    loadMechanics();
}

async function deleteMechanic(id) {
    if (!confirm('Are you sure you want to delete this mechanic?')) return;
    await fetch(`${API_BASE}/admin/mechanics/${id}`, {
        method: 'DELETE', headers: { 'Authorization': `Bearer ${authToken}` }
    });
    loadMechanics();
}

function capitalize(s) { if (!s) return ''; return s.charAt(0).toUpperCase() + s.slice(1); }

function logout() {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminName');
    window.location.href = 'index.html';
}