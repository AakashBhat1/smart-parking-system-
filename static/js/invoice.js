/**
 * Smart Parking System — Invoice Billing Controller
 * Populates receipt modal inputs and animates tactile stamps on departures
 */
(function() {
    const wrapper = document.getElementById('invoice-modal-wrapper');
    const modal = document.getElementById('invoice-modal');
    const closeBtn = document.getElementById('invoice-close');
    const okBtn = document.getElementById('invoice-ok-btn');
    const stamp = document.getElementById('invoice-stamp');

    const invPlate = document.getElementById('inv-plate');
    const invDuration = document.getElementById('inv-duration');
    const invAmount = document.getElementById('inv-amount');
    const invNumber = document.getElementById('inv-number');
    const invDate = document.getElementById('inv-date');

    if (!wrapper || !modal) return;

    function showInvoice(data) {
        // Skip invoices for spaces released with no associated plate/amount details
        if (!data || !data.plate_text) return;

        // Populate fields
        const plate = data.plate_text;
        const duration = data.duration_minutes !== undefined ? data.duration_minutes : 0;
        const amount = data.amount_paid !== undefined ? data.amount_paid : 0.0;
        
        invPlate.innerText = plate;
        invDuration.innerText = duration >= 60 
            ? `${Math.floor(duration/60)} Hrs ${duration%60} Mins` 
            : `${duration} Minutes`;
        invAmount.innerText = `${amount.toFixed(2)} INR`;
        
        // Random Invoice bar pattern details
        invNumber.innerText = `INV-${Math.floor(100000 + Math.random() * 900000)}`;
        
        const now = new Date();
        invDate.innerText = now.getFullYear() + '-' + 
            String(now.getMonth() + 1).padStart(2, '0') + '-' + 
            String(now.getDate()).padStart(2, '0') + ' ' + 
            String(now.getHours()).padStart(2, '0') + ':' + 
            String(now.getMinutes()).padStart(2, '0') + ':' + 
            String(now.getSeconds()).padStart(2, '0');

        // Render modal
        wrapper.style.opacity = '1';
        wrapper.style.pointerEvents = 'auto';
        modal.style.transform = 'scale(1)';

        // Drop down stamp impact overlay
        stamp.style.opacity = '0';
        stamp.style.transform = 'translate(-50%, -50%) rotate(-20deg) scale(3.5)';
        
        setTimeout(() => {
            stamp.style.opacity = '1';
            stamp.style.transform = 'translate(-50%, -50%) rotate(-20deg) scale(1)';
        }, 350);
    }

    function hideInvoice() {
        wrapper.style.opacity = '0';
        wrapper.style.pointerEvents = 'none';
        modal.style.transform = 'scale(0.85)';
        stamp.style.opacity = '0';
    }

    closeBtn.addEventListener('click', hideInvoice);
    okBtn.addEventListener('click', hideInvoice);
    
    wrapper.addEventListener('click', (e) => {
        if (e.target === wrapper) hideInvoice();
    });

    // Listen for sandbox:exit events to trigger departures
    window.addEventListener('sandbox:exit', (e) => {
        showInvoice(e.detail);
    });

    window.showInvoiceModal = showInvoice;
})();
