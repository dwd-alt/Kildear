document.addEventListener('DOMContentLoaded', function() {
    // Инициализация
    const socket = io();
    const currentUser = document.getElementById('current-user').value;
    const currentUserName = document.getElementById('current-user-name').value;
    const currentUserColor = document.getElementById('current-user-color').value;
    const isAdmin = document.getElementById('is-admin') ? document.getElementById('is-admin').value === 'true' : false;

    // Переменные состояния
    let currentRecipient = null;
    let currentRecipientName = '';
    let currentRecipientColor = '';
    let typingTimeout = null;
    let currentAttachment = null;
    let allMessages = [];
    let isWindowFocused = true;
    let unreadMessages = {};

    // Переменные для звонков
    let activeCall = null;
    let peerConnection = null;
    let localStream = null;
    let remoteStream = null;
    let callTimer = null;
    let callStartTime = null;
    let isMuted = false;
    let isVideoMuted = false;

    // Элементы DOM
    const searchInput = document.getElementById('search-input');
    const searchResults = document.getElementById('search-results');
    const messagesContainer = document.getElementById('messages-container');
    const messageInput = document.getElementById('message-input');
    const typingIndicator = document.getElementById('typing-indicator');
    const typingText = document.getElementById('typing-text');
    const messageInputContainer = document.getElementById('message-input-container');
    const chatHeader = document.getElementById('chat-header');
    const onlineCount = document.getElementById('online-count');
    const contactsList = document.getElementById('contacts-list');
    const emptyContacts = document.getElementById('empty-contacts');
    const sendMessageBtn = document.getElementById('send-message-btn');

    // Элементы для вложений
    const attachPhotoBtn = document.getElementById('attach-photo');
    const attachVideoBtn = document.getElementById('attach-video');
    const attachFileBtn = document.getElementById('attach-file');
    const attachStickerBtn = document.getElementById('stickers-toggle');
    const photoInput = document.getElementById('photo-input');
    const videoInput = document.getElementById('video-input');
    const fileInput = document.getElementById('file-input');
    const attachmentPreview = document.getElementById('attachment-preview');
    const previewImage = document.getElementById('preview-image');
    const previewVideo = document.getElementById('preview-video');
    const previewFile = document.getElementById('preview-file');
    const previewInfo = document.getElementById('preview-info');
    const removeAttachmentBtn = document.getElementById('remove-attachment');

    // Элементы для звонков
    const callModal = document.getElementById('call-modal');
    const callTitle = document.getElementById('call-title');
    const callTimerElement = document.getElementById('call-timer');
    const callStatus = document.getElementById('call-status');
    const callWith = document.getElementById('call-with');
    const acceptCallBtn = document.getElementById('accept-call-btn');
    const rejectCallBtn = document.getElementById('reject-call-btn');
    const endCallBtn = document.getElementById('end-call-btn');
    const muteAudioBtn = document.getElementById('mute-audio-btn');
    const muteVideoBtn = document.getElementById('mute-video-btn');
    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');

    // ============ ОСНОВНЫЕ ФУНКЦИИ ============

    // Инициализация WebSocket
    function initWebSocket() {
        socket.on('connect', () => {
            console.log('✓ Подключен к серверу');
            showNotification('Подключено к серверу', 'success');
            loadContacts();

            // Восстанавливаем последний чат
            restoreLastChat();
        });

        socket.on('disconnect', () => {
            console.log('✗ Отключен от сервера');
            showNotification('Нет подключения к серверу', 'error');
        });

        socket.on('connect_error', (error) => {
            console.error('Ошибка подключения:', error);
            showNotification('Ошибка подключения к серверу', 'error');
        });

        socket.on('user_status', handleUserStatus);
        socket.on('new_message', handleNewMessage);
        socket.on('message_sent', handleMessageSent);
        socket.on('user_typing', handleUserTyping);
        socket.on('message_edited', handleMessageEdited);
        socket.on('message_deleted', handleMessageDeleted);

        // Обработчики для звонков
        socket.on('incoming_call', handleIncomingCall);
        socket.on('call_accepted', handleCallAccepted);
        socket.on('call_rejected', handleCallRejected);
        socket.on('call_ended', handleCallEnded);
        socket.on('call_timeout', handleCallTimeout);
        socket.on('call_error', handleCallError);
        socket.on('webrtc_signal', handleWebRTCSignal);
        socket.on('call_ice_candidate', handleCallIceCandidate);
    }

    // ============ ПОИСК ПОЛЬЗОВАТЕЛЕЙ ============
    function initSearch() {
        if (!searchInput) return;

        searchInput.addEventListener('input', debounce(function(e) {
            const query = e.target.value.trim();
            if (query.length < 1) {
                searchResults.style.display = 'none';
                return;
            }
            searchUsers(query);
        }, 300));

        document.addEventListener('click', function(e) {
            if (searchResults && !searchResults.contains(e.target) && e.target !== searchInput) {
                searchResults.style.display = 'none';
            }
        });
    }

    function searchUsers(query) {
        fetch(`/search_users?q=${encodeURIComponent(query)}`)
            .then(response => response.json())
            .then(users => displaySearchResults(users))
            .catch(error => console.error('Search error:', error));
    }

    function displaySearchResults(users) {
        if (!searchResults) return;

        if (!users || users.length === 0) {
            searchResults.innerHTML = '<div class="no-results">Пользователи не найдены</div>';
            searchResults.style.display = 'block';
            return;
        }

        searchResults.innerHTML = '';
        users.forEach(user => {
            const userElement = document.createElement('div');
            userElement.className = 'contact-item search-result';
            userElement.innerHTML = `
                <div class="contact-avatar" style="background: ${user.avatar_color || '#4ECDC4'}">
                    ${user.avatar ? `<img src="${user.avatar}" alt="${user.name}">` : user.name[0].toUpperCase()}
                    <span class="status-indicator ${user.is_online ? 'online' : ''}"></span>
                </div>
                <div class="contact-info">
                    <div class="contact-name-row">
                        <h4>${escapeHtml(user.name)}</h4>
                        <span class="user-status-badge ${user.is_online ? 'online' : 'offline'}">
                            ${user.is_online ? 'онлайн' : 'офлайн'}
                        </span>
                    </div>
                    <p class="contact-preview">
                        @${escapeHtml(user.username)}
                    </p>
                </div>
            `;

            userElement.addEventListener('click', () => {
                openChat(user.username, user.name, user.avatar_color || '#4ECDC4');
                searchInput.value = '';
                searchResults.style.display = 'none';
            });

            searchResults.appendChild(userElement);
        });

        searchResults.style.display = 'block';
    }

    // ============ ЗАГРУЗКА КОНТАКТОВ ============
    function loadContacts() {
        fetch('/api/get_chats')
            .then(response => response.json())
            .then(chats => displayContacts(chats))
            .catch(error => console.error('Error loading contacts:', error));
    }

    function displayContacts(chats) {
        if (!contactsList || !emptyContacts) return;

        if (!chats || chats.length === 0) {
            emptyContacts.style.display = 'block';
            contactsList.innerHTML = '';
            return;
        }

        emptyContacts.style.display = 'none';
        contactsList.innerHTML = '';

        chats.forEach(chat => {
            const contactElement = createContactElement(chat);
            contactsList.appendChild(contactElement);
        });

        updateOnlineCount();
    }

    function createContactElement(chat) {
        const contactItem = document.createElement('div');
        contactItem.className = 'contact-item';
        contactItem.dataset.username = chat.username;
        contactItem.dataset.color = chat.avatar_color || '#4ECDC4';

        let lastMessage = '';
        if (chat.last_message) {
            if (chat.last_message.type === 'image') {
                lastMessage = '📷 Изображение';
            } else if (chat.last_message.type === 'video') {
                lastMessage = '🎬 Видео';
            } else if (chat.last_message.type === 'sticker') {
                lastMessage = '😊 Стикер';
            } else if (chat.last_message.type === 'file') {
                lastMessage = '📎 Файл';
            } else if (chat.last_message.type === 'audio') {
                lastMessage = '🎵 Аудио';
            } else {
                lastMessage = chat.last_message.message || '';
            }
        }

        const time = chat.last_message ? formatTime(chat.last_message.timestamp) : '';

        contactItem.innerHTML = `
            <div class="contact-avatar" style="background: ${chat.avatar_color || '#4ECDC4'}">
                ${chat.avatar ? `<img src="${chat.avatar}" alt="${chat.name}">` : chat.name[0].toUpperCase()}
                <span class="status-indicator ${chat.is_online ? 'online' : ''}" id="status-${chat.username}"></span>
            </div>
            <div class="contact-info">
                <div class="contact-name-row">
                    <h4>${escapeHtml(chat.name)}</h4>
                    <span class="message-time">${time}</span>
                </div>
                <p class="contact-preview">
                    ${escapeHtml(lastMessage.substring(0, 30))}${lastMessage.length > 30 ? '...' : ''}
                </p>
            </div>
        `;

        contactItem.addEventListener('click', () => {
            openChat(chat.username, chat.name, chat.avatar_color || '#4ECDC4');
        });

        return contactItem;
    }

    // ============ ОТКРЫТИЕ И СОХРАНЕНИЕ ЧАТА ============
    function openChat(username, name, color) {
        if (currentRecipient === username) return;

        currentRecipient = username;
        currentRecipientName = name;
        currentRecipientColor = color;

        // Очищаем непрочитанные сообщения для этого чата
        if (unreadMessages[username]) {
            unreadMessages[username] = 0;
            updateUnreadBadge(username);
        }

        // Сохраняем текущий чат
        saveCurrentChat(username);

        // Обновляем интерфейс
        updateChatHeader();

        if (messageInputContainer) {
            messageInputContainer.style.display = 'flex';
        }

        // Загружаем сообщения
        loadMessages();

        // Помечаем активный контакт
        updateActiveContact();

        // Фокус на поле ввода
        setTimeout(() => {
            if (messageInput) messageInput.focus();
        }, 100);
    }

    function saveCurrentChat(username) {
        // Сохраняем в localStorage
        localStorage.setItem('lastChat', JSON.stringify({
            username: username,
            name: currentRecipientName,
            color: currentRecipientColor,
            timestamp: Date.now()
        }));

        // Сохраняем на сервере
        fetch('/api/save_current_chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ chat_with: username })
        }).catch(error => console.error('Error saving chat:', error));
    }

    function restoreLastChat() {
        const lastChat = localStorage.getItem('lastChat');
        if (lastChat) {
            try {
                const chatData = JSON.parse(lastChat);

                // Проверяем возраст данных (не старше 24 часов)
                const chatAge = Date.now() - (chatData.timestamp || 0);
                if (chatAge > 24 * 60 * 60 * 1000) {
                    localStorage.removeItem('lastChat');
                    return;
                }

                // Открываем чат
                if (chatData.username) {
                    fetch(`/api/user/${chatData.username}`)
                        .then(response => response.json())
                        .then(user => {
                            if (!user.error) {
                                setTimeout(() => {
                                    openChat(user.username, user.name, user.avatar_color);
                                }, 300);
                            }
                        })
                        .catch(() => {
                            localStorage.removeItem('lastChat');
                        });
                }
            } catch (e) {
                localStorage.removeItem('lastChat');
            }
        }
    }

    // ============ ОБНОВЛЕНИЕ ИНТЕРФЕЙСА ЧАТА ============
    function updateChatHeader() {
        if (!chatHeader) return;

        chatHeader.innerHTML = `
            <div class="user-profile">
                <div class="user-avatar" style="background: ${currentRecipientColor}" id="chat-user-avatar">
                    ${currentRecipientName[0].toUpperCase()}
                    <span class="status-indicator" id="header-status-${currentRecipient}"></span>
                </div>
                <div class="user-info">
                    <h3 id="chat-user-name">${escapeHtml(currentRecipientName)}</h3>
                    <p class="user-status" id="header-status-text-${currentRecipient}">
                        <i class="fas fa-circle"></i> проверка...
                    </p>
                </div>
            </div>
            <div class="chat-actions">
                <button class="btn-icon" id="voice-call-btn" title="Голосовой звонок">
                    <i class="fas fa-phone"></i>
                </button>
                <button class="btn-icon" id="video-call-btn" title="Видеозвонок">
                    <i class="fas fa-video"></i>
                </button>
                <button class="btn-icon" id="block-user-btn" title="Заблокировать">
                    <i class="fas fa-ban"></i>
                </button>
                <button class="btn-icon" id="view-profile-btn" title="Просмотр профиля">
                    <i class="fas fa-user"></i>
                </button>
            </div>
        `;

        // Добавляем обработчики для кнопок в заголовке
        setTimeout(() => {
            const voiceCallBtn = document.getElementById('voice-call-btn');
            const videoCallBtn = document.getElementById('video-call-btn');
            const blockBtn = document.getElementById('block-user-btn');
            const viewProfileBtn = document.getElementById('view-profile-btn');

            if (voiceCallBtn) {
                voiceCallBtn.addEventListener('click', () => startCall('audio'));
            }
            if (videoCallBtn) {
                videoCallBtn.addEventListener('click', () => startCall('video'));
            }
            if (blockBtn) {
                blockBtn.addEventListener('click', toggleBlockUser);
            }
            if (viewProfileBtn) {
                viewProfileBtn.addEventListener('click', () => {
                    window.open(`/profile/${currentRecipient}`, '_blank');
                });
            }
        }, 100);

        // Проверяем онлайн статус
        checkOnlineStatus(currentRecipient);
    }

    function updateActiveContact() {
        document.querySelectorAll('.contact-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.username === currentRecipient) {
                item.classList.add('active');
            }
        });
    }

    // ============ ОТПРАВКА СООБЩЕНИЙ ============
    function initMessageForm() {
        if (!messageInput || !sendMessageBtn) return;

        // Обработчик кнопки отправки
        sendMessageBtn.addEventListener('click', sendMessage);

        // Обработчик Enter в поле ввода
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        // Обработчик печатания
        messageInput.addEventListener('input', () => {
            if (!currentRecipient) return;

            socket.emit('typing', {
                recipient: currentRecipient,
                is_typing: true
            });

            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => {
                socket.emit('typing', {
                    recipient: currentRecipient,
                    is_typing: false
                });
            }, 1000);
        });

        // Инициализация вложений
        initAttachments();
    }

    function sendMessage() {
        const messageText = messageInput ? messageInput.value.trim() : '';

        if ((!messageText && !currentAttachment) || !currentRecipient) {
            showNotification('Введите сообщение или прикрепите файл', 'info');
            return;
        }

        if (!socket.connected) {
            showNotification('Нет подключения к серверу', 'error');
            return;
        }

        let messageData = {
            recipient: currentRecipient,
            message: messageText || '',
            type: 'text'
        };

        // Если есть вложение
        if (currentAttachment) {
            messageData.type = currentAttachment.type;
            messageData.file_name = currentAttachment.file.name;
            messageData.file_size = currentAttachment.file.size;

            const reader = new FileReader();
            reader.onload = function(e) {
                const base64Data = e.target.result;
                if (base64Data.length > 50 * 1024 * 1024) {
                    showNotification('Файл слишком большой (максимум 50MB)', 'error');
                    removeAttachment();
                    return;
                }

                messageData.file_data = base64Data;
                sendMessageToServer(messageData);
            };

            reader.onerror = function() {
                showNotification('Ошибка чтения файла', 'error');
                removeAttachment();
            };

            try {
                reader.readAsDataURL(currentAttachment.file);
            } catch (error) {
                showNotification('Ошибка обработки файла', 'error');
                removeAttachment();
            }
        } else {
            sendMessageToServer(messageData);
        }

        // Сбрасываем статус "печатает"
        clearTimeout(typingTimeout);
        socket.emit('typing', {
            recipient: currentRecipient,
            is_typing: false
        });
    }

    function sendMessageToServer(messageData) {
        const originalIcon = sendMessageBtn.innerHTML;
        sendMessageBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        sendMessageBtn.disabled = true;

        socket.emit('send_message', messageData, (response) => {
            sendMessageBtn.innerHTML = originalIcon;
            sendMessageBtn.disabled = false;

            if (response && response.error) {
                showNotification('Ошибка отправки: ' + response.error, 'error');
            } else {
                if (messageInput) messageInput.value = '';
                removeAttachment();
                loadContacts();
            }
        });
    }

    // ============ ВЛОЖЕНИЯ ФАЙЛОВ ============
    function initAttachments() {
        if (attachPhotoBtn && photoInput) {
            attachPhotoBtn.addEventListener('click', () => photoInput.click());
            photoInput.addEventListener('change', (e) => handleFileSelect(e.target.files[0], 'image'));
        }

        if (attachVideoBtn && videoInput) {
            attachVideoBtn.addEventListener('click', () => videoInput.click());
            videoInput.addEventListener('change', (e) => handleFileSelect(e.target.files[0], 'video'));
        }

        if (attachFileBtn && fileInput) {
            attachFileBtn.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', (e) => handleFileSelect(e.target.files[0], 'file'));
        }

        if (removeAttachmentBtn) {
            removeAttachmentBtn.addEventListener('click', removeAttachment);
        }
    }

    function handleFileSelect(file, type) {
        if (!file) return;

        const maxSize = 50 * 1024 * 1024;
        if (file.size > maxSize) {
            showNotification('Файл слишком большой (максимум 50MB)', 'error');
            return;
        }

        if (type === 'image') {
            const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];
            if (file.type && !validTypes.includes(file.type)) {
                showNotification('Неподдерживаемый формат изображения', 'error');
                return;
            }
        } else if (type === 'video') {
            const validTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/avi', 'video/mov'];
            if (file.type && !validTypes.includes(file.type)) {
                showNotification('Неподдерживаемый формат видео', 'error');
                return;
            }
        }

        currentAttachment = {
            file: file,
            type: type,
            url: URL.createObjectURL(file)
        };

        showAttachmentPreview();
    }

    function getFileIcon(file) {
        const extension = file.name.split('.').pop().toLowerCase();
        const icons = {
            pdf: '📄',
            doc: '📝', docx: '📝',
            xls: '📊', xlsx: '📊',
            zip: '🗜️', rar: '🗜️', '7z': '🗜️',
            txt: '📃',
            mp3: '🎵', wav: '🎵', flac: '🎵',
            default: '📎'
        };

        return icons[extension] || icons.default;
    }

    function showAttachmentPreview() {
        if (!attachmentPreview || !currentAttachment) return;

        attachmentPreview.style.display = 'block';

        if (currentAttachment.type === 'image') {
            previewImage.style.display = 'block';
            previewImage.innerHTML = `<img src="${currentAttachment.url}" alt="Preview">`;
            previewVideo.style.display = 'none';
            previewFile.style.display = 'none';
        } else if (currentAttachment.type === 'video') {
            previewImage.style.display = 'none';
            previewFile.style.display = 'none';
            previewVideo.style.display = 'block';
            previewVideo.innerHTML = `
                <video controls>
                    <source src="${currentAttachment.url}" type="${currentAttachment.file.type}">
                </video>
            `;
        } else {
            previewImage.style.display = 'none';
            previewVideo.style.display = 'none';
            previewFile.style.display = 'block';

            const fileIcon = getFileIcon(currentAttachment.file);
            previewFile.innerHTML = `
                <div class="file-preview">
                    <div class="file-icon">${fileIcon}</div>
                    <div class="file-info">
                        <div class="file-name">${escapeHtml(currentAttachment.file.name)}</div>
                        <div class="file-size">${formatFileSize(currentAttachment.file.size)}</div>
                    </div>
                </div>
            `;
        }

        if (previewInfo) {
            const fileType = currentAttachment.type === 'image' ? '📷' :
                           currentAttachment.type === 'video' ? '🎬' : '📎';
            previewInfo.textContent = `${fileType} ${currentAttachment.file.name} (${formatFileSize(currentAttachment.file.size)})`;
        }
    }

    function removeAttachment() {
        if (currentAttachment) {
            URL.revokeObjectURL(currentAttachment.url);
            currentAttachment = null;
        }
        if (attachmentPreview) {
            attachmentPreview.style.display = 'none';
        }
    }

    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        else return (bytes / 1048576).toFixed(1) + ' MB';
    }

    // ============ ЗАГРУЗКА И ОТОБРАЖЕНИЕ СООБЩЕНИЙ ============
    function loadMessages() {
        if (!currentRecipient) return;

        fetch(`/get_messages/${currentRecipient}`)
            .then(response => response.json())
            .then(messages => {
                allMessages = Array.isArray(messages) ? messages : [];
                displayMessages(allMessages);
            })
            .catch(error => console.error('Error loading messages:', error));
    }

    function displayMessages(messages) {
        if (!messagesContainer) return;

        messagesContainer.innerHTML = '';

        if (!messages || messages.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-chat';
            emptyMessage.innerHTML = `
                <div class="empty-icon">
                    <i class="fas fa-comments"></i>
                </div>
                <h3>Начните общение</h3>
                <p>Это начало вашего чата с ${currentRecipientName}</p>
            `;
            messagesContainer.appendChild(emptyMessage);
            return;
        }

        messages.forEach(message => {
            addMessageToDOM(message);
        });

        scrollToBottom();
    }

    function addMessageToDOM(message) {
        if (!messagesContainer) return;

        const isOutgoing = message.sender === currentUser;
        const messageElement = document.createElement('div');
        messageElement.className = `message ${isOutgoing ? 'outgoing' : 'incoming'} ${message.deleted ? 'deleted' : ''}`;
        messageElement.dataset.messageId = message.id;

        const time = formatTime(message.timestamp);
        const avatarColor = isOutgoing ? currentUserColor : currentRecipientColor;
        const avatarText = isOutgoing ? currentUserName[0].toUpperCase() : currentRecipientName[0].toUpperCase();

        let messageContent = '';

        if (message.deleted) {
            messageContent = `
                <div class="message-text deleted-text">
                    <i class="fas fa-trash"></i> Сообщение удалено${message.deleted_by !== currentUser ? ` пользователем @${message.deleted_by}` : ''}
                </div>
            `;
        } else if (message.type === 'image') {
            messageContent = `
                <div class="message-media">
                    <img src="/static/uploads/media/${message.file_path}" alt="Изображение" onclick="openMediaViewer('/static/uploads/media/${message.file_path}', 'image')">
                </div>
                ${message.message ? `<div class="media-caption">${escapeHtml(message.message)}</div>` : ''}
            `;
        } else if (message.type === 'video') {
            messageContent = `
                <div class="message-media">
                    <video controls>
                        <source src="/static/uploads/media/${message.file_path}" type="video/mp4">
                    </video>
                </div>
                ${message.message ? `<div class="media-caption">${escapeHtml(message.message)}</div>` : ''}
            `;
        } else if (message.type === 'audio') {
            messageContent = `
                <div class="message-file">
                    <div class="file-container">
                        <div class="file-icon">🎵</div>
                        <div class="file-info">
                            <div class="file-name">${escapeHtml(message.file_name)}</div>
                            <div class="file-size">${formatFileSize(message.file_size)}</div>
                        </div>
                        <audio controls>
                            <source src="/static/uploads/media/${message.file_path}" type="audio/mp3">
                        </audio>
                    </div>
                </div>
                ${message.message ? `<div class="file-caption">${escapeHtml(message.message)}</div>` : ''}
            `;
        } else if (message.type === 'file') {
            const fileIcon = getFileIcon({name: message.file_name});

            messageContent = `
                <div class="message-file">
                    <a href="/static/uploads/${message.file_path}" download="${escapeHtml(message.file_name)}"
                       class="file-container" target="_blank">
                        <div class="file-icon">${fileIcon}</div>
                        <div class="file-info">
                            <div class="file-name">${escapeHtml(message.file_name)}</div>
                            <div class="file-size">${formatFileSize(message.file_size)}</div>
                        </div>
                        <div class="file-download">
                            <i class="fas fa-download"></i>
                        </div>
                    </a>
                </div>
                ${message.message ? `<div class="file-caption">${escapeHtml(message.message)}</div>` : ''}
            `;
        } else if (message.type === 'sticker') {
            messageContent = `
                <div class="message-sticker">
                    <div class="sticker-emoji">${escapeHtml(message.message)}</div>
                </div>
            `;
        } else {
            messageContent = `<div class="message-text">${escapeHtml(message.message)}</div>`;
        }

        messageElement.innerHTML = `
            <div class="message-avatar" style="background: ${avatarColor}">
                ${avatarText}
            </div>
            <div class="message-content">
                <div class="message-bubble">
                    ${messageContent}
                    <div class="message-time">${time}</div>
                </div>
            </div>
        `;

        messagesContainer.appendChild(messageElement);
    }

    // ============ WEBSOCKET ОБРАБОТЧИКИ ============
    function handleNewMessage(message) {
        if (!message) return;

        if (message.sender === currentRecipient) {
            // Сообщение от текущего собеседника
            addMessageToDOM(message);
            allMessages.push(message);
            scrollToBottom();
            playMessageSound();
            updateLastMessagePreview(message);

            // Если окно не в фокусе, показываем уведомление сверху
            if (!isWindowFocused) {
                showTopNotification(message);
            }
        } else {
            // Сообщение от другого пользователя
            // Увеличиваем счетчик непрочитанных
            if (!unreadMessages[message.sender]) {
                unreadMessages[message.sender] = 0;
            }
            unreadMessages[message.sender]++;
            updateUnreadBadge(message.sender);

            // Показываем уведомление сверху
            showTopNotification(message);

            loadContacts();
        }
    }

    function handleMessageSent(message) {
        if (!message) return;

        if (message.recipient === currentRecipient) {
            addMessageToDOM(message);
            allMessages.push(message);
            scrollToBottom();
            loadContacts();
        }
    }

    function handleMessageEdited(data) {
        if (!data) return;

        const messageElement = document.querySelector(`[data-message-id="${data.message_id}"]`);
        if (messageElement) {
            const messageText = messageElement.querySelector('.message-text');
            if (messageText) {
                messageText.textContent = data.new_text;
            }
        }
    }

    function handleMessageDeleted(data) {
        if (!data) return;

        const messageElement = document.querySelector(`[data-message-id="${data.message_id}"]`);
        if (messageElement) {
            if (data.permanent) {
                messageElement.remove();
            } else {
                messageElement.classList.add('deleted');
                const messageBubble = messageElement.querySelector('.message-bubble');
                if (messageBubble) {
                    messageBubble.innerHTML = `
                        <div class="message-text deleted-text">
                            <i class="fas fa-trash"></i> Сообщение удалено${data.deleted_by !== currentUser ? ` пользователем @${data.deleted_by}` : ''}
                        </div>
                        <div class="message-time">Удалено</div>
                    `;
                }
            }
        }
    }

    function handleUserStatus(data) {
        if (!data) return;
        updateOnlineStatus(data.username, data.online);
    }

    function handleUserTyping(data) {
        if (!data || !typingIndicator || !typingText) return;

        if (data.username === currentRecipient && data.is_typing) {
            typingText.textContent = `${currentRecipientName} печатает...`;
            typingIndicator.style.display = 'flex';
        } else if (data.username === currentRecipient && !data.is_typing) {
            typingIndicator.style.display = 'none';
        }
    }

    // ============ СТИКЕРЫ ============
    function initStickers() {
        const stickersBtn = document.getElementById('stickers-toggle');
        if (!stickersBtn) return;

        stickersBtn.addEventListener('click', toggleStickers);

        // Создаем контейнер для стикеров
        const stickersContainer = document.createElement('div');
        stickersContainer.id = 'stickers-panel';
        stickersContainer.className = 'stickers-panel';

        stickersContainer.innerHTML = `
            <div class="stickers-header">
                <h4><i class="fas fa-sticky-note"></i> Стикеры</h4>
                <button class="btn-icon close-stickers">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="sticker-categories" id="sticker-categories"></div>
            <div class="stickers-grid" id="stickers-grid"></div>
        `;

        document.body.appendChild(stickersContainer);

        // Загружаем категории
        loadStickerCategories();

        // Закрытие по крестику
        stickersContainer.querySelector('.close-stickers').addEventListener('click', closeStickers);

        // Закрытие при клике вне панели
        document.addEventListener('click', closeStickersOnClickOutside);
    }

    function loadStickerCategories() {
        const categoriesContainer = document.getElementById('sticker-categories');
        if (!categoriesContainer) return;

        categoriesContainer.innerHTML = '';

        const stickers = {
            'emotions': 'Эмоции',
            'animals': 'Животные',
            'actions': 'Действия',
            'food': 'Еда',
            'objects': 'Объекты',
            'flags': 'Флаги'
        };

        Object.keys(stickers).forEach(category => {
            const btn = document.createElement('button');
            btn.className = 'sticker-category-btn';
            btn.dataset.category = category;
            btn.innerHTML = `
                <span>${stickers[category]}</span>
            `;
            btn.addEventListener('click', () => loadStickers(category));
            categoriesContainer.appendChild(btn);
        });

        // Загружаем первую категорию
        if (Object.keys(stickers).length > 0) {
            loadStickers(Object.keys(stickers)[0]);
        }
    }

    function loadStickers(category) {
        const grid = document.getElementById('stickers-grid');
        if (!grid) return;

        grid.innerHTML = '';

        const stickerSets = {
            'emotions': ['😊', '😂', '😍', '😉', '😎', '😢', '😠', '😲', '🤔', '🤦', '😭', '😘'],
            'animals': ['🐱', '🐶', '🦊', '🦁', '🐯', '🐻', '🐼', '🐰', '🦉', '🦄', '🐵', '🐲'],
            'actions': ['👍', '👎', '👌', '👏', '🙏', '✊', '👋', '❤️', '🔥', '⭐', '🚀', '🏆'],
            'food': ['☕', '🍕', '🍺', '🎂', '🍔', '🍣', '🍦', '🍸', '🍿', '🍫'],
            'objects': ['🎁', '🎈', '🎵', '📷', '📱', '💰', '⏰', '📚', '💻', '🔑'],
            'flags': ['🇷🇺', '🇺🇸', '🇬🇧', '🇩🇪', '🇫🇷', '🇪🇸', '🇮🇹', '🇯🇵', '🇨🇳', '🇺🇦']
        };

        if (stickerSets[category]) {
            stickerSets[category].forEach(emoji => {
                const stickerEl = document.createElement('div');
                stickerEl.className = 'sticker-item';
                stickerEl.innerHTML = `
                    <div class="sticker-emoji">${emoji}</div>
                `;

                stickerEl.addEventListener('click', () => {
                    sendSticker(emoji);
                    closeStickers();
                });

                grid.appendChild(stickerEl);
            });
        }

        // Обновляем активную категорию
        document.querySelectorAll('.sticker-category-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.category === category) {
                btn.classList.add('active');
            }
        });
    }

    function toggleStickers() {
        const panel = document.getElementById('stickers-panel');
        if (!panel) return;

        if (panel.classList.contains('show')) {
            closeStickers();
        } else {
            openStickers();
        }
    }

    function openStickers() {
        const panel = document.getElementById('stickers-panel');
        if (!panel) return;

        panel.classList.add('show');
    }

    function closeStickers() {
        const panel = document.getElementById('stickers-panel');
        if (!panel) return;

        panel.classList.remove('show');
    }

    function closeStickersOnClickOutside(event) {
        const panel = document.getElementById('stickers-panel');
        const stickersBtn = document.getElementById('stickers-toggle');

        if (!panel || !stickersBtn) return;

        if (!panel.contains(event.target) && !stickersBtn.contains(event.target)) {
            closeStickers();
        }
    }

    function sendSticker(emoji) {
        if (!currentRecipient) {
            showNotification('Выберите чат для отправки стикера', 'info');
            return;
        }

        const messageData = {
            recipient: currentRecipient,
            message: emoji,
            type: 'sticker'
        };

        const originalIcon = sendMessageBtn.innerHTML;
        sendMessageBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        sendMessageBtn.disabled = true;

        socket.emit('send_message', messageData, (response) => {
            sendMessageBtn.innerHTML = originalIcon;
            sendMessageBtn.disabled = false;

            if (response && response.error) {
                showNotification('Ошибка отправки: ' + response.error, 'error');
            }
        });
    }

    // ============ УВЕДОМЛЕНИЯ СВЕРХУ ============
    function showTopNotification(message) {
        // Получаем информацию об отправителе
        fetch(`/api/user/${message.sender}`)
            .then(response => response.json())
            .then(user => {
                if (user.error) return;

                const notification = document.createElement('div');
                notification.className = 'new-message-notification';

                // Определяем цвет аватарки
                let avatarColor = user.avatar_color || '#4ECDC4';
                if (message.sender === currentRecipient) {
                    avatarColor = currentRecipientColor;
                }

                let messageText = '';
                if (message.type === 'image') {
                    messageText = '📷 Изображение';
                } else if (message.type === 'video') {
                    messageText = '🎬 Видео';
                } else if (message.type === 'sticker') {
                    messageText = '😊 Стикер';
                } else if (message.type === 'file') {
                    messageText = '📎 Файл';
                } else if (message.type === 'audio') {
                    messageText = '🎵 Аудио';
                } else {
                    messageText = message.message.length > 30 ?
                        message.message.substring(0, 30) + '...' :
                        message.message;
                }

                notification.innerHTML = `
                    <div class="notification-avatar" style="background: ${avatarColor}">
                        ${user.name[0].toUpperCase()}
                    </div>
                    <div class="notification-content">
                        <div class="notification-sender">${escapeHtml(user.name)}</div>
                        <div class="notification-message">${escapeHtml(messageText)}</div>
                    </div>
                    <button class="notification-close">
                        <i class="fas fa-times"></i>
                    </button>
                `;

                // Обработчик закрытия
                notification.querySelector('.notification-close').addEventListener('click', () => {
                    notification.remove();
                });

                // Обработчик клика по уведомлению
                notification.addEventListener('click', () => {
                    openChat(message.sender, user.name, avatarColor);
                    notification.remove();
                });

                // Автоматическое скрытие через 5 секунд
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.remove();
                    }
                }, 5000);

                // Удаляем старое уведомление, если есть
                const oldNotification = document.querySelector('.new-message-notification');
                if (oldNotification) {
                    oldNotification.remove();
                }

                document.body.appendChild(notification);
            })
            .catch(console.error);
    }

    function updateUnreadBadge(username) {
        const contactItem = document.querySelector(`.contact-item[data-username="${username}"]`);
        if (contactItem) {
            let badge = contactItem.querySelector('.unread-badge');
            const unreadCount = unreadMessages[username] || 0;

            if (unreadCount > 0) {
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'unread-badge';
                    contactItem.appendChild(badge);
                }
                badge.textContent = unreadCount > 99 ? '99+' : unreadCount.toString();
                badge.style.display = 'block';
            } else if (badge) {
                badge.style.display = 'none';
            }
        }
    }

    // ============ ЗВОНКИ ============
    function initCallSystem() {
        // Обработчики кнопок звонка
        document.addEventListener('click', function(e) {
            if (e.target.closest('#accept-call-btn')) acceptCall();
            if (e.target.closest('#reject-call-btn')) rejectCall();
            if (e.target.closest('#end-call-btn')) endCall();
            if (e.target.closest('#mute-audio-btn')) toggleMuteAudio();
            if (e.target.closest('#mute-video-btn')) toggleMuteVideo();
        });
    }

    async function startCall(type) {
        if (!currentRecipient) {
            showNotification('Выберите пользователя для звонка', 'error');
            return;
        }

        if (activeCall) {
            showNotification('Уже есть активный звонок', 'error');
            return;
        }

        try {
            const constraints = {
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 48000,
                    channelCount: 1
                },
                video: type === 'video' ? {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30 }
                } : false
            };

            localStream = await navigator.mediaDevices.getUserMedia(constraints);
            console.log('Локальный поток получен:', localStream.getAudioTracks().length, 'аудио дорожек');

            const callId = 'call_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

            activeCall = {
                id: callId,
                type: type,
                caller: currentUser,
                callee: currentRecipient,
                status: 'calling',
                direction: 'outgoing'
            };

            showCallInterface('outgoing');

            socket.emit('start_call', {
                to: currentRecipient,
                call_id: callId,
                call_type: type
            });

            // Таймаут звонка
            setTimeout(() => {
                if (activeCall && activeCall.status === 'calling') {
                    endCall();
                    showNotification('Пользователь не отвечает', 'error');
                }
            }, 30000);

        } catch (error) {
            console.error('Ошибка доступа к медиаустройствам:', error);
            showNotification('Ошибка доступа к камере/микрофону', 'error');
            resetCall();
        }
    }

    function handleIncomingCall(data) {
        if (activeCall) {
            socket.emit('reject_call', {
                call_id: data.call_id,
                reason: 'Busy'
            });
            return;
        }

        activeCall = {
            id: data.call_id,
            type: data.type,
            caller: data.caller,
            callee: currentUser,
            status: 'ringing',
            direction: 'incoming'
        };

        showCallInterface('incoming');

        // Автоотклонение через 45 секунд
        setTimeout(() => {
            if (activeCall && activeCall.status === 'ringing') {
                rejectCall();
            }
        }, 45000);
    }

    async function acceptCall() {
        if (!activeCall || activeCall.status !== 'ringing') return;

        try {
            const constraints = {
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: activeCall.type === 'video' ? {
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                } : false
            };

            localStream = await navigator.mediaDevices.getUserMedia(constraints);

            activeCall.status = 'active';
            showCallInterface('active');

            socket.emit('accept_call', {
                call_id: activeCall.id
            });

            createPeerConnection();
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });

            const offer = await peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: activeCall.type === 'video'
            });
            await peerConnection.setLocalDescription(offer);

            socket.emit('webrtc_signal', {
                to: activeCall.caller,
                call_id: activeCall.id,
                signal: offer
            });

        } catch (error) {
            console.error('Ошибка при принятии звонка:', error);
            showNotification('Ошибка при запуске камеры/микрофона', 'error');
            endCall();
        }
    }

    function rejectCall() {
        if (!activeCall) return;

        if (activeCall.direction === 'incoming') {
            socket.emit('reject_call', {
                call_id: activeCall.id,
                reason: 'User rejected'
            });
        }

        resetCall();
        showNotification('Звонок отклонен', 'info');
    }

    function endCall() {
        if (!activeCall) return;

        const callDuration = callStartTime ? Math.floor((Date.now() - callStartTime) / 1000) : 0;

        socket.emit('end_call', {
            call_id: activeCall.id,
            duration: callDuration
        });

        resetCall();
    }

    function handleCallAccepted(data) {
        if (!activeCall || activeCall.id !== data.call_id) return;

        activeCall.status = 'active';
        showCallInterface('active');

        createPeerConnection();
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: activeCall.type === 'video'
        })
            .then(offer => peerConnection.setLocalDescription(offer))
            .then(() => {
                socket.emit('webrtc_signal', {
                    to: activeCall.callee,
                    call_id: activeCall.id,
                    signal: peerConnection.localDescription
                });
            });
    }

    function handleCallRejected(data) {
        if (!activeCall || activeCall.id !== data.call_id) return;
        showNotification('Пользователь отклонил звонок', 'error');
        resetCall();
    }

    function handleCallEnded(data) {
        if (!activeCall || activeCall.id !== data.call_id) return;

        const duration = data.duration || 0;
        const message = duration > 0 ?
            `Звонок завершен. Длительность: ${formatDuration(duration)}` :
            'Звонок завершен';

        showNotification(message, 'info');
        resetCall();
    }

    function handleCallTimeout(data) {
        if (!activeCall || activeCall.id !== data.call_id) return;
        showNotification('Пользователь не ответил', 'error');
        resetCall();
    }

    function handleCallError(data) {
        showNotification(`Ошибка звонка: ${data.message}`, 'error');
        resetCall();
    }

    function handleWebRTCSignal(data) {
        if (!activeCall || activeCall.id !== data.call_id || !peerConnection) return;

        const signal = data.signal;

        if (signal.type === 'offer') {
            peerConnection.setRemoteDescription(new RTCSessionDescription(signal))
                .then(() => peerConnection.createAnswer())
                .then(answer => peerConnection.setLocalDescription(answer))
                .then(() => {
                    socket.emit('webrtc_signal', {
                        to: data.from,
                        call_id: activeCall.id,
                        signal: peerConnection.localDescription
                    });
                })
                .catch(error => console.error('Ошибка обработки offer:', error));
        } else if (signal.type === 'answer') {
            peerConnection.setRemoteDescription(new RTCSessionDescription(signal))
                .catch(error => console.error('Ошибка установки answer:', error));
        }
    }

    function handleCallIceCandidate(data) {
        if (!activeCall || activeCall.id !== data.call_id || !peerConnection) return;

        const candidate = new RTCIceCandidate(data.candidate);
        peerConnection.addIceCandidate(candidate)
            .catch(error => console.error('Ошибка добавления ICE кандидата:', error));
    }

    function createPeerConnection() {
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' }
            ],
            iceCandidatePoolSize: 10
        };

        peerConnection = new RTCPeerConnection(configuration);

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                const recipient = activeCall.direction === 'outgoing' ? activeCall.callee : activeCall.caller;
                socket.emit('call_ice_candidate', {
                    to: recipient,
                    call_id: activeCall.id,
                    candidate: event.candidate
                });
            }
        };

        peerConnection.ontrack = (event) => {
            console.log('Получен удаленный поток:', event.streams[0]);
            remoteStream = event.streams[0];
            if (remoteVideo) {
                remoteVideo.srcObject = remoteStream;
                remoteVideo.onloadedmetadata = () => {
                    console.log('Удаленное видео загружено');
                    remoteVideo.play().catch(e => console.error('Ошибка воспроизведения:', e));
                };
            }
        };

        peerConnection.onconnectionstatechange = () => {
            console.log('Состояние соединения:', peerConnection.connectionState);
            if (peerConnection.connectionState === 'failed') {
                showNotification('Ошибка соединения', 'error');
                endCall();
            } else if (peerConnection.connectionState === 'connected') {
                console.log('Соединение установлено!');
            }
        };

        peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE состояние:', peerConnection.iceConnectionState);
        };
    }

    function showCallInterface(type) {
        if (!callModal) return;

        callModal.style.display = 'flex';

        if (type === 'outgoing') {
            callTitle.textContent = 'Исходящий звонок';
            callStatus.textContent = 'Звонок пользователю...';
            callWith.textContent = currentRecipientName;
            acceptCallBtn.style.display = 'none';
            rejectCallBtn.style.display = 'none';
            endCallBtn.style.display = 'block';
            muteAudioBtn.style.display = 'none';
            muteVideoBtn.style.display = 'none';

            if (localStream && activeCall.type === 'video') {
                localVideo.srcObject = localStream;
                localVideo.style.display = 'block';
            } else {
                localVideo.style.display = 'none';
            }
            remoteVideo.style.display = 'none';

        } else if (type === 'incoming') {
            callTitle.textContent = 'Входящий звонок';
            callStatus.textContent = 'Вам звонят...';
            callWith.textContent = activeCall.caller;
            acceptCallBtn.style.display = 'block';
            rejectCallBtn.style.display = 'block';
            endCallBtn.style.display = 'none';
            muteAudioBtn.style.display = 'none';
            muteVideoBtn.style.display = 'none';

            localVideo.style.display = 'none';
            remoteVideo.style.display = 'none';

        } else if (type === 'active') {
            callTitle.textContent = 'Звонок';
            callStatus.textContent = 'Разговор';
            callWith.textContent = activeCall.direction === 'outgoing' ? currentRecipientName : activeCall.caller;
            acceptCallBtn.style.display = 'none';
            rejectCallBtn.style.display = 'none';
            endCallBtn.style.display = 'block';
            muteAudioBtn.style.display = 'block';
            muteVideoBtn.style.display = activeCall.type === 'video' ? 'block' : 'none';

            if (localStream) {
                localVideo.srcObject = localStream;
                localVideo.style.display = activeCall.type === 'video' ? 'block' : 'none';
                localVideo.play().catch(e => console.error('Ошибка воспроизведения локального видео:', e));
            }
            remoteVideo.style.display = activeCall.type === 'video' ? 'block' : 'none';

            startCallTimer();
        }
    }

    function startCallTimer() {
        callStartTime = Date.now();
        if (callTimer) clearInterval(callTimer);

        callTimer = setInterval(() => {
            const elapsed = Date.now() - callStartTime;
            const minutes = Math.floor(elapsed / 60000);
            const seconds = Math.floor((elapsed % 60000) / 1000);
            const timerStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            if (callTimerElement) {
                callTimerElement.textContent = timerStr;
            }
        }, 1000);
    }

    function toggleMuteAudio() {
        if (!localStream) return;

        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            isMuted = !audioTrack.enabled;

            if (muteAudioBtn) {
                muteAudioBtn.innerHTML = isMuted ?
                    '<i class="fas fa-microphone-slash"></i>' :
                    '<i class="fas fa-microphone"></i>';
            }
        }
    }

    function toggleMuteVideo() {
        if (!localStream || activeCall.type !== 'video') return;

        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            isVideoMuted = !videoTrack.enabled;

            if (muteVideoBtn) {
                muteVideoBtn.innerHTML = isVideoMuted ?
                    '<i class="fas fa-video-slash"></i>' :
                    '<i class="fas fa-video"></i>';
            }
        }
    }

    function resetCall() {
        if (callTimer) {
            clearInterval(callTimer);
            callTimer = null;
        }

        callStartTime = null;

        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }

        if (remoteStream) {
            remoteStream.getTracks().forEach(track => track.stop());
            remoteStream = null;
        }

        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }

        activeCall = null;
        isMuted = false;
        isVideoMuted = false;

        if (callModal) {
            callModal.style.display = 'none';
        }
    }

    // ============ ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ============
    function updateOnlineStatus(username, isOnline) {
        const statusIndicator = document.getElementById(`status-${username}`);
        const headerStatusIndicator = document.getElementById(`header-status-${username}`);
        const headerStatusText = document.getElementById(`header-status-text-${username}`);

        if (statusIndicator) statusIndicator.classList.toggle('online', isOnline);
        if (headerStatusIndicator) headerStatusIndicator.classList.toggle('online', isOnline);
        if (headerStatusText) {
            const status = isOnline ? 'онлайн' : 'офлайн';
            const iconColor = isOnline ? '#10b981' : '#94a3b8';
            headerStatusText.innerHTML = `<i class="fas fa-circle" style="color: ${iconColor}"></i> ${status}`;
        }

        updateOnlineCount();
    }

    function checkOnlineStatus(username) {
        fetch('/get_online_status')
            .then(response => response.json())
            .then(onlineUsers => {
                const userStatus = onlineUsers[username];
                if (userStatus) {
                    updateOnlineStatus(username, userStatus.online);
                }
            })
            .catch(console.error);
    }

    function updateOnlineCount() {
        const onlineItems = document.querySelectorAll('.status-indicator.online');
        const count = onlineItems.length;
        if (onlineCount) onlineCount.textContent = `${count}`;
    }

    function updateLastMessagePreview(message) {
        const contactItem = document.querySelector(`.contact-item[data-username="${message.sender}"]`);
        if (contactItem) {
            const previewElement = contactItem.querySelector('.contact-preview');
            if (previewElement) {
                let shortMessage = '';
                if (message.type === 'image') shortMessage = '📷 Изображение';
                else if (message.type === 'video') shortMessage = '🎬 Видео';
                else if (message.type === 'audio') shortMessage = '🎵 Аудио';
                else if (message.type === 'file') shortMessage = '📎 Файл';
                else if (message.type === 'sticker') shortMessage = '😊 Стикер';
                else shortMessage = message.message.length > 30 ? message.message.substring(0, 30) + '...' : message.message;

                previewElement.textContent = shortMessage;
            }
        }
    }

    function toggleBlockUser() {
        if (!currentRecipient) return;

        const isBlocked = confirm(`Вы уверены, что хотите заблокировать пользователя @${currentRecipient}?`);

        if (isBlocked) {
            fetch('/api/block_user', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username: currentRecipient })
            })
            .then(response => response.json())
            .then(result => {
                if (result.success) {
                    showNotification(result.message, 'success');
                    updateChatHeader();
                    loadContacts();
                } else {
                    showNotification(result.message, 'error');
                }
            });
        }
    }

    function scrollToBottom() {
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

    function playMessageSound() {
        try {
            const audio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==');
            audio.volume = 0.1;
            audio.play();
        } catch (e) {}
    }

    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;

        let icon = 'info-circle';
        if (type === 'success') icon = 'check-circle';
        if (type === 'error') icon = 'exclamation-circle';

        notification.innerHTML = `
            <i class="fas fa-${icon}"></i>
            <span>${message}</span>
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('show');
        }, 10);

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    function formatTime(timestamp) {
        if (!timestamp) return '';
        try {
            const date = new Date(timestamp);
            const now = new Date();

            if (date.toDateString() === now.toDateString()) {
                return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }

            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            if (date.toDateString() === yesterday.toDateString()) {
                return 'Вчера';
            }

            const diff = now - date;
            if (diff < 7 * 24 * 60 * 60 * 1000) {
                const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
                return days[date.getDay()];
            }

            return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
        } catch (e) {
            return '';
        }
    }

    function formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // ============ ОТСЛЕЖИВАНИЕ ФОКУСА ОКНА ============
    function initWindowFocusTracking() {
        window.addEventListener('focus', () => {
            isWindowFocused = true;
        });

        window.addEventListener('blur', () => {
            isWindowFocused = false;
        });

        // Также отслеживаем видимость страницы
        document.addEventListener('visibilitychange', () => {
            isWindowFocused = !document.hidden;
        });
    }

    // ============ ГЛОБАЛЬНЫЕ ФУНКЦИИ ДЛЯ МЕДИА ============
    window.openMediaViewer = function(url, type) {
        const viewer = document.createElement('div');
        viewer.className = 'media-viewer';
        viewer.innerHTML = `
            <div class="media-viewer-content">
                <button class="close-viewer" onclick="window.closeMediaViewer()">
                    <i class="fas fa-times"></i>
                </button>
                ${type === 'image'
                    ? `<img src="${url}" alt="Изображение">`
                    : `<video controls autoplay>
                          <source src="${url}" type="video/mp4">
                       </video>`
                }
            </div>
        `;
        document.body.appendChild(viewer);
    };

    window.closeMediaViewer = function() {
        const viewer = document.querySelector('.media-viewer');
        if (viewer) {
            document.body.removeChild(viewer);
        }
    };

    // ============ ИНИЦИАЛИЗАЦИЯ ============
    initWebSocket();
    initSearch();
    initMessageForm();
    initCallSystem();
    initStickers();
    initWindowFocusTracking();

    // Загрузка контактов
    loadContacts();

    // Клики по контактам
    if (contactsList) {
        contactsList.addEventListener('click', (e) => {
            const contactItem = e.target.closest('.contact-item');
            if (contactItem) {
                const username = contactItem.dataset.username;
                const name = contactItem.querySelector('h4').textContent;
                const color = contactItem.dataset.color || '#4ECDC4';
                openChat(username, name, color);
            }
        });
    }

    // Кнопка "Найти пользователя"
    const startNewChatBtn = document.getElementById('start-new-chat');
    if (startNewChatBtn) {
        startNewChatBtn.addEventListener('click', () => {
            if (searchInput) searchInput.focus();
        });
    }

    console.log('Kildear Messenger инициализирован');
});