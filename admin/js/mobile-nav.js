/* ── Mobile sidebar toggle ── */
(function () {
    const TOPBAR_HTML = `
    <div class="mobile-topbar" id="mobile-topbar">
        <button class="sidebar-toggle" id="sidebar-toggle" aria-label="Toggle navigation">
            <span></span><span></span><span></span>
        </button>
        <span class="topbar-logo">🛠️ Roadside</span>
        <div class="topbar-right">
            <span class="topbar-username" id="topbar-username"></span>
            <img src="https://ui-avatars.com/api/?name=Admin&background=5D0D18&color=fff" alt="Admin">
        </div>
    </div>
    <div class="sidebar-backdrop" id="sidebar-backdrop"></div>`;

    document.addEventListener('DOMContentLoaded', function () {
        // Inject topbar into body
        document.body.insertAdjacentHTML('afterbegin', TOPBAR_HTML);

        const toggle    = document.getElementById('sidebar-toggle');
        const sidebar   = document.querySelector('.sidebar');
        const backdrop  = document.getElementById('sidebar-backdrop');
        const username  = document.getElementById('topbar-username');

        if (username) {
            username.textContent = localStorage.getItem('adminName') || 'Admin';
        }

        function openSidebar() {
            sidebar.classList.add('open');
            backdrop.classList.add('active');
            toggle.classList.add('open');
            document.body.style.overflow = 'hidden';
        }

        function closeSidebar() {
            sidebar.classList.remove('open');
            backdrop.classList.remove('active');
            toggle.classList.remove('open');
            document.body.style.overflow = '';
        }

        if (toggle)   toggle.addEventListener('click', () => sidebar.classList.contains('open') ? closeSidebar() : openSidebar());
        if (backdrop) backdrop.addEventListener('click', closeSidebar);

        // Close on nav link click (mobile)
        document.querySelectorAll('.nav-item').forEach(link => {
            link.addEventListener('click', () => {
                if (window.innerWidth < 768) closeSidebar();
            });
        });

        // Close on resize to desktop
        window.addEventListener('resize', () => {
            if (window.innerWidth >= 768) closeSidebar();
        });

        // Add data-label attributes to table cells for mobile card view
        function labelTableCells() {
            document.querySelectorAll('.data-table').forEach(table => {
                const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());
                table.querySelectorAll('tbody tr').forEach(row => {
                    row.querySelectorAll('td').forEach((td, i) => {
                        if (headers[i]) td.setAttribute('data-label', headers[i]);
                    });
                });
            });
        }

        // Run once and observe for dynamic rows
        labelTableCells();
        const tableObserver = new MutationObserver(labelTableCells);
        document.querySelectorAll('.data-table tbody').forEach(tbody => {
            tableObserver.observe(tbody, { childList: true });
        });
    });
})();
