/**
 * Smart Parking System — LED Marquee signboard Controller
 * Manages scrolling status updates, VIP welcome greeting, and Blacklist warnings
 */
(function() {
    const ledText = document.getElementById('led-text');
    if (!ledText) return;

    let defaultMsg = "INITIALIZING SMART PARKING SYSTEMS... SCANNING FOR VEHICLES";
    let alertTimeout = null;
    let flashInterval = null;

    // Web Audio Synthesizer Alarm Siren
    let audioCtx = null;
    function playSiren() {
        try {
            if (!audioCtx) {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
            
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(850, audioCtx.currentTime);
            osc.frequency.linearRampToValueAtTime(350, audioCtx.currentTime + 0.45);
            
            gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
            gain.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 0.45);
            
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            
            osc.start();
            osc.stop(audioCtx.currentTime + 0.45);
        } catch (e) {
            console.error("Audio Context playback failed", e);
        }
    }

    function updateLEDText(text, color = '#ff9900', flash = false) {
        if (alertTimeout) {
            clearTimeout(alertTimeout);
            alertTimeout = null;
        }
        if (flashInterval) {
            clearInterval(flashInterval);
            flashInterval = null;
        }

        ledText.innerText = text.toUpperCase();
        ledText.style.color = color;
        ledText.style.textShadow = `0 0 5px ${color}, 0 0 10px ${color}`;

        if (flash) {
            ledText.classList.remove('led-scrolling');
            ledText.style.animation = 'none';
            
            let visible = true;
            flashInterval = setInterval(() => {
                visible = !visible;
                ledText.style.opacity = visible ? '1' : '0.15';
            }, 300);

            // After 6 seconds, restore default scrolling message
            alertTimeout = setTimeout(() => {
                if (flashInterval) {
                    clearInterval(flashInterval);
                    flashInterval = null;
                }
                ledText.style.opacity = '1';
                ledText.classList.add('led-scrolling');
                ledText.style.animation = '';
                fetchStatusAndScroll();
            }, 6000);
        } else {
            ledText.classList.add('led-scrolling');
            ledText.style.animation = '';
            ledText.style.opacity = '1';
        }
    }

    function fetchStatusAndScroll() {
        if (alertTimeout) return; // Don't interrupt active warnings
        
        fetch('/api/spaces')
            .then(r => r.json())
            .then(data => {
                if (alertTimeout) return;
                
                let gOcc = 0, gTotal = 0;
                let f1Occ = 0, f1Total = 0;
                let f2Occ = 0, f2Total = 0;

                data.spaces.forEach(s => {
                    const floor = s.floor;
                    if (floor === 'G') { gTotal++; if (s.is_occupied) gOcc++; }
                    else if (floor === '1') { f1Total++; if (s.is_occupied) f1Occ++; }
                    else if (floor === '2') { f2Total++; if (s.is_occupied) f2Occ++; }
                });

                const gFree = gTotal - gOcc;
                const f1Free = f1Total - f1Occ;
                const f2Free = f2Total - f2Occ;
                const totalFree = gFree + f1Free + f2Free;

                defaultMsg = `GROUND: ${gFree} FREE / ${gTotal} TOTAL | FLOOR 1: ${f1Free} FREE / ${f1Total} TOTAL | FLOOR 2: ${f2Free} FREE / ${f2Total} TOTAL — PLEASE FOLLOW DRIVEWAY INDICATORS`;
                
                let ledColor = '#00ff66'; // Glowing green
                if (totalFree === 0) {
                    ledColor = '#ff3333'; // Deep warning red
                    defaultMsg = "LOT FULL — SYSTEM SHUTTING DOWN GATE ACCESS";
                } else if (totalFree < 6) {
                    ledColor = '#ffb300'; // Amber alert
                }
                
                updateLEDText(defaultMsg, ledColor, false);
            })
            .catch(() => {});
    }

    // Initial load
    fetchStatusAndScroll();
    setInterval(fetchStatusAndScroll, 8000);

    // Entry alert triggers
    window.addEventListener('sandbox:entry', (e) => {
        const detail = e.detail;
        const plate = detail.plate_text;
        const profile = detail.profile_type;
        
        if (profile === 'blacklist') {
            updateLEDText(`🚨 WARNING: SECURITY ALERT! BLACKLISTED VEHICLE ${plate} DETECTED! INITIATING LOCKDOWN 🚨`, '#ff3333', true);
            
            // Trigger visual flash
            const overlay = document.getElementById('blacklist-overlay');
            if (overlay) {
                overlay.classList.add('blacklist-active');
                setTimeout(() => overlay.classList.remove('blacklist-active'), 5000);
            }
            
            // Play sound sirening
            let count = 0;
            const alarmTimer = setInterval(() => {
                playSiren();
                count++;
                if (count >= 10) clearInterval(alarmTimer);
            }, 550);
        } else if (profile === 'vip') {
            updateLEDText(`⭐ VIP WELCOME: ${plate} APPROVED — PROCEED TO RESERVED GROUND SPOT ⭐`, '#00d2ff', true);
        } else {
            updateLEDText(`APPROVED: ${plate} — GATE LIFTED — HAVE A NICE DAY`, '#00ff66', true);
        }
    });

    // Exit alert triggers
    window.addEventListener('sandbox:exit', (e) => {
        const detail = e.detail;
        const plate = detail.plate_text || 'VEHICLE';
        updateLEDText(`VEHICLE DEPARTED: ${plate} — INVOICE GENERATED — THANK YOU`, '#ff9900', true);
    });

    window.triggerLEDAlert = updateLEDText;
})();
