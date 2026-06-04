/**
 * Smart Parking System — Parking Page JS
 * Interactive parking grid with real-time updates
 */
document.addEventListener('DOMContentLoaded', () => {
    const grid = document.getElementById('parking-grid');
    if (!grid) return;

    function updateParkingGrid() {
        fetch('/api/spaces')
            .then(r => r.json())
            .then(data => {
                // Update stats
                const freeEl = document.getElementById('stat-free');
                const occEl = document.getElementById('stat-occupied');
                const totalEl = document.getElementById('stat-total');
                const rateEl = document.getElementById('stat-rate');

                if (freeEl) animateValue(freeEl, data.free);
                if (occEl) animateValue(occEl, data.occupied);
                if (totalEl) animateValue(totalEl, data.total);
                if (rateEl) rateEl.innerHTML = data.occupancy_pct + '<small>%</small>';

                // Build grid
                if (!data.spaces || !data.spaces.length) {
                    grid.innerHTML = '<div class="activity-empty"><i class="fas fa-parking"></i><p>No spaces configured</p></div>';
                    return;
                }

                // Group by zone
                const zones = {};
                data.spaces.forEach(s => {
                    if (!zones[s.zone]) zones[s.zone] = [];
                    zones[s.zone].push(s);
                });

                let html = '';
                for (const [zone, spaces] of Object.entries(zones)) {
                    html += `<div class="zone-header">Zone ${zone}</div>`;
                    spaces.forEach(s => {
                        const cls = s.is_occupied ? 'occupied' : 'free';
                        const status = s.is_occupied ? 'Occupied' : 'Free';
                        const plate = s.plate_text ? `<span class="space-plate">${s.plate_text}</span>` : '';
                        const releaseBtn = s.is_occupied
                            ? `<button class="space-release" onclick="releaseSpace('${s.space_id}')" title="Release space"><i class="fas fa-xmark"></i></button>`
                            : '';

                        html += `
                            <div class="space-cell ${cls}" data-space="${s.space_id}">
                                ${releaseBtn}
                                <span class="space-id">${s.space_id}</span>
                                <span class="space-status">${status}</span>
                                ${plate}
                            </div>
                        `;
                    });
                }

                grid.innerHTML = html;
            })
            .catch(() => {});
    }

    updateParkingGrid();
    setInterval(updateParkingGrid, 3000);
});

// Add zone header styles dynamically
const zoneStyle = document.createElement('style');
zoneStyle.textContent = `
.zone-header {
    grid-column: 1 / -1;
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--text-3);
    text-transform: uppercase;
    letter-spacing: 1px;
    padding: 8px 0 4px;
    border-bottom: 1px solid var(--border);
    margin-top: 4px;
}
.zone-header:first-child { margin-top: 0; }
`;
document.head.appendChild(zoneStyle);

function releaseSpace(spaceId) {
    if (!confirm(`Release space ${spaceId}?`)) return;

    fetch(`/api/spaces/${spaceId}/release`, { method: 'POST' })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                const cell = document.querySelector(`[data-space="${spaceId}"]`);
                if (cell) {
                    cell.classList.remove('occupied');
                    cell.classList.add('free');
                    cell.style.animation = 'slide-up 0.3s ease-out';
                }
            }
        })
        .catch(() => alert('Failed to release space'));
}
