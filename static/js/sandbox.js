/**
 * Smart Parking System — Sandbox Simulation Controller
 * Toggles the sandbox UI, manages fake plate generation, and entry/exit API triggers
 */
document.addEventListener('DOMContentLoaded', () => {
    const sandboxPanel = document.getElementById('sandbox-panel');
    const toggleBtn = document.getElementById('sandbox-toggle-btn');
    const closeBtn = document.getElementById('sandbox-close');
    
    const plateInput = document.getElementById('sb-plate');
    const genBtn = document.getElementById('sb-gen-btn');
    const stateSelect = document.getElementById('sb-state');
    const entryBtn = document.getElementById('sb-entry-btn');
    
    const occupiedSelect = document.getElementById('sb-occupied-spaces');
    const exitBtn = document.getElementById('sb-exit-btn');

    if (!sandboxPanel || !toggleBtn) return;

    // Toggle sandbox panel
    toggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        sandboxPanel.classList.toggle('open');
        if (sandboxPanel.classList.contains('open')) {
            refreshOccupiedSpaces();
        }
    });

    closeBtn.addEventListener('click', () => {
        sandboxPanel.classList.remove('open');
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
        if (!sandboxPanel.contains(e.target) && !toggleBtn.contains(e.target) && sandboxPanel.classList.contains('open')) {
            sandboxPanel.classList.remove('open');
        }
    });

    // Generate random Indian plate
    const states = ['MH', 'DL', 'KA', 'GJ', 'HR', 'UP', 'KA', 'MH'];
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    
    function generatePlate() {
        const state = states[Math.floor(Math.random() * states.length)];
        const dist = String(Math.floor(Math.random() * 98) + 1).padStart(2, '0');
        const l1 = letters[Math.floor(Math.random() * 26)];
        const l2 = letters[Math.floor(Math.random() * 26)];
        const num = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
        
        stateSelect.value = state;
        plateInput.value = `${state}${dist}${l1}${l2}${num}`;
    }

    genBtn.addEventListener('click', (e) => {
        e.preventDefault();
        generatePlate();
    });

    // Populate occupied spaces dropdown
    function refreshOccupiedSpaces() {
        fetch('/api/spaces')
            .then(r => r.json())
            .then(data => {
                const occupied = data.spaces.filter(s => s.is_occupied);
                if (!occupied.length) {
                    occupiedSelect.innerHTML = '<option value="">No occupied spaces</option>';
                    exitBtn.disabled = true;
                    return;
                }

                exitBtn.disabled = false;
                occupiedSelect.innerHTML = occupied.map(s => `
                    <option value="${s.space_id}">${s.space_id} (${s.plate_text})</option>
                `).join('');
            })
            .catch(() => {});
    }

    // Simulate entry
    entryBtn.addEventListener('click', () => {
        const plateText = plateInput.value.trim().toUpperCase();
        const state = stateSelect.value;

        if (!plateText) {
            alert('Please enter or generate a license plate number.');
            return;
        }

        entryBtn.disabled = true;
        entryBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Parking...';

        fetch('/api/sandbox/entry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plate_text: plateText, state: state })
        })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                plateInput.value = '';
                refreshOccupiedSpaces();
                
                // Dispatch custom event for real-time pages (2D grid, 3D visualizer)
                window.dispatchEvent(new CustomEvent('sandbox:entry', { detail: data }));
                
                // Show floating notification
                showToast(`Vehicle ${data.plate_text} parked in ${data.space_id}`, 'success');
            } else {
                showToast(data.error || 'Failed to simulate entry', 'error');
            }
        })
        .catch(() => showToast('Network error during entry simulation', 'error'))
        .finally(() => {
            entryBtn.disabled = false;
            entryBtn.innerHTML = 'Park Vehicle';
        });
    });

    // Simulate exit
    exitBtn.addEventListener('click', () => {
        const spaceId = occupiedSelect.value;
        if (!spaceId) return;

        exitBtn.disabled = true;
        exitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Unparking...';

        fetch('/api/sandbox/exit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ space_id: spaceId })
        })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                refreshOccupiedSpaces();
                
                // Dispatch custom event for real-time pages
                window.dispatchEvent(new CustomEvent('sandbox:exit', { detail: { space_id: spaceId } }));
                
                showToast(`Vehicle released from space ${spaceId}`, 'success');
            } else {
                showToast(data.error || 'Failed to simulate exit', 'error');
            }
        })
        .catch(() => showToast('Network error during exit simulation', 'error'))
        .finally(() => {
            exitBtn.disabled = false;
            exitBtn.innerHTML = 'Unpark Vehicle';
        });
    });

    // Helper: Show notification toast
    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.style.position = 'fixed';
        toast.style.bottom = '20px';
        toast.style.left = '20px';
        toast.style.padding = '12px 18px';
        toast.style.borderRadius = '8px';
        toast.style.background = type === 'success' ? '#00c853' : '#ff5252';
        toast.style.color = type === 'success' ? '#000' : '#fff';
        toast.style.fontSize = '0.85rem';
        toast.style.fontWeight = '700';
        toast.style.boxShadow = '0 4px 16px rgba(0,0,0,0.3)';
        toast.style.zIndex = '9999';
        toast.style.transform = 'translateY(100px)';
        toast.style.transition = 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        toast.textContent = message;

        document.body.appendChild(toast);
        
        // Slide in
        setTimeout(() => toast.style.transform = 'translateY(0)', 50);
        
        // Fade out & delete
        setTimeout(() => {
            toast.style.transform = 'translateY(100px)';
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
});
