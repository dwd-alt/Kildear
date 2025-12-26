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

    // Переменные для звонков
    let activeCall = null;
    let peerConnection = null;
    let localStream = null;
    let remoteStream = null;
    let callTimer = null;
    let callStartTime = null;
    let isMuted = false;
    let isVideoMuted = false;

    // Переменные для шифрования
    let encryptionKey = null;
    let encryptionEnabled = false;

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
    const photoInput = document.getElementById('photo-input');
    const videoInput = document.getElementById('video-input');
    const attachmentPreview = document.getElementById('attachment-preview');
    const previewImage = document.getElementById('preview-image');
    const previewVideo = document.getElementById('preview-video');
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

    // Элементы для шифрования
    const encryptionStatus = document.getElementById('encryption-status');
    const encryptionIndicator = document.createElement('div');
    encryptionIndicator.className = 'encryption-indicator';
    encryptionIndicator.innerHTML = '<i class="fas fa-lock"></i> End-to-End шифрование';

    // ============ ШИФРОВАНИЕ ============
    class EncryptionManager {
        constructor() {
            this.key = null;
            this.iv = null;
            this.enabled = false;
        }

        async init(username) {
            try {
                // Генерируем ключ на основе username и secret salt
                const salt = await this.getUserSalt(username);
                const keyMaterial = await window.crypto.subtle.importKey(
                    'raw',
                    new TextEncoder().encode(username + '_kildear_secret_2024'),
                    { name: 'PBKDF2' },
                    false,
                    ['deriveKey']
                );

                this.key = await window.crypto.subtle.deriveKey(
                    {
                        name: 'PBKDF2',
                        salt: salt,
                        iterations: 100000,
                        hash: 'SHA-256'
                    },
                    keyMaterial,
                    { name: 'AES-GCM', length: 256 },
                    true,
                    ['encrypt', 'decrypt']
                );

                this.enabled = true;
                console.log('✅ Шифрование инициализировано');
                this.showEncryptionStatus(true);

                // Сохраняем ключ в localStorage для восстановления
                localStorage.setItem('encryption_key_' + username, await this.exportKey());

                return true;
            } catch (error) {
                console.error('Ошибка инициализации шифрования:', error);
                this.showEncryptionStatus(false);
                return false;
            }
        }

        async getUserSalt(username) {
            // Генерируем salt на основе username
            const encoder = new TextEncoder();
            const data = encoder.encode(username + '_kildear_salt');
            const hash = await window.crypto.subtle.digest('SHA-256', data);
            return new Uint8Array(hash.slice(0, 16));
        }

        async exportKey() {
            const exported = await window.crypto.subtle.exportKey('raw', this.key);
            return btoa(String.fromCharCode(...new Uint8Array(exported)));
        }

        async importKey(base64Key) {
            const keyData = Uint8Array.from(atob(base64Key), c => c.charCodeAt(0));
            return await window.crypto.subtle.importKey(
                'raw',
                keyData,
                { name: 'AES-GCM', length: 256 },
                true,
                ['encrypt', 'decrypt']
            );
        }

        async encrypt(text) {
            if (!this.enabled || !this.key) return text;

            try {
                this.iv = window.crypto.getRandomValues(new Uint8Array(12));
                const encoder = new TextEncoder();
                const data = encoder.encode(text);

                const encrypted = await window.crypto.subtle.encrypt(
                    {
                        name: 'AES-GCM',
                        iv: this.iv
                    },
                    this.key,
                    data
                );

                // Объединяем iv и зашифрованные данные
                const encryptedArray = new Uint8Array(encrypted);
                const result = new Uint8Array(this.iv.length + encryptedArray.length);
                result.set(this.iv);
                result.set(encryptedArray, this.iv.length);

                return btoa(String.fromCharCode(...result));
            } catch (error) {
                console.error('Ошибка шифрования:', error);
                return text;
            }
        }

        async decrypt(encryptedBase64) {
            if (!this.enabled || !this.key) return encryptedBase64;

            try {
                const encryptedData = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));

                // Извлекаем iv (первые 12 байт)
                const iv = encryptedData.slice(0, 12);
                const data = encryptedData.slice(12);

                const decrypted = await window.crypto.subtle.decrypt(
                    {
                        name: 'AES-GCM',
                        iv: iv
                    },
                    this.key,
                    data
                );

                const decoder = new TextDecoder();
                return decoder.decode(decrypted);
            } catch (error) {
                console.error('Ошибка дешифрования:', error);
                return encryptedBase64;
            }
        }

        showEncryptionStatus(enabled) {
            if (encryptionStatus) {
                encryptionStatus.innerHTML = enabled ?
                    '<i class="fas fa-lock"></i> Сообщения зашифрованы' :
                    '<i class="fas fa-unlock"></i> Шифрование недоступно';
                encryptionStatus.className = enabled ? 'encryption-on' : 'encryption-off';
            }
        }

        generateFingerprint(username) {
            // Генерируем отпечаток ключа для верификации
            const hash = CryptoJS.SHA256(username + '_kildear_2024').toString();
            return hash.substring(0, 16).toUpperCase().match(/.{1,4}/g).join(':');
        }
    }

    // Инициализируем менеджер шифрования
    const encryptionManager = new EncryptionManager();

    // ============ ИНИЦИАЛИЗАЦИЯ ШИФРОВАНИЯ ============
    async function initEncryption() {
        if (window.crypto && window.crypto.subtle) {
            await encryptionManager.init(currentUser);

            // Показываем уведомление о шифровании
            showNotification('✅ Ваши сообщения защищены end-to-end шифрованием', 'success');

            // Добавляем индикатор в заголовок чата
            if (chatHeader) {
                chatHeader.appendChild(encryptionIndicator);
            }
        } else {
            console.warn('Шифрование не поддерживается в этом браузере');
            showNotification('⚠️ Шифрование недоступно в этом браузере', 'warning');
        }
    }

    // ============ ОСНОВНЫЕ ФУНКЦИИ ============

    // Инициализация WebSocket
    function initWebSocket() {
        socket.on('connect', () => {
            console.log('✅ Подключен к серверу');
            showNotification('Подключено к серверу', 'success');
            loadContacts();

            // Восстанавливаем последний чат
            restoreLastChat();

            // Инициализируем шифрование
            initEncryption();
        });

        socket.on('disconnect', () => {
            console.log('❌ Отключен от сервера');
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
                <button class="btn-icon" id="encryption-info-btn" title="Информация о шифровании">
                    <i class="fas fa-lock"></i>
                </button>
            </div>
        `;

        // Добавляем обработчики для кнопок в заголовке
        setTimeout(() => {
            const voiceCallBtn = document.getElementById('voice-call-btn');
            const videoCallBtn = document.getElementById('video-call-btn');
            const blockBtn = document.getElementById('block-user-btn');
            const viewProfileBtn = document.getElementById('view-profile-btn');
            const encryptionInfoBtn = document.getElementById('encryption-info-btn');

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
            if (encryptionInfoBtn) {
                encryptionInfoBtn.addEventListener('click', showEncryptionInfo);
            }
        }, 100);

        // Проверяем онлайн статус
        checkOnlineStatus(currentRecipient);
    }

    function showEncryptionInfo() {
        const fingerprint = encryptionManager.generateFingerprint(currentUser);
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3><i class="fas fa-lock"></i> Безопасность чата</h3>
                    <button class="btn-icon close-modal">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="security-info">
                        <div class="security-item">
                            <i class="fas fa-shield-alt"></i>
                            <div>
                                <h4>End-to-End Шифрование</h4>
                                <p>Все сообщения в этом чате зашифрованы с использованием алгоритма AES-256-GCM.</p>
                            </div>
                        </div>
                        <div class="security-item">
                            <i class="fas fa-key"></i>
                            <div>
                                <h4>Ключ шифрования</h4>
                                <p>Уникальный ключ генерируется на основе вашего юзернейма и никогда не покидает ваше устройство.</p>
                            </div>
                        </div>
                        <div class="security-item">
                            <i class="fas fa-fingerprint"></i>
                            <div>
                                <h4>Отпечаток ключа</h4>
                                <p class="fingerprint">${fingerprint}</p>
                                <small>Сравните этот отпечаток с собеседником для подтверждения безопасности.</small>
                            </div>
                        </div>
                        <div class="security-item">
                            <i class="fas fa-server"></i>
                            <div>
                                <h4>Конфиденциальность</h4>
                                <p>Сервер не имеет доступа к содержимому ваших сообщений. Мы не храним и не передаем ключи шифрования.С любовью разработчик Kildear</p>

                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary close-modal">Понятно</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                document.body.removeChild(modal);
            });
        });

        // Закрытие по клику вне модального окна
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
    }

    function updateActiveContact() {
        document.querySelectorAll('.contact-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.username === currentRecipient) {
                item.classList.add('active');
            }
        });
    }

    // ============ ОТПРАВКА СООБЩЕНИЙ С ШИФРОВАНИЕМ ============
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

        // Инициализация стикеров
        initStickers();
    }

    async function sendMessage() {
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

        // Шифруем текстовое сообщение
        if (messageText && !currentAttachment) {
            try {
                messageData.message = await encryptionManager.encrypt(messageText);
                messageData.encrypted = true;
            } catch (error) {
                console.error('Ошибка шифрования:', error);
                messageData.encrypted = false;
            }
        }

        // Если есть вложение
        if (currentAttachment) {
            messageData.type = currentAttachment.type;
            messageData.file_name = currentAttachment.file.name;
            messageData.file_size = currentAttachment.file.size;

            const reader = new FileReader();
            reader.onload = async function(e) {
                const base64Data = e.target.result;
                if (base64Data.length > 50 * 1024 * 1024) {
                    showNotification('Файл слишком большой (максимум 15MB)', 'error');
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

    // ============ СТИКЕРЫ ============
    function initStickers() {
        const stickerBtn = document.createElement('button');
        stickerBtn.className = 'btn-icon';
        stickerBtn.id = 'stickers-btn';
        stickerBtn.title = 'Стикеры';
        stickerBtn.innerHTML = '<i class="fas fa-smile"></i>';

        const attachmentButtons = document.querySelector('.attachment-buttons');
        if (attachmentButtons) {
            attachmentButtons.appendChild(stickerBtn);
        }

        // Создаем контейнер для стикеров
        const stickersContainer = document.createElement('div');
        stickersContainer.id = 'stickers-container';
        stickersContainer.className = 'stickers-container';

        // Список стикеров
        const stickers = {
            'emotions': ['😊', '😂', '😍', '😎', '🥰', '😘', '🤔', '🥺', '😭', '😡', '🤯', '🥳', '😇', '🤠'],
            'animals': ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸'],
            'food': ['🍕', '🍔', '🍟', '🌭', '🍿', '🧁', '🍩', '🍪', '🍫', '🍬', '🍭', '🍮', '🍯', '🍎'],
            'objects': ['📱', '💻', '🎮', '📷', '🎥', '🎧', '🎸', '🎺', '📚', '✏️', '🎨', '⚽', '🏀', '🎾'],
            'symbols': ['❤️', '💙', '💚', '💛', '💜', '🖤', '💖', '💝', '✨', '🌟', '💫', '⭐', '🔥', '🌈']
        };

        // Категории
        const categories = document.createElement('div');
        categories.className = 'sticker-categories';

        Object.keys(stickers).forEach(category => {
            const btn = document.createElement('button');
            btn.className = 'sticker-category-btn';
            btn.dataset.category = category;
            btn.innerHTML = getCategoryIcon(category);
            categories.appendChild(btn);
        });
        stickersContainer.appendChild(categories);

        // Сетка стикеров
        const grid = document.createElement('div');
        grid.className = 'stickers-grid';
        stickersContainer.appendChild(grid);

        // Добавляем в DOM
        const messageInputWrapper = document.querySelector('.message-input-wrapper');
        if (messageInputWrapper) {
            messageInputWrapper.parentNode.insertBefore(stickersContainer, messageInputWrapper);
        }

        // Показываем первую категорию
        showStickers('emotions');

        // Обработчики событий
        stickerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            stickersContainer.style.display =
                stickersContainer.style.display === 'block' ? 'none' : 'block';
        });

        categories.addEventListener('click', (e) => {
            if (e.target.classList.contains('sticker-category-btn')) {
                const category = e.target.dataset.category;
                showStickers(category);

                // Активная кнопка
                categories.querySelectorAll('.sticker-category-btn').forEach(btn => {
                    btn.classList.remove('active');
                });
                e.target.classList.add('active');
            }
        });

        // Закрытие по клику вне
        document.addEventListener('click', (e) => {
            if (!stickersContainer.contains(e.target) && e.target !== stickerBtn) {
                stickersContainer.style.display = 'none';
            }
        });
    }

    function showStickers(category) {
        const grid = document.querySelector('.stickers-grid');
        if (!grid) return;

        grid.innerHTML = '';

        const stickersList = {
            'emotions': ['😊', '😂', '😍', '😎', '🥰', '😘', '🤔', '🥺', '😭', '😡', '🤯', '🥳', '😇', '🤠'],
            'animals': ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸'],
            'food': ['🍕', '🍔', '🍟', '🌭', '🍿', '🧁', '🍩', '🍪', '🍫', '🍬', '🍭', '🍮', '🍯', '🍎'],
            'objects': ['📱', '💻', '🎮', '📷', '🎥', '🎧', '🎸', '🎺', '📚', '✏️', '🎨', '⚽', '🏀', '🎾'],
            'symbols': ['❤️', '💙', '💚', '💛', '💜', '🖤', '💖', '💝', '✨', '🌟', '💫', '⭐', '🔥', '🌈']
        };

        if (stickersList[category]) {
            stickersList[category].forEach(sticker => {
                const stickerEl = document.createElement('div');
                stickerEl.className = 'sticker-item';
                stickerEl.innerHTML = `
                    <div class="sticker-emoji">${sticker}</div>
                `;

                stickerEl.addEventListener('click', async () => {
                    sendSticker(sticker);
                    document.getElementById('stickers-container').style.display = 'none';
                });

                grid.appendChild(stickerEl);
            });
        }
    }

    function getCategoryIcon(category) {
        const icons = {
            'emotions': '😊',
            'animals': '🐶',
            'food': '🍕',
            'objects': '📱',
            'symbols': '❤️'
        };
        return icons[category] || '😊';
    }

    async function sendSticker(sticker) {
        if (!currentRecipient) {
            showNotification('Выберите чат для отправки стикера', 'info');
            return;
        }

        const messageData = {
            recipient: currentRecipient,
            message: sticker,
            type: 'sticker'
        };

        socket.emit('send_message', messageData, (response) => {
            if (response && response.error) {
                showNotification('Ошибка отправки: ' + response.error, 'error');
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

        if (removeAttachmentBtn) {
            removeAttachmentBtn.addEventListener('click', removeAttachment);
        }
    }

    function handleFileSelect(file, type) {
        if (!file) return;

        const maxSize = 15 * 1024 * 1024;
        if (file.size > maxSize) {
            showNotification('Файл слишком большой (максимум 15MB)', 'error');
            return;
        }

        let validTypes = [];
        if (type === 'image') {
            validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];
        } else if (type === 'video') {
            validTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/avi', 'video/mov'];
        }

        if (file.type && !validTypes.includes(file.type)) {
            showNotification(`Неподдерживаемый формат файла`, 'error');
            return;
        }

        currentAttachment = {
            file: file,
            type: type,
            url: URL.createObjectURL(file)
        };

        showAttachmentPreview();
    }

    function showAttachmentPreview() {
        if (!attachmentPreview || !currentAttachment) return;

        attachmentPreview.style.display = 'block';

        if (currentAttachment.type === 'image') {
            if (previewImage) {
                previewImage.style.display = 'block';
                previewImage.innerHTML = `<img src="${currentAttachment.url}" alt="Preview">`;
            }
            if (previewVideo) previewVideo.style.display = 'none';
        } else if (currentAttachment.type === 'video') {
            if (previewImage) previewImage.style.display = 'none';
            if (previewVideo) {
                previewVideo.style.display = 'block';
                previewVideo.innerHTML = `
                    <video controls>
                        <source src="${currentAttachment.url}" type="${currentAttachment.file.type}">
                    </video>
                `;
            }
        }

        if (previewInfo) {
            previewInfo.textContent = `${currentAttachment.type === 'image' ? '📷' : '🎬'} ${currentAttachment.file.name} (${formatFileSize(currentAttachment.file.size)})`;
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

    // ============ ЗАГРУЗКА И ОТОБРАЖЕНИЕ СООБЩЕНИЙ С ДЕШИФРОВАНИЕМ ============
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

    async function displayMessages(messages) {
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

        for (const message of messages) {
            await addMessageToDOM(message);
        }

        scrollToBottom();
    }

    async function addMessageToDOM(message) {
        if (!messagesContainer) return;

        const isOutgoing = message.sender === currentUser;
        const messageElement = document.createElement('div');
        messageElement.className = `message ${isOutgoing ? 'outgoing' : 'incoming'} ${message.deleted ? 'deleted' : ''}`;
        messageElement.dataset.messageId = message.id;

        const time = formatTime(message.timestamp);
        const avatarColor = isOutgoing ? currentUserColor : currentRecipientColor;
        const avatarText = isOutgoing ? currentUserName[0].toUpperCase() : currentRecipientName[0].toUpperCase();

        let messageContent = '';
        let displayMessage = message.message;

        // Дешифровываем сообщение если оно зашифровано
        if (message.encrypted && encryptionManager.enabled) {
            try {
                displayMessage = await encryptionManager.decrypt(message.message);
            } catch (error) {
                console.error('Ошибка дешифрования:', error);
                displayMessage = '🔒 [Зашифрованное сообщение]';
            }
        }

        if (message.deleted) {
            messageContent = `
                <div class="message-text deleted-text">
                    <i class="fas fa-trash"></i> Сообщение удалено${message.deleted_by !== currentUser ? ` пользователем @${message.deleted_by}` : ''}
                </div>
            `;
        } else if (message.type === 'image') {
            messageContent = `
                <div class="message-media">
                    <img src="/static/uploads/${message.file_path}" alt="Изображение" onclick="openMediaViewer('/static/uploads/${message.file_path}', 'image')">
                </div>
                ${displayMessage ? `<div class="media-caption">${escapeHtml(displayMessage)}</div>` : ''}
            `;
        } else if (message.type === 'video') {
            messageContent = `
                <div class="message-media">
                    <video controls>
                        <source src="/static/uploads/${message.file_path}" type="video/mp4">
                    </video>
                </div>
                ${displayMessage ? `<div class="media-caption">${escapeHtml(displayMessage)}</div>` : ''}
            `;
        } else if (message.type === 'sticker') {
            messageContent = `
                <div class="message-sticker">
                    <div class="sticker-emoji">${escapeHtml(displayMessage)}</div>
                </div>
            `;
        } else {
            messageContent = `<div class="message-text">${escapeHtml(displayMessage)}</div>`;
        }

        // Добавляем индикатор шифрования
        const encryptionIndicator = message.encrypted ?
            '<div class="encryption-badge"><i class="fas fa-lock"></i></div>' : '';

        messageElement.innerHTML = `
            <div class="message-avatar" style="background: ${avatarColor}">
                ${avatarText}
            </div>
            <div class="message-content">
                ${encryptionIndicator}
                <div class="message-bubble">
                    ${messageContent}
                    <div class="message-time">${time}</div>
                </div>
            </div>
        `;

        messagesContainer.appendChild(messageElement);
    }

    // ============ WEBSOCKET ОБРАБОТЧИКИ ============
    async function handleNewMessage(message) {
        if (!message) return;

        if (message.sender === currentRecipient) {
            await addMessageToDOM(message);
            allMessages.push(message);
            scrollToBottom();
            playMessageSound();
            updateLastMessagePreview(message);
        } else {
            showNewMessageNotification(message);
            loadContacts();
        }
    }

    async function handleMessageSent(message) {
        if (!message) return;

        if (message.recipient === currentRecipient) {
            await addMessageToDOM(message);
            allMessages.push(message);
            scrollToBottom();
            loadContacts();
        }
    }

    async function handleMessageEdited(data) {
        if (!data) return;

        const messageElement = document.querySelector(`[data-message-id="${data.message_id}"]`);
        if (messageElement) {
            const messageText = messageElement.querySelector('.message-text');
            if (messageText) {
                // Дешифровываем если нужно
                let newText = data.new_text;
                if (data.encrypted && encryptionManager.enabled) {
                    try {
                        newText = await encryptionManager.decrypt(data.new_text);
                    } catch (error) {
                        newText = '🔒 [Зашифрованное сообщение]';
                    }
                }
                messageText.textContent = newText;
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

    // ============ ИСПРАВЛЕННЫЕ ЗВОНКИ ============
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
            showNotification('Уже есть активный звонк', 'error');
            return;
        }

        try {
            // Запрашиваем разрешение на доступ к медиаустройствам
            const constraints = {
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: type === 'video' ? {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30 }
                } : false
            };

            localStream = await navigator.mediaDevices.getUserMedia(constraints);

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
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30 }
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
            })
            .catch(error => {
                console.error('Ошибка создания offer:', error);
                endCall();
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
                .catch(error => {
                    console.error('Ошибка обработки offer:', error);
                    endCall();
                });
        } else if (signal.type === 'answer') {
            peerConnection.setRemoteDescription(new RTCSessionDescription(signal))
                .catch(error => {
                    console.error('Ошибка установки remote description:', error);
                    endCall();
                });
        }
    }

    function handleCallIceCandidate(data) {
        if (!activeCall || activeCall.id !== data.call_id || !peerConnection) return;

        const candidate = new RTCIceCandidate(data.candidate);
        peerConnection.addIceCandidate(candidate)
            .catch(error => {
                console.error('Ошибка добавления ICE кандидата:', error);
            });
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
            iceCandidatePoolSize: 10,
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require'
        };

        peerConnection = new RTCPeerConnection(configuration);

        // Обработка ICE кандидатов
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

        // Обработка входящего потока
        peerConnection.ontrack = (event) => {
            if (!remoteStream) {
                remoteStream = new MediaStream();
            }
            event.streams[0].getTracks().forEach(track => {
                remoteStream.addTrack(track);
            });

            if (remoteVideo) {
                remoteVideo.srcObject = remoteStream;
                remoteVideo.play().catch(e => console.error('Ошибка воспроизведения видео:', e));
            }
        };

        // Обработка изменения состояния соединения
        peerConnection.onconnectionstatechange = () => {
            console.log('Состояние соединения:', peerConnection.connectionState);
            if (peerConnection.connectionState === 'failed' ||
                peerConnection.connectionState === 'disconnected' ||
                peerConnection.connectionState === 'closed') {
                console.log('Соединение прервано');
                endCall();
            }
        };

        // Обработка ICE состояния
        peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE состояние:', peerConnection.iceConnectionState);
            if (peerConnection.iceConnectionState === 'failed' ||
                peerConnection.iceConnectionState === 'disconnected' ||
                peerConnection.iceConnectionState === 'closed') {
                console.log('ICE соединение прервано');
                endCall();
            }
        };

        // Обработка ICE gathering состояния
        peerConnection.onicegatheringstatechange = () => {
            console.log('ICE gathering состояние:', peerConnection.iceGatheringState);
        };

        // Обработка сигнального состояния
        peerConnection.onsignalingstatechange = () => {
            console.log('Сигнальное состояние:', peerConnection.signalingState);
        };

        // Добавляем локальный поток
        if (localStream) {
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });
        }
    }

    function showCallInterface(type) {
        if (!callModal) return;

        callModal.style.display = 'block';

        if (type === 'outgoing') {
            callTitle.textContent = 'Исходящий звонок';
            callStatus.textContent = 'Звонок пользователю...';
            callWith.textContent = currentRecipientName;
            acceptCallBtn.style.display = 'none';
            rejectCallBtn.style.display = 'none';
            endCallBtn.style.display = 'block';
            muteAudioBtn.style.display = 'none';
            muteVideoBtn.style.display = 'none';

            if (localStream) {
                localVideo.srcObject = localStream;
                localVideo.play().catch(e => console.error('Ошибка воспроизведения локального видео:', e));
                localVideo.style.display = activeCall.type === 'video' ? 'block' : 'none';
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
                localVideo.play().catch(e => console.error('Ошибка воспроизведения локального видео:', e));
                localVideo.style.display = activeCall.type === 'video' ? 'block' : 'none';
            }

            if (remoteVideo && remoteVideo.srcObject) {
                remoteVideo.style.display = activeCall.type === 'video' ? 'block' : 'none';
            }

            startCallTimer();
        }
    }

    function startCallTimer() {
        callStartTime = Date.now();
        if (callTimer) clearInterval(callTimer);

        callTimer = setInterval(() => {
            if (callStartTime) {
                const elapsed = Date.now() - callStartTime;
                const minutes = Math.floor(elapsed / 60000);
                const seconds = Math.floor((elapsed % 60000) / 1000);
                const timerStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                if (callTimerElement) {
                    callTimerElement.textContent = timerStr;
                }
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
                muteAudioBtn.title = isMuted ? 'Включить микрофон' : 'Отключить микрофон';
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
                muteVideoBtn.title = isVideoMuted ? 'Включить камеру' : 'Отключить камеру';
            }
        }
    }

    function resetCall() {
        console.log('Сброс звонка...');

        if (callTimer) {
            clearInterval(callTimer);
            callTimer = null;
        }

        callStartTime = null;

        if (localStream) {
            localStream.getTracks().forEach(track => {
                track.stop();
            });
            localStream = null;
        }

        if (remoteStream) {
            remoteStream.getTracks().forEach(track => {
                track.stop();
            });
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

        // Очищаем видео элементы
        if (localVideo) {
            localVideo.srcObject = null;
        }
        if (remoteVideo) {
            remoteVideo.srcObject = null;
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

        setTimeout(() => notification.classList.add('show'), 10);
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.parentNode?.removeChild(notification), 300);
        }, 3000);
    }

    function showNewMessageNotification(message) {
        showNotification(`Новое сообщение от ${message.sender}`, 'info');
        playMessageSound();
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

    console.log('✅ Kildear Messenger инициализирован с шифрованием и стикерами');
});