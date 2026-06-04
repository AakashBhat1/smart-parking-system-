/**
 * Smart Parking System — Admin Dashboard JS
 * Session info, zone bars, activity log, uptime timer
 */
document.addEventListener('DOMContentLoaded', () => {
    let uptimeSeconds = 0;

    function updateSession() {
        fetch('/api/session')
            .then(r => r.json())
            .then(data => {
                document.getElementById('session-start').textContent = data.start_time || '--';
                document.getElementById('session-uptime').textContent = data.uptime_display || '--';
                document.getElementById('session-plates').textContent = data.plates_detected ?? '--';
                document.getElementById('session-spaces').textContent = data.spaces_used ?? '--';
                document.getElementById('stat-session-plates').textContent = data.plates_detected ?? '--';
                uptimeSeconds = data.uptime_seconds || 0;
            })
            .catch(() => {});
    }

    function updateStats() {
        fetch('/api/stats')
            .then(r => r.json())
            .then(data => {
                document.getElementById('admin-stat-free').textContent = data.free;
                document.getElementById('admin-stat-occupied').textContent = data.occupied;
                document.getElementById('admin-stat-rate').innerHTML = data.occupancy_pct + '<small>%</small>';
            })
            .catch(() => {});
    }

    function updateZoneBars() {
        fetch('/api/spaces')
            .then(r => r.json())
            .then(data => {
                const container = document.getElementById('zone-bars');
                if (!data.spaces || !data.spaces.length) return;

                // Group by zone
                const zones = {};
                data.spaces.forEach(s => {
                    if (!zones[s.zone]) zones[s.zone] = { total: 0, occupied: 0 };
                    zones[s.zone].total++;
                    if (s.is_occupied) zones[s.zone].occupied++;
                });

                let html = '';
                for (const [zone, info] of Object.entries(zones)) {
                    const pct = info.total > 0 ? Math.round(info.occupied / info.total * 100) : 0;
                    html += `
                        <div class="zone-bar-row">
                            <span class="zone-bar-label">Zone ${zone}</span>
                            <div class="zone-bar-track">
                                <div class="zone-bar-fill" style="width: ${pct}%"></div>
                            </div>
                            <span class="zone-bar-value">${info.occupied}/${info.total}</span>
                        </div>
                    `;
                }
                container.innerHTML = html;
            })
            .catch(() => {});
    }

    function updateActivity() {
        fetch('/api/activity?limit=30')
            .then(r => r.json())
            .then(events => {
                const tbody = document.getElementById('activity-tbody');
                const countEl = document.getElementById('log-count');
                if (countEl) countEl.textContent = events.length + ' events';

                if (!events.length) {
                    tbody.innerHTML = '<tr><td colspan="5" class="center">No activity recorded</td></tr>';
                    return;
                }

                tbody.innerHTML = events.map(e => `
                    <tr>
                        <td>${e.timestamp}</td>
                        <td><span class="event-badge ${e.event_type}">${e.event_type.replace('_', ' ')}</span></td>
                        <td>${e.description}</td>
                        <td>${e.plate_text || '--'}</td>
                        <td>${e.space_id || '--'}</td>
                    </tr>
                `).join('');
            })
            .catch(() => {});
    }

    // Uptime timer
    function updateUptime() {
        uptimeSeconds++;
        const h = Math.floor(uptimeSeconds / 3600);
        const m = Math.floor((uptimeSeconds % 3600) / 60);
        const s = uptimeSeconds % 60;
        const display = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        const el = document.getElementById('uptime-display');
        if (el) el.textContent = display;
    }

    // Initial load
    updateSession();
    updateStats();
    updateZoneBars();
    updateActivity();

    // Refresh intervals
    setInterval(updateUptime, 1000);
    setInterval(updateSession, 10000);
    setInterval(updateStats, 5000);
    setInterval(updateZoneBars, 5000);
    setInterval(updateActivity, 4000);
});
