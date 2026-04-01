(function () {
    if (typeof window.socket === 'undefined' && typeof io !== 'undefined') {
        var origin = (typeof window !== 'undefined' && window.skySmartApiOrigin) || '';
        window.socket = origin
            ? io(origin, { path: '/socket.io', transports: ['websocket', 'polling'] })
            : io({ path: '/socket.io', transports: ['websocket', 'polling'] });
    }

    function escapeHtml(s) {
        if (s == null) return '';
        const div = document.createElement('div');
        div.textContent = String(s);
        return div.innerHTML;
    }

    const chatMessages = document.getElementById('chat-messages');
    const chatMessageInput = document.getElementById('chat-message-input');
    const chatUserName = document.getElementById('chat-user-name');
    const chatSendBtn = document.getElementById('chat-send-btn');
    const chatImageInput = document.getElementById('chat-image-input');
    const imagePreviewContainer = document.getElementById('image-preview-container');
    const imagePreview = document.getElementById('image-preview');
    const removeImageBtn = document.getElementById('remove-image-btn');

    const emojiBtn = document.getElementById('emoji-btn');
    const stickerBtn = document.getElementById('sticker-btn');
    const micBtn = document.getElementById('mic-btn');
    const emojiPicker = document.getElementById('emoji-picker');
    const stickerPicker = document.getElementById('sticker-picker');
    const replyPreview = document.getElementById('reply-preview');
    const cancelReplyBtn = document.getElementById('cancel-reply-btn');
    const voicePreviewContainer = document.getElementById('voice-preview-container');
    const voiceTimer = document.getElementById('voice-timer');
    const stopVoiceBtn = document.getElementById('stop-voice-btn');
    const cancelVoiceBtn = document.getElementById('cancel-voice-btn');

    let selectedImage = null;
    let currentReplyTo = null;
    let mediaRecorder = null;
    let audioChunks = [];
    let recordStartTime = 0;
    let timerInterval = null;

    const emojis = ['😊', '😂', '🔥', '👟', '👕', '❤️', '👍', '🙌', '😎', '💯', '✨', '👞', '👢', '🎉', '💬', '🙏'];

    const stickers = [
        { name: 'Happy Shoe', url: 'https://cdn-icons-png.flaticon.com/512/2589/2589907.png' },
        { name: 'Fire Kicks', url: 'https://cdn-icons-png.flaticon.com/512/785/785116.png' },
        { name: 'Cool Fashion', url: 'https://cdn-icons-png.flaticon.com/512/3050/3050230.png' },
        { name: 'Shopping Bag', url: 'https://cdn-icons-png.flaticon.com/512/1170/1170678.png' },
        { name: 'Love Fashion', url: 'https://cdn-icons-png.flaticon.com/512/2904/2904973.png' },
    ];

    function setReply(msg) {
        currentReplyTo = msg;
        if (!replyPreview) return;
        const userEl = replyPreview.querySelector('.reply-user');
        const textEl = replyPreview.querySelector('.reply-text');
        if (userEl) userEl.textContent = 'Replying to ' + (msg.user || 'User');
        if (textEl)
            textEl.textContent =
                msg.text ||
                (msg.media_type === 'image' ? '📷 Photo' : msg.media_type === 'voice' ? '🎤 Voice' : '[Media]');
        replyPreview.style.display = 'flex';
        if (chatMessageInput) chatMessageInput.focus();
    }

    function clearReply() {
        currentReplyTo = null;
        if (replyPreview) replyPreview.style.display = 'none';
    }

    function welcomeHtml() {
        return `
            <div class="chat-welcome wa-chat-welcome">
                <div class="wa-welcome-card">
                    <ion-icon name="chatbubbles-outline"></ion-icon>
                    <p class="wa-welcome-title">No messages yet</p>
                    <p class="wa-welcome-text">Say hello, drop a photo, or ask about sizing — the room updates for everyone in real time.</p>
                </div>
            </div>
        `;
    }

    function addMessageToUI(msg) {
        if (!chatMessages) return;

        const welcome = chatMessages.querySelector('.chat-welcome');
        if (welcome) welcome.remove();

        const currentUserName = (chatUserName ? chatUserName.value.trim() : '') || 'Anonymous';
        const isSent = msg.user === currentUserName;

        const messageDiv = document.createElement('div');
        messageDiv.className = `message wa-msg ${isSent ? 'sent' : 'received'}`;
        if (msg.id != null) messageDiv.id = 'msg-' + msg.id;

        const ts = msg.timestamp ? new Date(msg.timestamp) : new Date();
        const timeStr = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        let replyHtml = '';
        if (msg.reply_to_user) {
            replyHtml =
                '<div class="message-reply-info">' +
                '<strong>' +
                escapeHtml('Replying to ' + msg.reply_to_user) +
                '</strong>' +
                '<p>' +
                escapeHtml(msg.reply_to_text || '') +
                '</p>' +
                '</div>';
        }

        let mediaHtml = '';
        if (msg.media) {
            const asset =
                typeof window.skySmartAssetUrl === 'function'
                    ? window.skySmartAssetUrl(msg.media)
                    : msg.media;
            const safeUrl = String(asset).replace(/'/g, "\\'");
            if (msg.media_type === 'image') {
                mediaHtml =
                    '<img src="' +
                    escapeHtml(asset) +
                    '" class="message-image" alt="Shared image" loading="lazy" onclick="window.open(\'' +
                    safeUrl +
                    "', '_blank')\">";
            } else if (msg.media_type === 'sticker') {
                mediaHtml =
                    '<img src="' +
                    escapeHtml(asset) +
                    '" class="message-sticker" width="96" height="96" alt="Sticker" loading="lazy">';
            } else if (msg.media_type === 'voice') {
                mediaHtml =
                    '<div class="voice-note-player" onclick="window.toggleVoiceNote(this, \'' +
                    safeUrl +
                    '\')">' +
                    '<button type="button" class="play-pause-btn" aria-label="Play voice note">' +
                    '<ion-icon name="play" class="play-icon"></ion-icon>' +
                    '<ion-icon name="pause" class="pause-icon" style="display:none"></ion-icon>' +
                    '</button>' +
                    '<div class="voice-waveform">' +
                    Array(15)
                        .fill('<div class="waveform-bar"></div>')
                        .join('') +
                    '</div>' +
                    '<span class="voice-duration">0:00</span></div>';
            }
        }

        const nameBlock = isSent ? '' : '<span class="message-user">' + escapeHtml(msg.user || 'User') + '</span>';
        const textBlock = msg.text
            ? '<p class="message-text">' + escapeHtml(msg.text).replace(/\n/g, '<br>') + '</p>'
            : '';

        messageDiv.innerHTML =
            '<div class="wa-msg-inner">' +
            replyHtml +
            nameBlock +
            textBlock +
            mediaHtml +
            '<div class="wa-msg-footer">' +
            '<span class="message-time">' +
            escapeHtml(timeStr) +
            '</span>' +
            '</div>' +
            '<button type="button" class="reply-btn" title="Reply" aria-label="Reply to this message">' +
            '<ion-icon name="arrow-undo-outline"></ion-icon>' +
            '</button>' +
            '</div>';

        const replyBtn = messageDiv.querySelector('.reply-btn');
        if (replyBtn) replyBtn.onclick = () => setReply(msg);

        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    if (chatMessages && chatMessageInput && chatSendBtn) {
        if (chatUserName && localStorage.getItem('skySmartChatName')) {
            chatUserName.value = localStorage.getItem('skySmartChatName');
        }

        if (emojiBtn && emojiPicker) {
            emojis.forEach((emoji) => {
                const span = document.createElement('span');
                span.className = 'emoji-item';
                span.setAttribute('role', 'option');
                span.textContent = emoji;
                span.onclick = (e) => {
                    e.stopPropagation();
                    chatMessageInput.value += emoji;
                    emojiPicker.style.display = 'none';
                    chatMessageInput.focus();
                };
                emojiPicker.appendChild(span);
            });

            emojiBtn.onclick = (e) => {
                e.stopPropagation();
                emojiPicker.style.display = emojiPicker.style.display === 'none' ? 'grid' : 'none';
                stickerPicker.style.display = 'none';
            };
        }

        if (stickerBtn && stickerPicker) {
            stickers.forEach((sticker) => {
                const img = document.createElement('img');
                img.className = 'sticker-item';
                img.src = sticker.url;
                img.alt = sticker.name;
                img.onclick = (e) => {
                    e.stopPropagation();
                    sendMediaMessage(sticker.url, 'sticker');
                    stickerPicker.style.display = 'none';
                };
                stickerPicker.appendChild(img);
            });

            stickerBtn.onclick = (e) => {
                e.stopPropagation();
                stickerPicker.style.display = stickerPicker.style.display === 'none' ? 'grid' : 'none';
                emojiPicker.style.display = 'none';
            };
        }

        if (emojiPicker) {
            emojiPicker.addEventListener('click', (e) => e.stopPropagation());
        }
        if (stickerPicker) {
            stickerPicker.addEventListener('click', (e) => e.stopPropagation());
        }

        document.addEventListener('click', () => {
            if (emojiPicker) emojiPicker.style.display = 'none';
            if (stickerPicker) stickerPicker.style.display = 'none';
        });

        if (micBtn) {
            micBtn.onclick = async () => {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    startRecording(stream);
                } catch (err) {
                    alert('Microphone access is needed for voice notes. Allow access in your browser settings.');
                }
            };
        }

        function startRecording(stream) {
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                if (audioChunks.length > 0) {
                    uploadAndSendVoice(audioBlob);
                }
                stream.getTracks().forEach((track) => track.stop());
            };

            mediaRecorder.start();
            recordStartTime = Date.now();
            if (voicePreviewContainer) voicePreviewContainer.style.display = 'flex';
            updateTimer();
            timerInterval = setInterval(updateTimer, 1000);
        }

        function updateTimer() {
            const diff = Date.now() - recordStartTime;
            const sec = Math.floor(diff / 1000) % 60;
            const min = Math.floor(diff / 60000);
            if (voiceTimer) voiceTimer.textContent = min.toString().padStart(2, '0') + ':' + sec.toString().padStart(2, '0');
        }

        if (stopVoiceBtn) {
            stopVoiceBtn.onclick = () => {
                if (mediaRecorder && mediaRecorder.state === 'recording') {
                    mediaRecorder.stop();
                    resetVoiceUI();
                }
            };
        }

        if (cancelVoiceBtn) {
            cancelVoiceBtn.onclick = () => {
                if (mediaRecorder) {
                    audioChunks = [];
                    mediaRecorder.stop();
                    resetVoiceUI();
                }
            };
        }

        function resetVoiceUI() {
            if (voicePreviewContainer) voicePreviewContainer.style.display = 'none';
            clearInterval(timerInterval);
        }

        async function uploadAndSendVoice(blob) {
            const formData = new FormData();
            formData.append('file', blob, 'voice-note.webm');
            try {
                const uploadUrl =
                    typeof window.skySmartApiUrl === 'function'
                        ? window.skySmartApiUrl('/api/chat/upload')
                        : '/api/chat/upload';
                const response = await fetch(uploadUrl, { method: 'POST', body: formData });
                const data = await response.json();
                if (data.success) {
                    sendMediaMessage(data.mediaUrl, 'voice');
                }
            } catch (err) {
                console.error('Voice upload failed:', err);
            }
        }

        if (cancelReplyBtn) {
            cancelReplyBtn.onclick = () => clearReply();
        }

        if (chatImageInput) {
            chatImageInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    selectedImage = file;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        if (imagePreview) imagePreview.src = ev.target.result;
                        if (imagePreviewContainer) imagePreviewContainer.style.display = 'flex';
                    };
                    reader.readAsDataURL(file);
                }
            });
        }

        if (removeImageBtn) {
            removeImageBtn.addEventListener('click', () => {
                selectedImage = null;
                if (chatImageInput) chatImageInput.value = '';
                if (imagePreviewContainer) imagePreviewContainer.style.display = 'none';
            });
        }

        async function sendMediaMessage(url, type) {
            const user = (chatUserName ? chatUserName.value.trim() : '') || 'Anonymous';
            const messageData = {
                user,
                media: url,
                media_type: type,
                reply_to_id: currentReplyTo ? currentReplyTo.id : null,
                reply_to_user: currentReplyTo ? currentReplyTo.user : null,
                reply_to_text: currentReplyTo ? currentReplyTo.text || '[' + currentReplyTo.media_type + ']' : null,
            };
            window.socket.emit('chat message', messageData);
            clearReply();
        }

        const sendMessage = async () => {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
                resetVoiceUI();
                return;
            }

            const text = chatMessageInput.value.trim();
            const user = (chatUserName ? chatUserName.value.trim() : '') || 'Anonymous';

            if (!text && !selectedImage) return;

            // Immediately clear input for snappy feel
            chatMessageInput.value = '';
            const tempSelectedImage = selectedImage;
            selectedImage = null;
            if (chatImageInput) chatImageInput.value = '';
            if (imagePreviewContainer) imagePreviewContainer.style.display = 'none';

            localStorage.setItem('skySmartChatName', user);

            let mediaUrl = null;
            let mediaType = 'text';

            if (tempSelectedImage) {
                const formData = new FormData();
                formData.append('file', tempSelectedImage);
                try {
                    const uploadUrl =
                        typeof window.skySmartApiUrl === 'function'
                            ? window.skySmartApiUrl('/api/chat/upload')
                            : '/api/chat/upload';
                    const response = await fetch(uploadUrl, { method: 'POST', body: formData });
                    const data = await response.json();
                    if (data.success) {
                        mediaUrl = data.mediaUrl;
                        mediaType = 'image';
                    }
                } catch (err) {
                    console.error('Upload failed:', err);
                }
            }

            const messageData = {
                user,
                text: text || null,
                media: mediaUrl,
                media_type: mediaType,
                reply_to_id: currentReplyTo ? currentReplyTo.id : null,
                reply_to_user: currentReplyTo ? currentReplyTo.user : null,
                reply_to_text: currentReplyTo
                    ? currentReplyTo.text || '[' + currentReplyTo.media_type + ']'
                    : null,
                timestamp: new Date().toISOString()
            };

            window.socket.emit('chat message', messageData);
            clearReply();
        };

        chatSendBtn.addEventListener('click', sendMessage);
        chatMessageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        window.socket.on('chat message', (msg) => addMessageToUI(msg));

        window.socket.on('chat history', (history) => {
            chatMessages.innerHTML = '';
            if (!history || history.length === 0) {
                chatMessages.innerHTML = welcomeHtml();
            } else {
                history.forEach((msg) => addMessageToUI(msg));
            }
            chatMessages.scrollTop = chatMessages.scrollHeight;
        });
    }

    let currentAudio = null;
    let currentActivePlayer = null;

    window.toggleVoiceNote = (player, audioUrl) => {
        const playIcon = player.querySelector('.play-icon');
        const pauseIcon = player.querySelector('.pause-icon');
        const bars = player.querySelectorAll('.waveform-bar');
        const durationText = player.querySelector('.voice-duration');

        if (currentAudio && currentActivePlayer === player) {
            if (currentAudio.paused) {
                currentAudio.play();
                if (playIcon) playIcon.style.display = 'none';
                if (pauseIcon) pauseIcon.style.display = 'block';
            } else {
                currentAudio.pause();
                if (playIcon) playIcon.style.display = 'block';
                if (pauseIcon) pauseIcon.style.display = 'none';
            }
            return;
        }

        if (currentAudio) {
            currentAudio.pause();
            if (currentActivePlayer) {
                const pi = currentActivePlayer.querySelector('.play-icon');
                const pa = currentActivePlayer.querySelector('.pause-icon');
                if (pi) pi.style.display = 'block';
                if (pa) pa.style.display = 'none';
                currentActivePlayer.querySelectorAll('.waveform-bar').forEach((b) => b.classList.remove('active'));
            }
        }

        const audio = new Audio(audioUrl);
        currentAudio = audio;
        currentActivePlayer = player;

        audio.onplay = () => {
            if (playIcon) playIcon.style.display = 'none';
            if (pauseIcon) pauseIcon.style.display = 'block';
        };

        audio.onpause = () => {
            if (playIcon) playIcon.style.display = 'block';
            if (pauseIcon) pauseIcon.style.display = 'none';
        };

        audio.ontimeupdate = () => {
            const progress = audio.duration ? audio.currentTime / audio.duration : 0;
            const activeBars = Math.floor(progress * bars.length);
            bars.forEach((bar, index) => {
                if (index <= activeBars) {
                    bar.classList.add('active');
                    bar.style.height = 40 + Math.random() * 60 + '%';
                } else {
                    bar.classList.remove('active');
                    bar.style.height = '60%';
                }
            });
            const min = Math.floor(audio.currentTime / 60);
            const sec = Math.floor(audio.currentTime % 60);
            if (durationText) durationText.textContent = min + ':' + sec.toString().padStart(2, '0');
        };

        audio.onended = () => {
            if (playIcon) playIcon.style.display = 'block';
            if (pauseIcon) pauseIcon.style.display = 'none';
            bars.forEach((b) => {
                b.classList.remove('active');
                b.style.height = '60%';
            });
            if (durationText) durationText.textContent = '0:00';
        };

        audio.play().catch(() => {});
    };
})();
