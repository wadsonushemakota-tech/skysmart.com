(function () {
    const $ = (id) => document.getElementById(id);

    const chatMessages = $('chat-messages');
    const chatMessageInput = $('chat-message-input');
    const chatUserName = $('chat-user-name');
    const chatSendBtn = $('chat-send-btn');
    const chatImageInput = $('chat-image-input');
    const imagePreviewContainer = $('image-preview-container');
    const imagePreview = $('image-preview');
    const removeImageBtn = $('remove-image-btn');
    const emojiBtn = $('emoji-btn');
    const emojiPicker = $('emoji-picker');
    const micBtn = $('mic-btn');
    const replyPreview = $('reply-preview');
    const cancelReplyBtn = $('cancel-reply-btn');
    const voicePreviewContainer = $('voice-preview-container');
    const voiceTimer = $('voice-timer');
    const stopVoiceBtn = $('stop-voice-btn');
    const cancelVoiceBtn = $('cancel-voice-btn');
    const statusEl = $('chat-online-count');
    const jumpBtn = $('chat-jump-btn');
    const jumpCount = $('chat-jump-count');

    if (!chatMessages || !chatMessageInput || !chatSendBtn || typeof io === 'undefined') return;

    const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
    const MAX_VOICE_MS = 5 * 60 * 1000;
    const EMOJIS = ['😊', '😂', '🤣', '😍', '😎', '🥰', '😅', '😢', '😮', '🤔', '🙌', '👏', '👍', '🙏', '💯', '🔥',
        '✨', '🎉', '❤️', '💬', '👟', '👕', '👞', '👢'];

    function storageGet(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }
    function storageSet(key, value) {
        try { localStorage.setItem(key, value); } catch (e) { /* private mode */ }
    }

    // A stable id per browser so "my messages" survive name changes and reloads
    let clientId = storageGet('skySmartChatClientId');
    if (!clientId || !/^[\w-]{8,64}$/.test(clientId)) {
        clientId = window.crypto && crypto.randomUUID
            ? crypto.randomUUID()
            : 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
        storageSet('skySmartChatClientId', clientId);
    }

    const origin = window.skySmartApiOrigin || '';
    const socketOpts = { path: '/socket.io', transports: ['websocket', 'polling'], auth: { clientId } };
    const socket = origin ? io(origin, socketOpts) : io(socketOpts);
    window.socket = socket;

    let myTag = null;
    let reactionChoices = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
    let online = 0;
    let unread = 0;
    let lastSeenSent = 0;
    let chatVisible = false;
    let selectedImage = null;
    let currentReplyTo = null;
    const messages = new Map(); // id -> message
    const pending = new Map(); // client_key -> { payload, msg, el, file, blob, status }
    const typingUsers = new Map(); // socket id -> { user, timer }
    const baseTitle = document.title;

    // ---------- helpers ----------

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatText(text) {
        return escapeHtml(text)
            .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
            .replace(/\n/g, '<br>');
    }

    function assetUrl(url) {
        return typeof window.skySmartAssetUrl === 'function' ? window.skySmartAssetUrl(url) : url;
    }

    function apiUrl(p) {
        return typeof window.skySmartApiUrl === 'function' ? window.skySmartApiUrl(p) : p;
    }

    function displayName() {
        return (chatUserName ? chatUserName.value.trim() : '') || 'Anonymous';
    }

    function isMine(msg) {
        if (msg._key) return true;
        if (msg.sender && myTag) return msg.sender === myTag;
        // Messages saved before sender ids existed: fall back to the display name
        return !msg.sender && msg.user === displayName();
    }

    function dayKey(ts) {
        const d = new Date(ts);
        return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
    }

    function dayLabel(ts) {
        const d = new Date(ts);
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);
        if (dayKey(d) === dayKey(today)) return 'Today';
        if (dayKey(d) === dayKey(yesterday)) return 'Yesterday';
        return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    }

    function previewText(msg) {
        if (msg.deleted) return 'This message was deleted';
        if (msg.text) return msg.text;
        if (msg.media_type === 'image') return '📷 Photo';
        if (msg.media_type === 'voice') return '🎤 Voice message';
        return '';
    }

    function nearBottom() {
        return chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < 120;
    }

    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // ---------- header status (online / typing / connecting) ----------

    function renderStatus() {
        if (!statusEl) return;
        statusEl.classList.remove('wa-typing');
        if (!socket.connected) {
            statusEl.textContent = 'Connecting…';
            return;
        }
        const typers = Array.from(typingUsers.values()).map((t) => t.user);
        if (typers.length === 1) {
            statusEl.textContent = typers[0] + ' is typing…';
            statusEl.classList.add('wa-typing');
        } else if (typers.length > 1) {
            statusEl.textContent = typers.length + ' people are typing…';
            statusEl.classList.add('wa-typing');
        } else {
            statusEl.textContent = online + ' online';
        }
    }

    // ---------- rendering ----------

    function welcomeHtml() {
        return (
            '<div class="chat-welcome wa-chat-welcome"><div class="wa-welcome-card">' +
            '<ion-icon name="chatbubbles-outline"></ion-icon>' +
            '<p class="wa-welcome-title">No messages yet</p>' +
            '<p class="wa-welcome-text">Say hello, drop a photo, or send a voice note — the room updates for everyone in real time.</p>' +
            '</div></div>'
        );
    }

    function tickHtml(status) {
        if (status === 'pending') return '<ion-icon name="time-outline" title="Sending"></ion-icon>';
        if (status === 'failed') return '<ion-icon name="alert-circle" title="Not sent — tap to retry"></ion-icon>';
        if (status === 'seen') return '<ion-icon name="checkmark-done" title="Seen"></ion-icon>';
        return '<ion-icon name="checkmark" title="Sent"></ion-icon>';
    }

    function messageStatus(msg) {
        if (msg._key) return pending.has(msg._key) ? pending.get(msg._key).status : 'pending';
        return msg.seen ? 'seen' : 'sent';
    }

    function buildVoicePlayer(url) {
        const player = document.createElement('div');
        player.className = 'voice-note-player';
        player.innerHTML =
            '<button type="button" class="play-pause-btn" aria-label="Play voice note">' +
            '<ion-icon name="play" class="play-icon"></ion-icon>' +
            '<ion-icon name="pause" class="pause-icon" style="display:none"></ion-icon></button>' +
            '<div class="voice-waveform">' + '<div class="waveform-bar"></div>'.repeat(18) + '</div>' +
            '<span class="voice-duration">0:00</span>';
        player.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleVoiceNote(player, url);
        });
        return player;
    }

    function renderReactions(msg) {
        const counts = {};
        let mine = null;
        Object.entries(msg.reactions || {}).forEach(([tag, emoji]) => {
            counts[emoji] = (counts[emoji] || 0) + 1;
            if (tag === myTag) mine = emoji;
        });
        const wrap = document.createElement('div');
        wrap.className = 'wa-reactions';
        Object.entries(counts).forEach(([emoji, n]) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'wa-reaction-chip' + (emoji === mine ? ' mine' : '');
            chip.textContent = emoji + (n > 1 ? ' ' + n : '');
            chip.title = emoji === mine ? 'Remove your reaction' : 'React with ' + emoji;
            chip.addEventListener('click', (e) => {
                e.stopPropagation();
                sendReaction(msg, emoji);
            });
            wrap.appendChild(chip);
        });
        return wrap;
    }

    function renderMessage(msg) {
        const mine = isMine(msg);
        const el = document.createElement('div');
        el.className = 'message wa-msg ' + (mine ? 'sent' : 'received') + (msg.deleted ? ' deleted' : '');
        if (msg.id) el.dataset.id = msg.id;
        if (msg._key) el.dataset.key = msg._key;
        el.dataset.day = dayKey(msg.timestamp || Date.now());

        const inner = document.createElement('div');
        inner.className = 'wa-msg-inner';

        if (msg.reply_to_user && !msg.deleted) {
            const quote = document.createElement('div');
            quote.className = 'message-reply-info';
            quote.innerHTML =
                '<strong>' + escapeHtml(msg.reply_to_user) + '</strong><p>' + escapeHtml(msg.reply_to_text || '') + '</p>';
            if (msg.reply_to_id) {
                quote.title = 'Go to original message';
                quote.addEventListener('click', () => jumpToMessage(msg.reply_to_id));
            }
            inner.appendChild(quote);
        }

        if (!mine) {
            const name = document.createElement('span');
            name.className = 'message-user';
            name.textContent = msg.user || 'User';
            inner.appendChild(name);
        }

        if (msg.deleted) {
            const p = document.createElement('p');
            p.className = 'message-text wa-deleted-text';
            p.innerHTML = '<ion-icon name="ban-outline"></ion-icon> This message was deleted';
            inner.appendChild(p);
        } else {
            if (msg.media && msg.media_type === 'image') {
                const url = assetUrl(msg.media);
                const link = document.createElement('a');
                link.href = url;
                link.target = '_blank';
                link.rel = 'noopener';
                const img = document.createElement('img');
                img.className = 'message-image';
                img.alt = 'Shared photo';
                img.loading = 'lazy';
                img.src = url;
                img.addEventListener('load', () => { if (nearBottom()) scrollToBottom(); });
                link.appendChild(img);
                inner.appendChild(link);
            } else if (msg.media && msg.media_type === 'voice') {
                inner.appendChild(buildVoicePlayer(assetUrl(msg.media)));
            } else if (msg.media && msg.media_type === 'sticker') {
                // Older messages only; stickers can no longer be sent
                const img = document.createElement('img');
                img.className = 'message-sticker';
                img.alt = 'Sticker';
                img.width = 96;
                img.height = 96;
                img.loading = 'lazy';
                img.src = assetUrl(msg.media);
                inner.appendChild(img);
            }
            if (msg.text) {
                const p = document.createElement('p');
                p.className = 'message-text';
                p.innerHTML = formatText(msg.text);
                inner.appendChild(p);
            }
        }

        const footer = document.createElement('div');
        footer.className = 'wa-msg-footer';
        const ts = new Date(msg.timestamp || Date.now());
        footer.innerHTML = '<span class="message-time">' +
            escapeHtml(ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) + '</span>';
        if (mine && !msg.deleted) {
            const status = messageStatus(msg);
            const ticks = document.createElement('span');
            ticks.className = 'wa-ticks ' + status;
            ticks.innerHTML = tickHtml(status);
            if (status === 'failed') {
                ticks.setAttribute('role', 'button');
                ticks.addEventListener('click', () => retryPending(msg._key));
            }
            footer.appendChild(ticks);
        }
        inner.appendChild(footer);

        // Hover (desktop) / long-press (mobile) actions — only for delivered, live messages
        if (msg.id && !msg.deleted) {
            const actions = document.createElement('div');
            actions.className = 'wa-msg-actions';
            actions.appendChild(actionButton('arrow-undo-outline', 'Reply', () => setReply(msg)));
            actions.appendChild(actionButton('happy-outline', 'React', () => toggleReactBar(el)));
            if (mine) actions.appendChild(actionButton('trash-outline', 'Delete for everyone', () => deleteMessage(msg)));
            inner.appendChild(actions);

            const bar = document.createElement('div');
            bar.className = 'wa-react-bar';
            reactionChoices.forEach((emoji) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.textContent = emoji;
                b.setAttribute('aria-label', 'React with ' + emoji);
                b.addEventListener('click', (e) => {
                    e.stopPropagation();
                    el.classList.remove('show-react', 'show-actions');
                    sendReaction(msg, emoji);
                });
                bar.appendChild(b);
            });
            el.appendChild(bar);
        }

        el.appendChild(inner);
        if (msg.reactions && Object.keys(msg.reactions).length && !msg.deleted) {
            el.appendChild(renderReactions(msg));
        }

        if (msg.id && !msg.deleted) attachLongPress(el);
        return el;
    }

    function actionButton(icon, label, onClick) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'wa-action-btn';
        b.title = label;
        b.setAttribute('aria-label', label);
        b.innerHTML = '<ion-icon name="' + icon + '"></ion-icon>';
        b.addEventListener('click', (e) => {
            e.stopPropagation();
            onClick();
        });
        return b;
    }

    function attachLongPress(el) {
        let timer = null;
        el.addEventListener('touchstart', () => {
            timer = setTimeout(() => {
                document.querySelectorAll('.wa-msg.show-actions').forEach((m) => m !== el && m.classList.remove('show-actions', 'show-react'));
                el.classList.add('show-actions');
                if (navigator.vibrate) navigator.vibrate(15);
            }, 450);
        }, { passive: true });
        ['touchend', 'touchmove', 'touchcancel'].forEach((ev) =>
            el.addEventListener(ev, () => clearTimeout(timer), { passive: true })
        );
    }

    function toggleReactBar(el) {
        const open = !el.classList.contains('show-react');
        document.querySelectorAll('.wa-msg.show-react').forEach((m) => m.classList.remove('show-react'));
        if (open) el.classList.add('show-react');
    }

    function lastMessageEl() {
        const all = chatMessages.querySelectorAll('.wa-msg');
        return all.length ? all[all.length - 1] : null;
    }

    function appendMessage(msg) {
        const welcome = chatMessages.querySelector('.chat-welcome');
        if (welcome) welcome.remove();

        const day = dayKey(msg.timestamp || Date.now());
        const last = lastMessageEl();
        if (!last || last.dataset.day !== day) {
            const sep = document.createElement('div');
            sep.className = 'wa-day-separator';
            sep.innerHTML = '<span>' + escapeHtml(dayLabel(msg.timestamp || Date.now())) + '</span>';
            chatMessages.appendChild(sep);
        }
        const el = renderMessage(msg);
        chatMessages.appendChild(el);
        return el;
    }

    function replaceMessageEl(oldEl, msg) {
        const el = renderMessage(msg);
        oldEl.replaceWith(el);
        return el;
    }

    function findMessageEl(id) {
        return chatMessages.querySelector('.wa-msg[data-id="' + Number(id) + '"]');
    }

    function jumpToMessage(id) {
        const el = findMessageEl(id);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('wa-highlight');
        setTimeout(() => el.classList.remove('wa-highlight'), 1600);
    }

    // ---------- unread / seen ----------

    function updateUnread() {
        document.title = unread > 0 ? '(' + unread + ') ' + baseTitle : baseTitle;
        if (jumpCount) {
            jumpCount.hidden = unread === 0;
            jumpCount.textContent = unread > 99 ? '99+' : String(unread);
        }
    }

    function updateJumpBtn() {
        if (jumpBtn) jumpBtn.hidden = nearBottom();
    }

    function maybeMarkSeen() {
        if (document.visibilityState !== 'visible' || !chatVisible || !nearBottom()) return;
        if (unread) {
            unread = 0;
            updateUnread();
        }
        let latest = 0;
        messages.forEach((m) => { if (!isMine(m) && m.id > latest) latest = m.id; });
        if (latest > lastSeenSent && socket.connected) {
            lastSeenSent = latest;
            socket.emit('seen', { upTo: latest });
        }
    }

    if ('IntersectionObserver' in window) {
        new IntersectionObserver((entries) => {
            chatVisible = entries[0].isIntersecting;
            maybeMarkSeen();
        }, { threshold: 0.3 }).observe(chatMessages);
    } else {
        chatVisible = true;
    }
    document.addEventListener('visibilitychange', maybeMarkSeen);
    chatMessages.addEventListener('scroll', () => {
        updateJumpBtn();
        maybeMarkSeen();
    });
    if (jumpBtn) {
        jumpBtn.addEventListener('click', () => {
            chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
        });
    }

    // ---------- incoming ----------

    function receiveMessage(msg) {
        if (messages.has(msg.id)) return;
        messages.set(msg.id, msg);
        const stick = nearBottom();
        appendMessage(msg);
        if (stick) scrollToBottom();
        if (!isMine(msg)) {
            if (document.visibilityState !== 'visible' || !chatVisible || !stick) {
                unread++;
                updateUnread();
            }
            // Someone who sends a message is no longer typing
            typingUsers.forEach((t, id) => {
                if (t.user === msg.user) {
                    clearTimeout(t.timer);
                    typingUsers.delete(id);
                }
            });
            renderStatus();
        }
        updateJumpBtn();
        maybeMarkSeen();
    }

    socket.on('session', (s) => {
        myTag = s.sender;
        if (Array.isArray(s.reactions) && s.reactions.length) reactionChoices = s.reactions;
        if (!s.persistent) console.warn('Chat server has no database: messages are kept in memory only.');
    });

    socket.on('chat history', (history) => {
        messages.clear();
        chatMessages.innerHTML = '';
        (history || []).forEach((msg) => {
            messages.set(msg.id, msg);
            appendMessage(msg);
        });
        // Keep unsent messages visible after a reconnect
        pending.forEach((p) => { p.el = appendMessage(p.msg); });
        if (!chatMessages.children.length) chatMessages.innerHTML = welcomeHtml();
        scrollToBottom();
        updateJumpBtn();
        maybeMarkSeen();
    });

    socket.on('chat message', receiveMessage);

    socket.on('message updated', (msg) => {
        if (!messages.has(msg.id)) return;
        messages.set(msg.id, msg);
        const el = findMessageEl(msg.id);
        if (el) replaceMessageEl(el, msg);
    });

    socket.on('messages seen', ({ ids }) => {
        (ids || []).forEach((id) => {
            const msg = messages.get(id);
            if (!msg || msg.seen) return;
            msg.seen = true;
            if (!isMine(msg)) return;
            const ticks = findMessageEl(id) && findMessageEl(id).querySelector('.wa-ticks');
            if (ticks) {
                ticks.className = 'wa-ticks seen';
                ticks.innerHTML = tickHtml('seen');
            }
        });
    });

    socket.on('presence', ({ online: n }) => {
        online = n;
        renderStatus();
    });

    socket.on('typing', ({ id, user, typing }) => {
        const prev = typingUsers.get(id);
        if (prev) clearTimeout(prev.timer);
        if (typing) {
            // Expire in case the "stopped typing" event never arrives
            typingUsers.set(id, { user, timer: setTimeout(() => { typingUsers.delete(id); renderStatus(); }, 6000) });
        } else {
            typingUsers.delete(id);
        }
        renderStatus();
    });

    socket.on('connect', () => {
        renderStatus();
        pending.forEach((p, key) => { if (p.status === 'pending') emitPending(key); });
    });

    socket.on('disconnect', () => {
        typingUsers.forEach((t) => clearTimeout(t.timer));
        typingUsers.clear();
        typingSent = false;
        renderStatus();
    });

    // ---------- sending ----------

    function setPendingStatus(key, status, error) {
        const p = pending.get(key);
        if (!p) return;
        p.status = status;
        const ticks = p.el && p.el.querySelector('.wa-ticks');
        if (!ticks) return;
        ticks.className = 'wa-ticks ' + status;
        ticks.innerHTML = tickHtml(status);
        ticks.title = error || '';
        ticks.onclick = status === 'failed' ? () => retryPending(key) : null;
    }

    async function uploadFile(blob, filename) {
        const formData = new FormData();
        formData.append('file', blob, filename);
        const response = await fetch(apiUrl('/api/chat/upload'), { method: 'POST', body: formData });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error(data.message || 'Upload failed');
        return data.mediaUrl;
    }

    async function emitPending(key) {
        const p = pending.get(key);
        if (!p || p.inFlight) return;
        p.inFlight = true;
        setPendingStatus(key, 'pending');

        if (p.file && !p.payload.media) {
            try {
                p.payload.media = await uploadFile(p.file, p.filename);
            } catch (err) {
                console.error('Upload failed:', err);
                p.inFlight = false;
                setPendingStatus(key, 'failed', 'Upload failed — tap to retry');
                return;
            }
        }
        // Not connected: stays queued and is sent from the "connect" handler
        if (!socket.connected) {
            p.inFlight = false;
            return;
        }

        socket.timeout(20000).emit('chat message', p.payload, (err, res) => {
            if (!pending.has(key)) return;
            p.inFlight = false;
            if (err || !res || !res.ok) {
                setPendingStatus(key, 'failed', (res && res.error) || 'Not sent — tap to retry');
                if (res && res.error) showToast(res.error);
                return;
            }
            const msg = res.message;
            pending.delete(key);
            if (p.localUrl) setTimeout(() => URL.revokeObjectURL(p.localUrl), 60000);
            if (messages.has(msg.id)) {
                p.el.remove();
                return;
            }
            messages.set(msg.id, msg);
            p.el = replaceMessageEl(p.el, msg);
        });
    }

    function retryPending(key) {
        const p = pending.get(key);
        if (p && p.status === 'failed') emitPending(key);
    }

    function queueMessage({ text, mediaType, file, filename, localUrl }) {
        const key = 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const user = displayName();
        storageSet('skySmartChatName', user);
        const reply = currentReplyTo
            ? { reply_to_id: currentReplyTo.id, reply_to_user: currentReplyTo.user, reply_to_text: previewText(currentReplyTo).slice(0, 200) }
            : { reply_to_id: null, reply_to_user: null, reply_to_text: null };
        const payload = { client_key: key, user, text: text || null, media: null, media_type: mediaType, ...reply };
        const msg = { ...payload, _key: key, media: localUrl || null, timestamp: new Date().toISOString() };
        const entry = { payload, msg, file, filename, localUrl, status: 'pending', el: null };
        pending.set(key, entry);
        entry.el = appendMessage(msg);
        scrollToBottom();
        clearReply();
        emitPending(key);
    }

    function sendMessage() {
        const text = chatMessageInput.value.trim();
        if (!text && !selectedImage) return;
        stopTyping();

        if (selectedImage) {
            const file = selectedImage;
            queueMessage({ text, mediaType: 'image', file, filename: file.name || 'photo.jpg', localUrl: URL.createObjectURL(file) });
            clearSelectedImage();
        } else {
            queueMessage({ text, mediaType: 'text' });
        }
        chatMessageInput.value = '';
        updateComposer();
        chatMessageInput.focus();
    }

    function sendReaction(msg, emoji) {
        const current = (msg.reactions || {})[myTag];
        socket.emit('react', { id: msg.id, emoji: current === emoji ? null : emoji });
    }

    function deleteMessage(msg) {
        if (!window.confirm('Delete this message for everyone?')) return;
        socket.timeout(10000).emit('delete message', { id: msg.id }, (err, res) => {
            if (err || !res || !res.ok) showToast((res && res.error) || 'Could not delete message.');
        });
    }

    function showToast(text) {
        let toast = document.querySelector('.wa-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'wa-toast';
            toast.setAttribute('role', 'status');
            chatMessages.parentElement.appendChild(toast);
        }
        toast.textContent = text;
        toast.classList.add('show');
        clearTimeout(showToast.timer);
        showToast.timer = setTimeout(() => toast.classList.remove('show'), 3500);
    }

    // ---------- reply ----------

    function setReply(msg) {
        currentReplyTo = msg;
        if (!replyPreview) return;
        replyPreview.querySelector('.reply-user').textContent = 'Replying to ' + (isMine(msg) ? 'yourself' : msg.user || 'User');
        replyPreview.querySelector('.reply-text').textContent = previewText(msg);
        replyPreview.style.display = 'flex';
        chatMessageInput.focus();
    }

    function clearReply() {
        currentReplyTo = null;
        if (replyPreview) replyPreview.style.display = 'none';
    }

    if (cancelReplyBtn) cancelReplyBtn.addEventListener('click', clearReply);

    // ---------- composer: typing, send/mic toggle, emoji, photo ----------

    let typingSent = false;
    let typingTimer = null;

    function stopTyping() {
        clearTimeout(typingTimer);
        if (typingSent) {
            socket.emit('typing', { typing: false });
            typingSent = false;
        }
    }

    function updateComposer() {
        const hasContent = !!chatMessageInput.value.trim() || !!selectedImage;
        chatSendBtn.hidden = !hasContent;
        if (micBtn) micBtn.hidden = hasContent;
    }

    chatMessageInput.addEventListener('input', () => {
        updateComposer();
        if (!chatMessageInput.value.trim()) return stopTyping();
        if (!typingSent && socket.connected) {
            socket.emit('typing', { user: displayName(), typing: true });
            typingSent = true;
        }
        clearTimeout(typingTimer);
        typingTimer = setTimeout(stopTyping, 3000);
    });

    chatMessageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    chatSendBtn.addEventListener('click', sendMessage);

    if (chatUserName) {
        const saved = storageGet('skySmartChatName');
        if (saved) chatUserName.value = saved;
        chatUserName.addEventListener('change', () => storageSet('skySmartChatName', chatUserName.value.trim()));
    }

    if (emojiBtn && emojiPicker) {
        EMOJIS.forEach((emoji) => {
            const span = document.createElement('span');
            span.className = 'emoji-item';
            span.setAttribute('role', 'option');
            span.textContent = emoji;
            span.addEventListener('click', (e) => {
                e.stopPropagation();
                const start = chatMessageInput.selectionStart ?? chatMessageInput.value.length;
                const end = chatMessageInput.selectionEnd ?? start;
                const v = chatMessageInput.value;
                chatMessageInput.value = v.slice(0, start) + emoji + v.slice(end);
                chatMessageInput.setSelectionRange(start + emoji.length, start + emoji.length);
                chatMessageInput.focus();
                updateComposer();
            });
            emojiPicker.appendChild(span);
        });
        emojiBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            emojiPicker.style.display = emojiPicker.style.display === 'none' ? 'grid' : 'none';
        });
        emojiPicker.addEventListener('click', (e) => e.stopPropagation());
    }

    document.addEventListener('click', (e) => {
        if (emojiPicker) emojiPicker.style.display = 'none';
        if (!e.target.closest || !e.target.closest('.wa-msg')) {
            document.querySelectorAll('.wa-msg.show-actions, .wa-msg.show-react')
                .forEach((m) => m.classList.remove('show-actions', 'show-react'));
        }
    });

    function clearSelectedImage() {
        selectedImage = null;
        if (chatImageInput) chatImageInput.value = '';
        if (imagePreviewContainer) imagePreviewContainer.style.display = 'none';
        updateComposer();
    }

    if (chatImageInput) {
        chatImageInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (!/^image\/(jpeg|png|gif|webp)$/.test(file.type)) {
                showToast('Only JPG, PNG, GIF or WebP photos can be sent.');
                return clearSelectedImage();
            }
            if (file.size > MAX_UPLOAD_BYTES) {
                showToast('That photo is over 10 MB.');
                return clearSelectedImage();
            }
            selectedImage = file;
            if (imagePreview) imagePreview.src = URL.createObjectURL(file);
            if (imagePreviewContainer) imagePreviewContainer.style.display = 'flex';
            updateComposer();
            chatMessageInput.focus();
        });
    }
    if (removeImageBtn) removeImageBtn.addEventListener('click', clearSelectedImage);

    // ---------- voice notes ----------

    let mediaRecorder = null;
    let audioChunks = [];
    let recordCancelled = false;
    let recordStart = 0;
    let recordTimer = null;

    function updateVoiceTimer() {
        const ms = Date.now() - recordStart;
        if (voiceTimer) {
            voiceTimer.textContent =
                String(Math.floor(ms / 60000)).padStart(2, '0') + ':' + String(Math.floor(ms / 1000) % 60).padStart(2, '0');
        }
        if (ms >= MAX_VOICE_MS) finishRecording(false);
    }

    function finishRecording(cancel) {
        if (!mediaRecorder || mediaRecorder.state !== 'recording') return;
        recordCancelled = cancel;
        mediaRecorder.stop();
        clearInterval(recordTimer);
        if (voicePreviewContainer) voicePreviewContainer.style.display = 'none';
    }

    if (micBtn) {
        if (!navigator.mediaDevices || typeof MediaRecorder === 'undefined') {
            micBtn.hidden = true;
            micBtn.dataset.unsupported = '1';
        }
        micBtn.addEventListener('click', async () => {
            let stream;
            try {
                stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            } catch (err) {
                showToast('Allow microphone access in your browser to send voice notes.');
                return;
            }
            const mimeType = ['audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
            mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
            audioChunks = [];
            recordCancelled = false;
            mediaRecorder.ondataavailable = (e) => { if (e.data.size) audioChunks.push(e.data); };
            mediaRecorder.onstop = () => {
                stream.getTracks().forEach((t) => t.stop());
                if (recordCancelled || !audioChunks.length) return;
                const type = (mediaRecorder.mimeType || mimeType || 'audio/webm').split(';')[0];
                const blob = new Blob(audioChunks, { type });
                const ext = type.includes('mp4') ? '.m4a' : type.includes('ogg') ? '.ogg' : '.webm';
                queueMessage({ text: null, mediaType: 'voice', file: blob, filename: 'voice-note' + ext, localUrl: URL.createObjectURL(blob) });
            };
            mediaRecorder.start();
            recordStart = Date.now();
            updateVoiceTimer();
            recordTimer = setInterval(updateVoiceTimer, 500);
            if (voicePreviewContainer) voicePreviewContainer.style.display = 'flex';
        });
    }
    if (stopVoiceBtn) stopVoiceBtn.addEventListener('click', () => finishRecording(false));
    if (cancelVoiceBtn) cancelVoiceBtn.addEventListener('click', () => finishRecording(true));

    let currentAudio = null;
    let currentPlayer = null;

    function setPlayerIcons(player, playing) {
        const play = player.querySelector('.play-icon');
        const pause = player.querySelector('.pause-icon');
        if (play) play.style.display = playing ? 'none' : 'block';
        if (pause) pause.style.display = playing ? 'block' : 'none';
    }

    function toggleVoiceNote(player, url) {
        if (currentAudio && currentPlayer === player) {
            if (currentAudio.paused) currentAudio.play().catch(() => {});
            else currentAudio.pause();
            return;
        }
        if (currentAudio) {
            currentAudio.pause();
            currentPlayer.querySelectorAll('.waveform-bar').forEach((b) => b.classList.remove('active'));
        }
        const bars = player.querySelectorAll('.waveform-bar');
        const durationText = player.querySelector('.voice-duration');
        const audio = new Audio(url);
        currentAudio = audio;
        currentPlayer = player;
        audio.onplay = () => setPlayerIcons(player, true);
        audio.onpause = () => setPlayerIcons(player, false);
        audio.ontimeupdate = () => {
            const progress = isFinite(audio.duration) && audio.duration ? audio.currentTime / audio.duration : 0;
            const active = Math.floor(progress * bars.length);
            bars.forEach((bar, i) => bar.classList.toggle('active', i <= active));
            const s = Math.floor(audio.currentTime);
            if (durationText) durationText.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
        };
        audio.onended = () => {
            setPlayerIcons(player, false);
            bars.forEach((b) => b.classList.remove('active'));
            if (durationText) durationText.textContent = '0:00';
            currentAudio = null;
            currentPlayer = null;
        };
        audio.play().catch(() => showToast('Could not play this voice note.'));
    }

    updateComposer();
    renderStatus();
})();
