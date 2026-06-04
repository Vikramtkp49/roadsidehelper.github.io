const API_BASE = (window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1') || window.location.protocol === 'file:')
    ? 'http://localhost:5000/api'
    : window.location.origin + '/api';
let authToken = localStorage.getItem('adminToken');
if (!authToken) window.location.href = 'index.html';

let currentPage = 1;
let currentStatus = 'all';
let searchQuery = '';
let searchTimer = null;
let selectedRequestId = null;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('admin-name').textContent = localStorage.getItem('adminName') || 'Admin';
    updateTime();
    setInterval(updateTime, 1000);
    loadRequests();
});

function updateTime() {
    document.getElementById('current-time').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
    currentPage = 1;
    loadRequests();
}

async function loadRequests() {
    const tbody = document.getElementById('requests-tbody');
    tbody.innerHTML = '<tr><td colspan="8" class="loading-row"><div class="spinner"></div> Loading...</td></tr>';

    try {
        let url = `${API_BASE}/admin/requests?page=${currentPage}&limit=10`;
        if (currentStatus !== 'all') url += `&status=${currentStatus}`;
        if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;

        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${authToken}` } });
        if (res.status === 401 || res.status === 403) { logout(); return; }
        const result = await res.json();

        document.getElementById('total-label').textContent = result.pagination.total;

        if (!result.data || result.data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="loading-row">No requests found</td></tr>';
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
                    <div class="cell-secondary">${req.vehicleModel || ''}</div>
                </td>
                <td class="problem-cell">${req.problem}</td>
                <td class="cell-secondary">${req.location?.city || '—'}</td>
                <td><span class="badge badge-${req.status}">${capitalize(req.status)}</span></td>
                <td class="cell-secondary">${new Date(req.createdAt).toLocaleDateString()}</td>
                <td><button class="action-btn" onclick="openStatusModal('${req._id}', '${req.name}', '${req.status}')">Change</button></td>
            </tr>
        `).join('');

        renderPagination(result.pagination);
    } catch (err) {
        console.error(err);
        tbody.innerHTML = '<tr><td colspan="8" class="loading-row">Failed to load requests</td></tr>';
    }
}

function renderPagination(p) {
    const container = document.getElementById('pagination');
    if (p.pages <= 1) { container.innerHTML = ''; return; }

    let html = '';
    html += `<button class="page-btn" ${p.page <= 1 ? 'disabled' : ''} onclick="goToPage(${p.page - 1})">← Prev</button>`;
    for (let i = 1; i <= p.pages; i++) {
        html += `<button class="page-btn ${i === p.page ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
    }
    html += `<button class="page-btn" ${p.page >= p.pages ? 'disabled' : ''} onclick="goToPage(${p.page + 1})">Next →</button>`;
    container.innerHTML = html;
}

function goToPage(page) {
    currentPage = page;
    loadRequests();
}

function openStatusModal(id, name, currentStatus) {
    selectedRequestId = id;
    document.getElementById('modal-req-info').textContent = `Updating status for: ${name}`;
    document.getElementById('statusModal').style.display = 'flex';

    // Highlight current status
    document.querySelectorAll('.status-btn').forEach(btn => btn.classList.remove('current'));
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
        if (res.ok) {
            closeModal();
            loadRequests();
        } else {
            alert('Failed to update status');
        }
    } catch (err) {
        alert('Error updating status');
    }
}

function capitalize(s) { if (!s) return ''; return s.charAt(0).toUpperCase() + s.slice(1); }

function logout() {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminName');
    window.location.href = 'index.html';
}
