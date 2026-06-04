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

    function updateAnalytics() {
        fetch('/api/analytics')
            .then(r => r.json())
            .then(data => {
                // 1. Render Heatmap SVG
                const heatmapContainer = document.getElementById('heatmap-svg-container');
                if (heatmapContainer) {
                    const heatmap = data.heatmap || {};
                    const spaceIds = Object.keys(heatmap).sort();
                    
                    if (!spaceIds.length) {
                        heatmapContainer.innerHTML = '<div class="activity-empty"><p>No usage data yet</p></div>';
                    } else {
                        const maxVal = Math.max(...Object.values(heatmap), 1);
                        
                        // Group by Zone
                        const zones = {'A': [], 'B': [], 'C': []};
                        spaceIds.forEach(id => {
                            const num = parseInt(id.replace('S-', ''));
                            if (num <= 8) zones['A'].push(id);
                            else if (num <= 16) zones['B'].push(id);
                            else zones['C'].push(id);
                        });

                        let svgHtml = `<svg viewBox="0 0 500 200" width="100%" height="100%">`;
                        svgHtml += `
                            <defs>
                                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                                    <feGaussianBlur stdDeviation="3" result="blur" />
                                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                                </filter>
                            </defs>
                        `;

                        const rowHeight = 60;
                        const colWidth = 55;
                        const startX = 40;
                        const startY = 20;
                        
                        let rowIndex = 0;
                        for (const [zone, ids] of Object.entries(zones)) {
                            // Draw zone label
                            svgHtml += `<text x="10" y="${startY + rowIndex * rowHeight + 18}" fill="var(--text-3)" font-size="10" font-weight="700">${zone}</text>`;
                            
                            ids.forEach((id, colIndex) => {
                                const count = heatmap[id] || 0;
                                const ratio = count / maxVal;
                                
                                // Color interpolation
                                // Cold: #00b0ff (0, 176, 255)
                                // Hot: #ff5252 (255, 82, 82)
                                const r = Math.round(0 * (1 - ratio) + 255 * ratio);
                                const g = Math.round(176 * (1 - ratio) + 82 * ratio);
                                const b = Math.round(255 * (1 - ratio) + 82 * ratio);
                                const fillColor = `rgba(${r}, ${g}, ${b}, ${0.15 + ratio * 0.7})`;
                                const strokeColor = `rgb(${r}, ${g}, ${b})`;
                                
                                const x = startX + colIndex * colWidth;
                                const y = startY + rowIndex * rowHeight;
                                
                                svgHtml += `
                                    <g>
                                        <rect x="${x}" y="${y}" width="48" height="30" rx="4" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.5" style="transition: all 0.5s ease; filter: drop-shadow(0 0 2px ${strokeColor}44);"/>
                                        <text x="${x + 24}" y="${y + 14}" fill="#fff" font-size="9" font-weight="700" text-anchor="middle" alignment-baseline="middle">${id}</text>
                                        <text x="${x + 24}" y="${y + 24}" fill="rgba(255,255,255,0.6)" font-size="7" font-weight="500" text-anchor="middle">${count}x</text>
                                        <title>Space ${id}: Used ${count} times</title>
                                    </g>
                                `;
                            });
                            rowIndex++;
                        }
                        
                        svgHtml += `</svg>`;
                        heatmapContainer.innerHTML = svgHtml;
                    }
                }

                // 2. Render Forecast Chart SVG
                const forecastContainer = document.getElementById('forecast-svg-container');
                if (forecastContainer) {
                    const predictions = data.predictions || [];
                    const actualToday = data.actual_today || [];
                    const currentHour = data.current_hour ?? 0;
                    
                    const width = 500;
                    const height = 240;
                    const paddingLeft = 30;
                    const paddingRight = 15;
                    const paddingTop = 20;
                    const paddingBottom = 30;
                    
                    const graphWidth = width - paddingLeft - paddingRight;
                    const graphHeight = height - paddingTop - paddingBottom;
                    const totalSpaces = 24;

                    let svgHtml = `<svg viewBox="0 0 ${width} ${height}" width="100%" height="100%">`;
                    
                    // Gradients
                    svgHtml += `
                        <defs>
                            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.25"/>
                                <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.00"/>
                            </linearGradient>
                            <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stop-color="#00b0ff"/>
                                <stop offset="100%" stop-color="var(--accent)"/>
                            </linearGradient>
                        </defs>
                    `;

                    // Horizontal Grid Lines & Y labels
                    const gridSteps = 4;
                    for (let i = 0; i <= gridSteps; i++) {
                        const val = Math.round((totalSpaces / gridSteps) * i);
                        const y = height - paddingBottom - (val / totalSpaces) * graphHeight;
                        
                        svgHtml += `
                            <line x1="${paddingLeft}" y1="${y}" x2="${width - paddingRight}" y2="${y}" stroke="rgba(255,255,255,0.05)" stroke-dasharray="3,3" />
                            <text x="${paddingLeft - 8}" y="${y + 3}" fill="var(--text-3)" font-size="8" text-anchor="end">${val}</text>
                        `;
                    }

                    // Vertical Grid Lines & X labels
                    const xSteps = 6;
                    for (let i = 0; i <= xSteps; i++) {
                        const hr = i * 4;
                        const x = paddingLeft + (hr / 23) * graphWidth;
                        const hrDisplay = String(hr).padStart(2, '0') + ':00';
                        
                        svgHtml += `
                            <line x1="${x}" y1="${paddingTop}" x2="${x}" y2="${height - paddingBottom}" stroke="rgba(255,255,255,0.03)" />
                            <text x="${x}" y="${height - paddingBottom + 16}" fill="var(--text-3)" font-size="8" text-anchor="middle">${hrDisplay}</text>
                        `;
                    }

                    // Build Prediction Path
                    let predPath = '';
                    let areaPath = `M ${paddingLeft} ${height - paddingBottom} `;
                    
                    predictions.forEach((val, hr) => {
                        const x = paddingLeft + (hr / 23) * graphWidth;
                        const y = height - paddingBottom - (val / totalSpaces) * graphHeight;
                        const cmd = hr === 0 ? 'M' : 'L';
                        predPath += `${cmd} ${x} ${y} `;
                        areaPath += `L ${x} ${y} `;
                    });
                    areaPath += `L ${paddingLeft + graphWidth} ${height - paddingBottom} Z`;

                    // Render Shaded Area and Prediction Line
                    svgHtml += `<path d="${areaPath}" fill="url(#areaGrad)" />`;
                    svgHtml += `<path d="${predPath}" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="4,2" opacity="0.6" />`;

                    // Build Actual Line Path
                    let actualPath = '';
                    let pointsHtml = '';
                    
                    actualToday.forEach((val, hr) => {
                        if (val === null || hr > currentHour) return;
                        
                        const x = paddingLeft + (hr / 23) * graphWidth;
                        const y = height - paddingBottom - (val / totalSpaces) * graphHeight;
                        const cmd = hr === 0 ? 'M' : 'L';
                        actualPath += `${cmd} ${x} ${y} `;
                        
                        pointsHtml += `
                            <circle cx="${x}" cy="${y}" r="3.5" fill="#00b0ff" stroke="#0a0a0a" stroke-width="1">
                                <title>Today ${String(hr).padStart(2,'0')}:00 - Occupied: ${val}</title>
                            </circle>
                        `;
                    });

                    if (actualPath) {
                        svgHtml += `<path d="${actualPath}" fill="none" stroke="url(#lineGrad)" stroke-width="2.5" />`;
                        svgHtml += pointsHtml;
                    }
                    
                    svgHtml += `</svg>`;
                    forecastContainer.innerHTML = svgHtml;
                }
            })
            .catch(() => {});
    }

    // Initial load
    updateSession();
    updateStats();
    updateZoneBars();
    updateActivity();
    updateAnalytics();

    // Refresh intervals
    setInterval(updateUptime, 1000);
    setInterval(updateSession, 10000);
    setInterval(updateStats, 5000);
    setInterval(updateZoneBars, 5000);
    setInterval(updateActivity, 4000);
    setInterval(updateAnalytics, 10000);
});
