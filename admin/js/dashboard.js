const getApiBase = () => {
    if (window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1') || window.location.protocol === 'file:') {
        return 'http://localhost:5000/api';
    }
    const backend = localStorage.getItem('BACKEND_URL') || 'https://roadside-helper-tc7q.onrender.com';
    return backend + '/api';
};
const API_BASE = getApiBase();
let authToken = localStorage.getItem('adminToken');

if (!authToken) {
    window.location.href = 'index.html';
}

document.addEventListener('DOMContentLoaded', () => {
    // Set admin name
    const adminName = localStorage.getItem('adminName') || 'Admin';
    document.getElementById('admin-name').textContent = adminName;
    
    // Start time updates
    updateTime();
    setInterval(updateTime, 1000);

    // Load Data
    loadDashboardData();
});

function updateTime() {
    const now = new Date();
    document.getElementById('current-time').textContent = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}

async function loadDashboardData() {
    try {
        const response = await fetch(`${API_BASE}/admin/analytics/overview`, {
            headers: { 
                'Authorization': `Bearer ${authToken}` 
            }
        });

        if (response.status === 401 || response.status === 403) {
            logout();
            return;
        }

        if (!response.ok) throw new Error('Failed to load data');

        const result = await response.json();
        const data = result.data;

        // Update KPI cards
        document.getElementById('today-requests').textContent = data.todayRequests;
        document.getElementById('total-mechanics').textContent = data.totalMechanics;
        const pendingEl = document.getElementById('pending-mechanics');
        if (pendingEl) pendingEl.textContent = data.pendingApprovals;
        document.getElementById('total-requests').textContent = data.totalRequests;
        document.getElementById('month-requests').textContent = data.monthRequests;

        // Load recent requests
        loadRecentRequests();

        // Load charts
        loadCharts(data);
    } catch (error) {
        console.error('Error loading dashboard:', error);
        alert('Failed to load dashboard data. Ensure backend is running.');
    }
}

async function loadRecentRequests() {
    try {
        const response = await fetch(`${API_BASE}/admin/requests?limit=10&page=1`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        const result = await response.json();
        const tbody = document.getElementById('requests-tbody');
        
        if (!result.data || result.data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No requests found</td></tr>';
            return;
        }

        // Store for modal lookup
        window._dashRequests = {};
        result.data.forEach(req => { window._dashRequests[req._id] = req; });

        tbody.innerHTML = result.data.map(req => `
            <tr>
                <td>${req._id.substring(0, 8)}...</td>
                <td>${req.name}</td>
                <td>${req.vehicle}</td>
                <td><span class="badge badge-${req.status.toLowerCase()}">${req.status}</span></td>
                <td>${new Date(req.createdAt).toLocaleDateString()}</td>
                <td><a href="#" style="color: var(--primary-color);" onclick="openRequestModal('${req._id}'); return false;">View</a></td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading requests:', error);
    }
}

async function loadCharts(data) {
    // Status Chart
    const statusCtx = document.getElementById('statusChart').getContext('2d');
    
    // Ensure all statuses have a default value even if 0
    const statusData = {
        'pending': data.requestsByStatus['pending'] || 0,
        'assigned': data.requestsByStatus['assigned'] || 0,
        'completed': data.requestsByStatus['completed'] || 0,
        'cancelled': data.requestsByStatus['cancelled'] || 0
    };

    new Chart(statusCtx, {
        type: 'doughnut',
        data: {
            labels: ['Pending', 'Assigned', 'Completed', 'Cancelled'],
            datasets: [{
                data: Object.values(statusData),
                backgroundColor: [
                    '#f59e0b', // warning
                    '#3b82f6', // primary
                    '#10b981', // success
                    '#ef4444'  // danger
                ],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { 
                    position: 'bottom',
                    labels: { color: '#94a3b8' } 
                } 
            },
            cutout: '70%'
        }
    });

    // Timeline Chart
    try {
        const timelineResponse = await fetch(`${API_BASE}/admin/analytics/requests-timeline`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const timelineResult = await timelineResponse.json();
        const timelineData = timelineResult.data;

        const timelineCtx = document.getElementById('timelineChart').getContext('2d');
        new Chart(timelineCtx, {
            type: 'line',
            data: {
                labels: timelineData.map(d => d._id),
                datasets: [{
                    label: 'Daily Requests',
                    data: timelineData.map(d => d.count),
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { 
                    legend: { display: false } 
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#94a3b8' }
                    },
                    y: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#94a3b8', stepSize: 1 }
                    }
                }
            }
        });
    } catch (e) {
        console.error("Timeline chart error:", e);
    }
}

function openRequestModal(id) {
    try {
        const req = window._dashRequests && window._dashRequests[id];
        if (!req) return;

        // Badge
        const badge = document.getElementById('req-modal-badge');
        if (badge) {
            badge.className = `badge badge-${req.status.toLowerCase()}`;
            badge.textContent = req.status.charAt(0).toUpperCase() + req.status.slice(1);
        }

        // Location formatting
        let locText = '—';
        if (req.location) {
            if (req.location.address) {
                locText = req.location.address;
                if (req.location.city) locText += `, ${req.location.city}`;
            } else if (req.location.city) {
                locText = req.location.city;
            }
        }

        // Assigned Mechanic check
        let mechanicText = 'Not assigned yet';
        if (req.assignedMechanic) {
            mechanicText = req.assignedMechanic.name || 'Assigned';
        } else if (req.mechanic) {
            mechanicText = typeof req.mechanic === 'object' ? req.mechanic.name : req.mechanic;
        }

        // Detail rows
        const details = [
            ['🆔 Request ID',  req._id],
            ['👤 Customer',    req.name],
            ['📞 Phone',       req.phone || '—'],
            ['🚗 Vehicle',     `${req.vehicle}${req.vehicleModel ? ' — ' + req.vehicleModel : ''}`],
            ['🔧 Problem',     req.problem || '—'],
            ['📍 Location',    locText],
            ['📅 Created',     req.createdAt ? new Date(req.createdAt).toLocaleString() : '—'],
            ['👨‍🔧 Assigned To', mechanicText],
        ];

        const detailsContainer = document.getElementById('req-modal-details');
        if (detailsContainer) {
            detailsContainer.innerHTML = details.map(([label, value]) => `
                <div class="detail-row">
                    <span>${label}</span>
                    <span style="font-weight:500; max-width:60%; text-align:right; word-break:break-word;">${value || '—'}</span>
                </div>
            `).join('');
        }

        const modal = document.getElementById('requestDetailModal');
        if (modal) {
            modal.style.display = 'flex';
        }
    } catch (err) {
        console.error('Error opening request modal:', err);
        alert('Could not open request details: ' + err.message);
    }
}

function closeRequestModal() {
    const modal = document.getElementById('requestDetailModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function logout() {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminName');
    window.location.href = 'index.html';
}