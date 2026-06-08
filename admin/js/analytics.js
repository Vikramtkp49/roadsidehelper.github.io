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

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('admin-name').textContent = localStorage.getItem('adminName') || 'Admin';
    updateTime();
    setInterval(updateTime, 1000);
    loadAnalytics();
});

function updateTime() {
    document.getElementById('current-time').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function loadAnalytics() {
    try {
        // Load overview + monthly + timeline in parallel
        const [overviewRes, monthlyRes, timelineRes] = await Promise.all([
            fetch(`${API_BASE}/admin/analytics/overview`, { headers: { 'Authorization': `Bearer ${authToken}` } }),
            fetch(`${API_BASE}/admin/analytics/monthly`, { headers: { 'Authorization': `Bearer ${authToken}` } }),
            fetch(`${API_BASE}/admin/analytics/requests-timeline`, { headers: { 'Authorization': `Bearer ${authToken}` } })
        ]);

        if (overviewRes.status === 401 || overviewRes.status === 403) { logout(); return; }

        const overview = (await overviewRes.json()).data;
        const monthly = (await monthlyRes.json()).data;
        const timeline = (await timelineRes.json()).data;

        // KPI Cards
        document.getElementById('a-total').textContent = overview.totalRequests;
        document.getElementById('a-completed').textContent = overview.requestsByStatus['completed'] || 0;
        document.getElementById('a-pending').textContent = overview.requestsByStatus['pending'] || 0;
        document.getElementById('a-mechanics').textContent = overview.totalMechanics;

        // Status Pie Chart
        renderStatusChart(overview.requestsByStatus);

        // Monthly Bar Chart
        renderMonthlyChart(monthly.monthly);

        // Timeline Line Chart
        renderTimelineChart(timeline);

        // Top Mechanics
        renderTopMechanicsChart(monthly.topMechanics);

    } catch (err) {
        console.error('Analytics load error:', err);
        alert('Failed to load analytics. Ensure backend is running.');
    }
}

function renderStatusChart(statusData) {
    const ctx = document.getElementById('statusPieChart').getContext('2d');
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Pending', 'Assigned', 'Completed', 'Cancelled'],
            datasets: [{
                data: [
                    statusData['pending'] || 0,
                    statusData['assigned'] || 0,
                    statusData['completed'] || 0,
                    statusData['cancelled'] || 0
                ],
                backgroundColor: ['#f59e0b', '#3b82f6', '#10b981', '#ef4444'],
                borderWidth: 0,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#94a3b8', padding: 16, font: { size: 13 } } }
            },
            cutout: '65%'
        }
    });
}

function renderMonthlyChart(monthlyData) {
    const ctx = document.getElementById('monthlyChart').getContext('2d');
    if (!monthlyData || monthlyData.length === 0) {
        ctx.canvas.parentElement.innerHTML += '<p style="color:#94a3b8;text-align:center;margin-top:20px">No monthly data yet</p>';
        return;
    }
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: monthlyData.map(d => formatMonth(d._id)),
            datasets: [{
                label: 'Requests',
                data: monthlyData.map(d => d.count),
                backgroundColor: 'rgba(59, 130, 246, 0.6)',
                borderColor: '#3b82f6',
                borderWidth: 1,
                borderRadius: 6,
                hoverBackgroundColor: 'rgba(59, 130, 246, 0.9)'
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } },
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', stepSize: 1 } }
            }
        }
    });
}

function renderTimelineChart(timelineData) {
    const ctx = document.getElementById('timelineChart').getContext('2d');
    if (!timelineData || timelineData.length === 0) {
        ctx.canvas.parentElement.innerHTML += '<p style="color:#94a3b8;text-align:center;margin-top:20px">No activity in last 30 days</p>';
        return;
    }
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: timelineData.map(d => d._id.substring(5)),  // MM-DD
            datasets: [{
                label: 'Daily Requests',
                data: timelineData.map(d => d.count),
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#10b981',
                pointRadius: 3,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#94a3b8', maxTicksLimit: 10 } },
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', stepSize: 1 } }
            }
        }
    });
}

function renderTopMechanicsChart(mechanics) {
    const ctx = document.getElementById('topMechanicsChart').getContext('2d');
    if (!mechanics || mechanics.length === 0) {
        ctx.canvas.parentElement.innerHTML += '<p style="color:#94a3b8;text-align:center;margin-top:20px">No mechanics data yet</p>';
        return;
    }
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: mechanics.map(m => m.name),
            datasets: [{
                label: 'Jobs Completed',
                data: mechanics.map(m => m.totalJobs),
                backgroundColor: [
                    'rgba(59, 130, 246, 0.7)',
                    'rgba(16, 185, 129, 0.7)',
                    'rgba(245, 158, 11, 0.7)',
                    'rgba(139, 92, 246, 0.7)',
                    'rgba(236, 72, 153, 0.7)'
                ],
                borderRadius: 6,
                borderSkipped: false
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                y: { grid: { display: false }, ticks: { color: '#94a3b8' } }
            }
        }
    });
}

function formatMonth(ym) {
    const [y, m] = ym.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[parseInt(m) - 1]} ${y.substring(2)}`;
}

function logout() {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminName');
    window.location.href = 'index.html';
}
