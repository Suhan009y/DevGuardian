// ===== AI ASSISTANT WIDGET =====

let chatHistory  = [];
let isSending    = false;
let retryTimeout = null;

// ── Send message ──────────────────────────────────────────────
async function sendMessage() {
  if (isSending) return;

  const input = document.getElementById('chat-input');
  const text  = input.value.trim();
  if (!text) return;

  input.value = '';
  appendMessage('user', text);
  chatHistory.push({ role: 'user', content: text });

  setSendingState(true);
  const typingId = showTyping();

  try {
    const token = localStorage.getItem('token');
    const res   = await fetch('/api/assistant', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ message: text, history: chatHistory.slice(-10) })
    });

    removeTyping(typingId);
    const data = await res.json();

    // Rate limited — show countdown and auto retry
    if (res.status === 429) {
      const waitSec = data.retryAfter || 10;
      chatHistory.pop(); // remove last user message so retry works
      showRateLimitCountdown(waitSec, text);
      return;
    }

    if (!res.ok) {
      appendMessage('assistant', `⚠️ ${data.message || 'Something went wrong. Please try again.'}`);
      chatHistory.pop();
      return;
    }

    const reply = data.reply || 'Sorry, I could not process that.';
    chatHistory.push({ role: 'assistant', content: reply });
    appendMessage('assistant', reply);

  } catch (err) {
    removeTyping(typingId);
    appendMessage('assistant', 'Network error — make sure the server is running.');
    chatHistory.pop();
  } finally {
    setSendingState(false);
  }
}

// ── Rate limit countdown with auto-retry ──────────────────────
function showRateLimitCountdown(seconds, originalMessage) {
  if (retryTimeout) clearInterval(retryTimeout);

  const container = document.getElementById('chat-messages');
  const id        = 'countdown-' + Date.now();

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble assistant';
  bubble.id        = id;
  bubble.innerHTML = `
    <div class="bubble-avatar assistant-avatar">NE</div>
    <div class="bubble-body">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
        <span class="inline-spinner" aria-hidden="true"></span>
        <span>Rate limit hit — retrying in <strong id="cd-num-${id}">${seconds}</strong>s automatically...</span>
      </div>
      <div style="height:4px;background:var(--surface-3);border-radius:99px;overflow:hidden;">
        <div id="cd-bar-${id}" style="height:100%;width:100%;background:linear-gradient(90deg,var(--accent),var(--accent-blue));border-radius:99px;transition:width 1s linear;"></div>
      </div>
    </div>
  `;
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;

  let remaining = seconds;

  retryTimeout = setInterval(async () => {
    remaining--;
    const numEl = document.getElementById(`cd-num-${id}`);
    const barEl = document.getElementById(`cd-bar-${id}`);
    if (numEl) numEl.textContent = remaining;
    if (barEl) barEl.style.width = `${(remaining / seconds) * 100}%`;

    if (remaining <= 0) {
      clearInterval(retryTimeout);
      retryTimeout = null;
      const el = document.getElementById(id);
      if (el) el.remove();
      // Auto re-send original message
      document.getElementById('chat-input').value = originalMessage;
      await sendMessage();
    }
  }, 1000);
}

// ── Set sending state ──────────────────────────────────────────
function setSendingState(sending) {
  isSending = sending;
  const btn   = document.getElementById('chat-send-btn');
  const input = document.getElementById('chat-input');
  btn.disabled    = sending;
  input.disabled  = sending;
  btn.style.opacity = sending ? '0.5' : '1';
}

// ── Append a message bubble ────────────────────────────────────
function appendMessage(role, content) {
  const container = document.getElementById('chat-messages');

  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${role}`;

  const avatar       = document.createElement('div');
  avatar.className   = 'bubble-avatar';
  avatar.textContent = role === 'user' ? 'You' : 'NE';
  avatar.classList.add(role === 'user' ? 'user-avatar' : 'assistant-avatar');

  const body       = document.createElement('div');
  body.className   = 'bubble-body';
  body.innerHTML   = renderMarkdown(content);

  // Attach "Copy to Terminal" button to every ffmpeg code block
  body.querySelectorAll('pre').forEach(pre => {
    const code = pre.querySelector('code');
    if (!code) return;
    const cmdText = code.textContent.trim();

    // Show Copy to Terminal if it looks like an ffmpeg argument string
    if (cmdText.startsWith('-') || cmdText.includes('{input}') || cmdText.includes('{output}')) {
      const btn     = document.createElement('button');
      btn.className = 'copy-cmd-btn';
      btn.innerHTML = 'Copy to terminal';
      btn.onclick   = () => {
        // Strip leading "ffmpeg" if AI added it
        const args = cmdText.replace(/^ffmpeg\s+/, '').trim();
        document.getElementById('terminal-input').value = args;
        if (window.logTerminal) {
          window.logTerminal('[assistant] Command pasted — click Run Command to execute.', 'success');
        }
        btn.innerHTML = '✓ Copied!';
        setTimeout(() => { btn.innerHTML = 'Copy to terminal'; }, 2000);
      };
      pre.parentNode.insertBefore(btn, pre.nextSibling);
    }
  });

  bubble.appendChild(avatar);
  bubble.appendChild(body);
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
}

// ── Typing indicator ──────────────────────────────────────────
function showTyping() {
  const container  = document.getElementById('chat-messages');
  const id         = 'typing-' + Date.now();
  const bubble     = document.createElement('div');
  bubble.className = 'chat-bubble assistant';
  bubble.id        = id;
  bubble.innerHTML = `
    <div class="bubble-avatar assistant-avatar">NE</div>
    <div class="bubble-body">
      <div class="typing-indicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>
  `;
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
  return id;
}

function removeTyping(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// ── Markdown renderer ─────────────────────────────────────────
function renderMarkdown(text) {
  // Fenced code blocks
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
    `<pre><code class="language-${lang || 'text'}">${escapeHtml(code.trim())}</code></pre>`
  );

  // Inline code
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Unordered lists
  text = text.replace(/^[-*•] (.+)/gm, '<li>$1</li>');
  text = text.replace(/(<li>[\s\S]*?<\/li>\n?)+/g, '<ul>$&</ul>');

  // Numbered lists
  text = text.replace(/^\d+\. (.+)/gm, '<li>$1</li>');

  // Paragraphs
  text = text.split(/\n\n+/).map(p => {
    p = p.trim();
    if (!p || p.startsWith('<')) return p;
    return `<p>${p.replace(/\n/g, '<br>')}</p>`;
  }).join('');

  return text;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Enter to send, Shift+Enter for newline ────────────────────
function handleChatKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

window.sendMessage   = sendMessage;
window.handleChatKey = handleChatKey;