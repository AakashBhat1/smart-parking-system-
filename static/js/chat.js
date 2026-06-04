/**
 * Smart Parking System — AI Chat Widget JS
 * SSE streaming, mode toggle, message rendering
 */
document.addEventListener('DOMContentLoaded', () => {
    const fab = document.getElementById('chat-fab');
    const panel = document.getElementById('chat-panel');
    const closeBtn = document.getElementById('chat-close');
    const form = document.getElementById('chat-form');
    const input = document.getElementById('chat-input');
    const messages = document.getElementById('chat-messages');
    const typing = document.getElementById('chat-typing');
    const modeToggle = document.getElementById('chat-mode-toggle');

    let chatMode = 'user';
    let chatHistory = [];

    // Toggle panel
    fab.addEventListener('click', () => {
        panel.classList.toggle('open');
        if (panel.classList.contains('open')) {
            input.focus();
            fab.style.display = 'none';
        }
    });

    closeBtn.addEventListener('click', () => {
        panel.classList.remove('open');
        fab.style.display = 'flex';
    });

    // Mode toggle
    modeToggle.addEventListener('click', (e) => {
        const btn = e.target.closest('.mode-btn');
        if (!btn) return;
        chatMode = btn.dataset.mode;
        modeToggle.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Add mode change notice
        const notice = document.createElement('div');
        notice.className = 'chat-bubble bot';
        notice.innerHTML = `<div class="chat-bubble-content"><p>Switched to <strong>${chatMode === 'admin' ? 'Admin' : 'User'}</strong> mode. ${chatMode === 'admin' ? 'Ask me for session reports and analytics.' : 'Ask me about parking availability.'}</p></div>`;
        messages.appendChild(notice);
        messages.scrollTop = messages.scrollHeight;
        chatHistory = []; // Reset history on mode change
    });

    // Send message
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;

        // Add user bubble
        addBubble(text, 'user');
        chatHistory.push({ role: 'user', content: text });
        input.value = '';

        // Show typing
        typing.style.display = 'flex';
        messages.scrollTop = messages.scrollHeight;

        // Stream response
        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text,
                    mode: chatMode,
                    history: chatHistory.slice(-10)
                })
            });

            if (!response.ok) throw new Error('Chat request failed');

            typing.style.display = 'none';

            // Create bot bubble for streaming
            const bubble = document.createElement('div');
            bubble.className = 'chat-bubble bot';
            const content = document.createElement('div');
            content.className = 'chat-bubble-content';
            const p = document.createElement('p');
            content.appendChild(p);
            bubble.appendChild(content);
            messages.appendChild(bubble);

            let fullResponse = '';

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Keep incomplete line

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            if (data.content) {
                                fullResponse += data.content;
                                p.textContent = fullResponse;
                                messages.scrollTop = messages.scrollHeight;
                            }
                            if (data.done) break;
                        } catch (e) {}
                    }
                }
            }

            chatHistory.push({ role: 'assistant', content: fullResponse });

        } catch (err) {
            typing.style.display = 'none';
            addBubble('⚠️ Failed to get a response. Make sure Ollama is running.', 'bot');
        }
    });

    function addBubble(text, role) {
        const bubble = document.createElement('div');
        bubble.className = `chat-bubble ${role}`;
        bubble.innerHTML = `<div class="chat-bubble-content"><p>${escapeHtml(text)}</p></div>`;
        messages.appendChild(bubble);
        messages.scrollTop = messages.scrollHeight;
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
});
