document.addEventListener('DOMContentLoaded', function() {
    // Инициализация
    const socket = io();
    const currentUser = document.getElementById('current-user').value;
    const currentUserName = document.getElementById('current-user-name').value;
    const currentUserColor = document.getElementById('current-user-color').value;
    const isAdmin = document.getElementById('is-admin') ? document.getElementById('is-admin').value === 'true' : false;

    let currentRecipient = null;
    let currentRecipientName = '';
    let currentRecipientColor = '';
    let typingTimeout = null;
    let currentAttachment = null;
    let replyingTo = null;
    let forwardingMessage = null;
    let editingMessage = null;
    let selectedMessages = new Set();
    let pinnedMessages = [];
    let messageContextMenu = null;
    let allMessages = [];

    // Элементы DOM
    const searchInput = document.getElementById('search-input');
    const searchResults = document.getElementById('search-results');
    const messagesContainer = document.getElementById('messages-container');
    const messageForm = document.getElementById('message-form');
    const messageInput = document.getElementById('message-input');
    const typingIndicator = document.getElementById('typing-indicator');
    const typingText = document.getElementById('typing-text');
    const messageInputContainer = document.getElementById('message-input-container');
    const chatHeader = document.getElementById('chat-header');
    const onlineCount = document.getElementById('online-count');
    const contactsList = document.getElementById('contacts-list');
    const emptyContacts = document.getElementById('empty-contacts');

    // Новые элементы
    const replyPreview = document.getElementById('reply-preview');
    const forwardPreview = document.getElementById('forward-preview');
    const pinnedMessagesBtn = document.getElementById('pinned-messages-btn');
    const pinnedMessagesPanel = document.getElementById('pinned-messages-panel');
    const blockedUsersBtn = document.getElementById('blocked-users-btn');
    const blockedUsersPanel = document.getElementById('blocked-users-panel');
    const editMessageForm = document.getElementById('edit-message-form');
    const editMessageInput = document.getElementById('edit-message-input');
    const editMessageContainer = document.getElementById('edit-message-container');
    const cancelEditBtn = document.getElementById('cancel-edit');

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

        // Закрытие результатов поиска при клике вне области
        document.addEventListener('click', function(e) {
            if (searchResults && !searchResults.contains(e.target) && e.target !== searchInput) {
                searchResults.style.display = 'none';
            }
        });

        // Кнопка поиска
        document.getElementById('search-toggle')?.addEventListener('click', () => {
            searchInput.focus();
        });
    }

    function searchUsers(query) {
        fetch(`/search_users?q=${encodeURIComponent(query)}`)
            .then(response => {
                if (!response.ok) throw new Error('Network response was not ok');
                return response.json();
            })
            .then(users => {
                displaySearchResults(users);
            })
            .catch(error => {
                console.error('Search error:', error);
                showNotification('Ошибка поиска', 'error');
            });
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
                if (searchInput) searchInput.value = '';
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
            .then(chats => {
                displayContacts(chats);
            })
            .catch(error => {
                console.error('Error loading contacts:', error);
            });
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

    // ============ ОТКРЫТИЕ ЧАТА ============
    function openChat(username, name, color) {
        if (currentRecipient === username) return;

        currentRecipient = username;
        currentRecipientName = name;
        currentRecipientColor = color;

        const currentRecipientInput = document.getElementById('current-recipient');
        if (currentRecipientInput) {
            currentRecipientInput.value = username;
        }

        // Сохраняем текущий чат
        saveCurrentChat(username);

        // Обновляем заголовок чата
        updateChatHeader();

        // Показываем поле ввода
        if (messageInputContainer) {
            messageInputContainer.style.display = 'flex';
        }
        hideReplyPreview();
        hideForwardPreview();
        hideEditMessage();

        // Загружаем сообщения
        loadMessages();

        // Помечаем активный контакт
        updateActiveContact();

        // Загружаем закрепленные сообщения
        loadPinnedMessages();

        // Фокус на поле ввода
        setTimeout(() => {
            if (messageInput) messageInput.focus();
        }, 100);
    }

    // Сохранение текущего чата
    function saveCurrentChat(username) {
        fetch('/api/save_current_chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ chat_with: username })
        })
        .then(response => response.json())
        .then(data => {
            if (!data.success) {
                console.error('Error saving chat:', data.error);
            }
        })
        .catch(error => console.error('Error saving chat:', error));
    }

    // ============ ОБНОВЛЕНИЕ ЗАГОЛОВКА ЧАТА ============
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
                <button class="btn-icon" id="block-user-btn" title="${isUserBlocked(currentRecipient) ? 'Разблокировать' : 'Заблокировать'}">
                    <i class="fas ${isUserBlocked(currentRecipient) ? 'fa-unlock' : 'fa-ban'}"></i>
                </button>
                <button class="btn-icon" id="view-profile-btn" title="Просмотр профиля">
                    <i class="fas fa-user"></i>
                </button>
                ${isAdmin ? `
                <button class="btn-icon" id="admin-actions-btn" title="Админ-действия">
                    <i class="fas fa-crown"></i>
                </button>
                ` : ''}
            </div>
        `;

        // Добавляем обработчики для кнопок в заголовке
        setTimeout(() => {
            const blockBtn = document.getElementById('block-user-btn');
            const viewProfileBtn = document.getElementById('view-profile-btn');
            const adminBtn = document.getElementById('admin-actions-btn');
            const chatAvatar = document.getElementById('chat-user-avatar');
            const chatName = document.getElementById('chat-user-name');

            if (blockBtn) {
                blockBtn.addEventListener('click', toggleBlockUser);
            }

            if (viewProfileBtn) {
                viewProfileBtn.addEventListener('click', () => {
                    window.open(`/profile/${currentRecipient}`, '_blank');
                });
            }

            if (chatAvatar) {
                chatAvatar.addEventListener('click', () => {
                    window.open(`/profile/${currentRecipient}`, '_blank');
                });
            }

            if (chatName) {
                chatName.addEventListener('click', () => {
                    window.open(`/profile/${currentRecipient}`, '_blank');
                });
            }

            if (isAdmin && adminBtn) {
                adminBtn.addEventListener('click', showAdminActions);
            }
        }, 100);

        // Проверяем онлайн статус
        checkOnlineStatus(currentRecipient);
    }

    // ============ ЗАГРУЗКА СООБЩЕНИЙ ============
    function loadMessages() {
        if (!currentRecipient) return;

        fetch(`/get_messages/${currentRecipient}`)
            .then(response => response.json())
            .then(messages => {
                allMessages = messages;
                displayMessages(messages);
            })
            .catch(error => {
                console.error('Error loading messages:', error);
                showNotification('Ошибка загрузки сообщений', 'error');
            });
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

    // ============ ДОБАВЛЕНИЕ СООБЩЕНИЯ В DOM ============
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
                    <img src="/static/uploads/${message.file_path}" alt="Изображение" onclick="openMediaViewer('/static/uploads/${message.file_path}', 'image')">
                </div>
                ${message.message ? `<div class="media-caption">${escapeHtml(message.message)}</div>` : ''}
            `;
        } else if (message.type === 'video') {
            messageContent = `
                <div class="message-media">
                    <video controls>
                        <source src="/static/uploads/${message.file_path}" type="video/mp4">
                    </video>
                </div>
                ${message.message ? `<div class="media-caption">${escapeHtml(message.message)}</div>` : ''}
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

        // Добавляем превью ответа если есть
        let replyPreviewHTML = '';
        if (message.reply_to && !message.deleted) {
            const repliedMessage = allMessages.find(m => m.id === message.reply_to);
            if (repliedMessage) {
                const repliedText = repliedMessage.message ?
                    (repliedMessage.message.length > 50 ? repliedMessage.message.substring(0, 50) + '...' : repliedMessage.message) :
                    (repliedMessage.type === 'image' ? '📷 Изображение' :
                     repliedMessage.type === 'video' ? '🎬 Видео' :
                     repliedMessage.type === 'sticker' ? '😊 Стикер' : '...');

                replyPreviewHTML = `
                    <div class="reply-preview" data-reply-to="${message.reply_to}">
                        <div class="reply-line"></div>
                        <div class="reply-content">
                            <strong>${repliedMessage.sender === currentUser ? 'Вы' : currentRecipientName}</strong>
                            <p>${escapeHtml(repliedText)}</p>
                        </div>
                    </div>
                `;
            }
        }

        // Добавляем метку пересланного сообщения
        let forwardLabelHTML = '';
        if (message.forward_from && !message.deleted) {
            forwardLabelHTML = `
                <div class="forward-label">
                    <i class="fas fa-share"></i> Переслано от @${message.forward_from}
                </div>
            `;
        }

        // Добавляем метку редактирования
        let editLabelHTML = '';
        if (message.edited && !message.deleted) {
            const editTime = message.edited_at ? formatTime(message.edited_at) : '';
            editLabelHTML = `
                <div class="edit-label" title="Изменено ${editTime}">
                    <i class="fas fa-pencil-alt"></i> Изменено
                </div>
            `;
        }

        messageElement.innerHTML = `
            <div class="message-avatar" style="background: ${avatarColor}">
                ${avatarText}
            </div>
            <div class="message-content">
                ${forwardLabelHTML}
                ${replyPreviewHTML}
                <div class="message-bubble">
                    ${messageContent}
                    ${editLabelHTML}
                    <div class="message-time">
                        ${time}
                        ${message.edited ? ' (изм.)' : ''}
                    </div>
                </div>
            </div>
        `;

        messagesContainer.appendChild(messageElement);

        // Добавляем обработчики для контекстного меню
        addContextMenuToMessage(messageElement, message, isOutgoing);
    }

    // Добавление контекстного меню к сообщению
    function addContextMenuToMessage(messageElement, message, isOutgoing) {
        if (message.deleted) return;

        // Обработчик для правой кнопки мыши
        messageElement.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            showMessageContextMenu(e, message, isOutgoing);
        });

        // Для мобильных устройств - долгое нажатие
        let touchTimer;
        messageElement.addEventListener('touchstart', function(e) {
            touchTimer = setTimeout(() => {
                if (e.touches.length === 1) {
                    const touch = e.touches[0];
                    showMessageContextMenu({
                        clientX: touch.clientX,
                        clientY: touch.clientY,
                        preventDefault: () => {}
                    }, message, isOutgoing);
                }
            }, 500);
        });

        messageElement.addEventListener('touchend', function() {
            clearTimeout(touchTimer);
        });

        messageElement.addEventListener('touchmove', function() {
            clearTimeout(touchTimer);
        });
    }

    // Показать контекстное меню для сообщения
    function showMessageContextMenu(event, message, isOutgoing) {
        // Удаляем старое меню, если есть
        if (messageContextMenu) {
            document.body.removeChild(messageContextMenu);
        }

        messageContextMenu = document.createElement('div');
        messageContextMenu.className = 'context-menu';
        messageContextMenu.style.position = 'fixed';
        messageContextMenu.style.left = event.clientX + 'px';
        messageContextMenu.style.top = event.clientY + 'px';
        messageContextMenu.style.zIndex = '10000';

        const menuItems = [
            { icon: 'fa-reply', text: 'Ответить', action: () => showReplyPreview(message) },
            { icon: 'fa-share', text: 'Переслать', action: () => showForwardDialog(message) },
            { icon: 'fa-thumbtack', text: 'Закрепить', action: () => togglePinMessage(message.id) },
            { icon: 'fa-trash', text: 'Удалить', action: () => deleteMessage(message.id) }
        ];

        if (isOutgoing) {
            menuItems.splice(2, 0, { icon: 'fa-edit', text: 'Изменить', action: () => startEditMessage(message) });
        }

        let menuHTML = '<div class="context-menu-content">';
        menuItems.forEach(item => {
            menuHTML += `
                <div class="context-menu-item" data-action="${item.text}">
                    <i class="fas ${item.icon}"></i>
                    <span>${item.text}</span>
                </div>
            `;
        });
        menuHTML += '</div>';

        messageContextMenu.innerHTML = menuHTML;
        document.body.appendChild(messageContextMenu);

        // Назначаем обработчики для каждого пункта меню
        menuItems.forEach(item => {
            const menuItem = messageContextMenu.querySelector(`[data-action="${item.text}"]`);
            if (menuItem) {
                menuItem.addEventListener('click', () => {
                    item.action();
                    if (messageContextMenu) {
                        document.body.removeChild(messageContextMenu);
                        messageContextMenu = null;
                    }
                });
            }
        });

        // Закрытие меню при клике вне его
        setTimeout(() => {
            function closeMenu(e) {
                if (messageContextMenu && !messageContextMenu.contains(e.target)) {
                    document.body.removeChild(messageContextMenu);
                    messageContextMenu = null;
                    document.removeEventListener('click', closeMenu);
                    document.removeEventListener('touchstart', closeMenu);
                }
            }

            document.addEventListener('click', closeMenu);
            document.addEventListener('touchstart', closeMenu);
        }, 10);
    }

    // ============ ОТВЕТ НА СООБЩЕНИЕ ============
    function showReplyPreview(message) {
        if (!replyPreview) return;

        replyingTo = message.id;

        let previewText = message.message ?
            (message.message.length > 100 ? message.message.substring(0, 100) + '...' : message.message) :
            (message.type === 'image' ? '📷 Изображение' :
             message.type === 'video' ? '🎬 Видео' :
             message.type === 'sticker' ? '😊 Стикер' : '...');

        replyPreview.innerHTML = `
            <div class="reply-preview-header">
                <span>Ответ на сообщение</span>
                <button class="btn-icon btn-close-reply" id="close-reply">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="reply-preview-content">
                <strong>${message.sender === currentUser ? 'Вы' : currentRecipientName}</strong>
                <p>${escapeHtml(previewText)}</p>
            </div>
        `;

        replyPreview.style.display = 'block';

        const closeBtn = document.getElementById('close-reply');
        if (closeBtn) {
            closeBtn.addEventListener('click', hideReplyPreview);
        }

        if (messageInput) messageInput.focus();
    }

    function hideReplyPreview() {
        if (!replyPreview) return;

        replyPreview.style.display = 'none';
        replyingTo = null;
    }

    // ============ ПЕРЕСЫЛКА СООБЩЕНИЯ ============
    function showForwardDialog(message) {
        forwardingMessage = message;

        // Создаем модальное окно для выбора получателя
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Переслать сообщение</h3>
                    <button class="btn-icon close-modal">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="forward-message-preview">
                        <div class="message-preview">
                            <strong>${message.sender === currentUser ? 'Вы' : 'Пользователь'}</strong>
                            <p>${message.message ? escapeHtml(message.message.substring(0, 100)) :
                               (message.type === 'image' ? '📷 Изображение' :
                                message.type === 'video' ? '🎬 Видео' :
                                message.type === 'sticker' ? '😊 Стикер' : '...')}</p>
                        </div>
                    </div>
                    <div class="search-recipient">
                        <input type="text" id="forward-search" placeholder="Поиск пользователя...">
                        <div id="forward-results" class="search-results"></div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline close-modal">Отмена</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Обработчики закрытия
        modal.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                document.body.removeChild(modal);
                forwardingMessage = null;
            });
        });

        // Поиск пользователей
        const searchInput = modal.querySelector('#forward-search');
        const resultsContainer = modal.querySelector('#forward-results');

        if (searchInput) {
            searchInput.addEventListener('input', debounce((e) => {
                const query = e.target.value.trim();

                if (query.length < 2) {
                    if (resultsContainer) {
                        resultsContainer.style.display = 'none';
                    }
                    return;
                }

                searchUsersForForward(query, resultsContainer, modal);
            }, 300));

            searchInput.focus();
        }
    }

    function searchUsersForForward(query, resultsContainer, modal) {
        fetch(`/search_users?q=${encodeURIComponent(query)}`)
            .then(response => response.json())
            .then(users => {
                if (!resultsContainer) return;

                if (!users || users.length === 0) {
                    resultsContainer.innerHTML = '<div class="no-results">Пользователи не найдены</div>';
                    resultsContainer.style.display = 'block';
                    return;
                }

                resultsContainer.innerHTML = '';
                users.forEach(user => {
                    const userElement = document.createElement('div');
                    userElement.className = 'contact-item';
                    userElement.innerHTML = `
                        <div class="contact-avatar" style="background: ${user.avatar_color || '#4ECDC4'}">
                            ${user.avatar ? `<img src="${user.avatar}" alt="${user.name}">` : user.name[0].toUpperCase()}
                        </div>
                        <div class="contact-info">
                            <div class="contact-name-row">
                                <h4>${escapeHtml(user.name)}</h4>
                            </div>
                            <p class="contact-preview">
                                @${escapeHtml(user.username)}
                            </p>
                        </div>
                    `;

                    userElement.addEventListener('click', () => {
                        forwardMessageToUser(user.username);
                        document.body.removeChild(modal);
                        forwardingMessage = null;
                    });

                    resultsContainer.appendChild(userElement);
                });

                resultsContainer.style.display = 'block';
            })
            .catch(error => {
                console.error('Search error:', error);
                showNotification('Ошибка поиска', 'error');
            });
    }

    function forwardMessageToUser(recipient) {
        if (!forwardingMessage) return;

        const messageData = {
            recipient: recipient,
            message: forwardingMessage.message || '',
            type: forwardingMessage.type || 'text',
            forward_from: forwardingMessage.sender === currentUser ? null : forwardingMessage.sender
        };

        // Если есть медиафайл
        if (forwardingMessage.file_path) {
            showNotification('Пересылка медиафайлов пока недоступна', 'info');
            return;
        }

        const sendBtn = document.querySelector('.btn-send');
        if (!sendBtn) return;

        const originalIcon = sendBtn.innerHTML;
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        sendBtn.disabled = true;

        socket.emit('send_message', messageData, (response) => {
            sendBtn.innerHTML = originalIcon;
            sendBtn.disabled = false;

            if (response && response.error) {
                showNotification(`Ошибка: ${response.error}`, 'error');
            } else {
                showNotification(`Сообщение переслано пользователю @${recipient}`, 'success');
            }
        });
    }

    // ============ РЕДАКТИРОВАНИЕ СООБЩЕНИЯ ============
    function startEditMessage(message) {
        if (!editMessageContainer || !editMessageInput) return;

        editingMessage = message.id;
        editMessageInput.value = message.message || '';
        editMessageContainer.style.display = 'flex';
        editMessageInput.focus();

        // Прокручиваем к форме редактирования
        editMessageContainer.scrollIntoView({ behavior: 'smooth' });
    }

    function hideEditMessage() {
        if (!editMessageContainer || !editMessageInput) return;

        editingMessage = null;
        editMessageContainer.style.display = 'none';
        editMessageInput.value = '';
    }

    function sendEditedMessage() {
        if (!editMessageInput) return;

        const newText = editMessageInput.value.trim();

        if (!newText || !editingMessage) {
            showNotification('Введите текст сообщения', 'info');
            return;
        }

        fetch('/api/edit_message', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message_id: editingMessage,
                new_text: newText
            })
        })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                showNotification('Сообщение изменено', 'success');
                hideEditMessage();
            } else {
                showNotification(result.message || 'Ошибка изменения', 'error');
            }
        })
        .catch(error => {
            console.error('Error editing message:', error);
            showNotification('Ошибка соединения', 'error');
        });
    }

    // ============ ЗАКРЕПЛЕНИЕ СООБЩЕНИЙ ============
    function togglePinMessage(messageId) {
        // Проверяем, закреплено ли уже сообщение
        if (pinnedMessages.includes(messageId)) {
            // Открепляем
            fetch('/api/unpin_message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message_id: messageId
                })
            })
            .then(response => response.json())
            .then(result => {
                if (result.success) {
                    showNotification('Сообщение откреплено', 'success');
                    pinnedMessages = pinnedMessages.filter(id => id !== messageId);
                } else {
                    showNotification(result.message || 'Ошибка', 'error');
                }
            });
        } else {
            // Закрепляем
            fetch('/api/pin_message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message_id: messageId
                })
            })
            .then(response => response.json())
            .then(result => {
                if (result.success) {
                    showNotification('Сообщение закреплено', 'success');
                    pinnedMessages.push(messageId);
                } else {
                    showNotification(result.message || 'Ошибка', 'error');
                }
            });
        }
    }

    function loadPinnedMessages() {
        fetch('/api/get_pinned_messages')
            .then(response => response.json())
            .then(messages => {
                // Здесь можно добавить отображение в специальной панели
                console.log('Закрепленные сообщения:', messages);
            })
            .catch(error => {
                console.error('Error loading pinned messages:', error);
            });
    }

    // ============ УДАЛЕНИЕ СООБЩЕНИЙ ============
    function deleteMessage(messageId) {
        const deleteForEveryone = confirm('Удалить для всех? (Админы могут удалять любые сообщения)');

        socket.emit('delete_message', {
            message_id: messageId,
            delete_for_everyone: deleteForEveryone || isAdmin
        });
    }

    // ============ БЛОКИРОВКА ПОЛЬЗОВАТЕЛЕЙ ============
    function toggleBlockUser() {
        if (!currentRecipient) return;

        const isBlocked = isUserBlocked(currentRecipient);

        if (isBlocked) {
            // Разблокировать
            if (!confirm(`Разблокировать пользователя @${currentRecipient}?`)) return;

            fetch('/api/unblock_user', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username: currentRecipient
                })
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
        } else {
            // Заблокировать
            if (!confirm(`Заблокировать пользователя @${currentRecipient}? Вы больше не сможете общаться с ним.`)) return;

            fetch('/api/block_user', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username: currentRecipient
                })
            })
            .then(response => response.json())
            .then(result => {
                if (result.success) {
                    showNotification(result.message, 'success');
                    updateChatHeader();
                    loadContacts();

                    // Закрываем чат если он открыт
                    if (currentRecipient) {
                        closeCurrentChat();
                    }
                } else {
                    showNotification(result.message, 'error');
                }
            });
        }
    }

    function isUserBlocked(username) {
        // В реальном приложении здесь нужно сделать запрос на сервер
        // Для простоты возвращаем false
        return false;
    }

    // ============ ЗАКРЫТИЕ ЧАТА ============
    function closeCurrentChat() {
        currentRecipient = null;
        currentRecipientName = '';
        currentRecipientColor = '';

        if (messageInputContainer) {
            messageInputContainer.style.display = 'none';
        }

        if (chatHeader) {
            chatHeader.innerHTML = `
                <div class="empty-chat">
                    <div class="empty-icon">
                        <i class="fas fa-comment-dots"></i>
                    </div>
                    <h2>Kildear Messenger</h2>
                    <p>Выберите чат для начала общения</p>
                    <button class="btn btn-outline" id="start-new-chat">
                        <i class="fas fa-search"></i> Найти пользователя
                    </button>
                </div>
            `;
        }

        if (messagesContainer) {
            messagesContainer.innerHTML = '';
        }

        hideReplyPreview();
        hideForwardPreview();
        hideEditMessage();

        // Добавляем обработчик для кнопки нового чата
        setTimeout(() => {
            const startChatBtn = document.getElementById('start-new-chat');
            if (startChatBtn) {
                startChatBtn.addEventListener('click', () => {
                    if (searchInput) searchInput.focus();
                });
            }
        }, 100);
    }

    // ============ АДМИН-ПАНЕЛЬ ============
    function showAdminActions() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3><i class="fas fa-crown"></i> Админ-панель</h3>
                    <button class="btn-icon close-modal">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="admin-actions">
                        <button class="btn btn-outline btn-block" id="admin-block-user">
                            <i class="fas fa-ban"></i> Заблокировать пользователя
                        </button>
                        <button class="btn btn-outline btn-block" id="admin-rename-user">
                            <i class="fas fa-pencil-alt"></i> Изменить имя пользователя
                        </button>
                        <button class="btn btn-outline btn-block" id="admin-view-messages">
                            <i class="fas fa-envelope"></i> Просмотреть сообщения
                        </button>
                        <button class="btn btn-outline btn-block" id="admin-delete-messages">
                            <i class="fas fa-trash"></i> Удалить все сообщения
                        </button>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-outline close-modal">Закрыть</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Обработчики закрытия
        modal.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                document.body.removeChild(modal);
            });
        });

        // Обработчики действий
        const adminBlockBtn = modal.querySelector('#admin-block-user');
        const adminRenameBtn = modal.querySelector('#admin-rename-user');
        const adminViewBtn = modal.querySelector('#admin-view-messages');
        const adminDeleteBtn = modal.querySelector('#admin-delete-messages');

        if (adminBlockBtn) {
            adminBlockBtn.addEventListener('click', () => {
                const block = confirm(`Заблокировать пользователя @${currentRecipient} на всем сервере?`);
                if (block) {
                    showNotification('Функция глобальной блокировки в разработке', 'info');
                }
            });
        }

        if (adminRenameBtn) {
            adminRenameBtn.addEventListener('click', () => {
                const newName = prompt(`Введите новое имя для пользователя @${currentRecipient}:`, currentRecipientName);
                if (newName && newName.trim() !== currentRecipientName) {
                    showNotification('Функция изменения имени в разработке', 'info');
                }
            });
        }

        if (adminViewBtn) {
            adminViewBtn.addEventListener('click', () => {
                showNotification(`Просмотр сообщений пользователя @${currentRecipient} доступен в админ-консоли сервера`, 'info');
            });
        }

        if (adminDeleteBtn) {
            adminDeleteBtn.addEventListener('click', () => {
                const confirmDelete = confirm(`УДАЛИТЬ ВСЕ СООБЩЕНИЯ с пользователем @${currentRecipient}? Это действие нельзя отменить!`);
                if (confirmDelete) {
                    showNotification('Функция удаления сообщений в разработке', 'info');
                }
            });
        }
    }

    // ============ ИНИЦИАЛИЗАЦИЯ ВЛОЖЕНИЙ ============
    function initAttachments() {
        // Фото
        if (attachPhotoBtn && photoInput) {
            attachPhotoBtn.addEventListener('click', () => {
                photoInput.click();
            });

            photoInput.addEventListener('change', (e) => {
                handleFileSelect(e.target.files[0], 'image');
            });
        }

        // Видео
        if (attachVideoBtn && videoInput) {
            attachVideoBtn.addEventListener('click', () => {
                videoInput.click();
            });

            videoInput.addEventListener('change', (e) => {
                handleFileSelect(e.target.files[0], 'video');
            });
        }

        // Удаление вложения
        if (removeAttachmentBtn) {
            removeAttachmentBtn.addEventListener('click', removeAttachment);
        }

        // Отмена редактирования
        if (cancelEditBtn) {
            cancelEditBtn.addEventListener('click', hideEditMessage);
        }

        // Форма редактирования
        if (editMessageForm) {
            editMessageForm.addEventListener('submit', (e) => {
                e.preventDefault();
                sendEditedMessage();
            });
        }
    }

    function handleFileSelect(file, type) {
        if (!file) return;

        // Проверка размера файла
        const maxSize = 15 * 1024 * 1024; // 15MB
        if (file.size > maxSize) {
            showNotification('Файл слишком большой (максимум 15MB)', 'error');
            return;
        }

        // Проверка типа файла
        let validTypes = [];
        if (type === 'image') {
            validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];
        } else if (type === 'video') {
            validTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/avi', 'video/mov'];
        }

        if (file.type && !validTypes.includes(file.type)) {
            showNotification(`Неподдерживаемый формат файла. Используйте: ${validTypes.join(', ')}`, 'error');
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
            if (previewInfo) {
                previewInfo.textContent = `📷 ${currentAttachment.file.name} (${formatFileSize(currentAttachment.file.size)})`;
            }
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
            if (previewInfo) {
                previewInfo.textContent = `🎬 ${currentAttachment.file.name} (${formatFileSize(currentAttachment.file.size)})`;
            }
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

    // ============ ИНИЦИАЛИЗАЦИЯ ФОРМЫ СООБЩЕНИЯ ============
    function initMessageForm() {
        if (!messageForm || !messageInput) return;

        messageForm.addEventListener('submit', (e) => {
            e.preventDefault();
            sendMessage();
        });

        messageInput.addEventListener('input', () => {
            if (!currentRecipient) return;

            // Отправляем статус "печатает"
            socket.emit('typing', {
                recipient: currentRecipient,
                is_typing: true
            });

            // Сбрасываем таймер
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => {
                socket.emit('typing', {
                    recipient: currentRecipient,
                    is_typing: false
                });
            }, 1000);
        });

        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    function sendMessage() {
        const messageText = messageInput ? messageInput.value.trim() : '';

        if ((!messageText && !currentAttachment) || !currentRecipient) {
            showNotification('Введите сообщение или прикрепите файл', 'info');
            return;
        }

        // Проверяем подключение
        if (!socket.connected) {
            showNotification('Нет подключения к серверу', 'error');
            return;
        }

        let messageData = {
            recipient: currentRecipient,
            message: messageText || '',
            type: 'text',
            reply_to: replyingTo
        };

        // Если есть вложение
        if (currentAttachment) {
            messageData.type = currentAttachment.type;
            messageData.file_name = currentAttachment.file.name;
            messageData.file_size = currentAttachment.file.size;

            // Читаем файл как base64 с проверкой размера
            const reader = new FileReader();
            reader.onload = function(e) {
                const base64Data = e.target.result;

                // Проверяем размер base64 данных
                if (base64Data.length > 50 * 1024 * 1024) { // ~50MB
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
                console.error('File reading error:', error);
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
        const sendBtn = document.querySelector('.btn-send');
        const originalIcon = sendBtn.innerHTML;
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        sendBtn.disabled = true;

        socket.emit('send_message', messageData, (response) => {
            sendBtn.innerHTML = originalIcon;
            sendBtn.disabled = false;

            if (response && response.error) {
                showNotification('Ошибка отправки: ' + response.error, 'error');
            } else {
                if (messageInput) messageInput.value = '';
                removeAttachment();
                hideReplyPreview();
                hideEditMessage();

                // Обновляем контакты
                loadContacts();
            }
        });
    }

    // ============ WEBSOCKET ============
    function initWebSocket() {
        socket.on('connect', () => {
            console.log('✓ Подключен к серверу');
            showNotification('Подключено к серверу', 'success');
            loadContacts();

            // Восстанавливаем сохраненный чат
            restoreSavedChat();
        });

        socket.on('disconnect', () => {
            console.log('✗ Отключен от сервера');
            showNotification('Нет подключения к серверу', 'error');
        });

        socket.on('connect_error', (error) => {
            console.error('Ошибка подключения:', error);
            showNotification('Ошибка подключения к серверу', 'error');
        });

        socket.on('error', (error) => {
            console.error('WebSocket ошибка:', error);
            showNotification('Ошибка сервера: ' + error, 'error');
        });

        socket.on('user_status', handleUserStatus);
        socket.on('new_message', handleNewMessage);
        socket.on('message_sent', handleMessageSent);
        socket.on('user_typing', handleUserTyping);
        socket.on('message_edited', handleMessageEdited);
        socket.on('message_deleted', handleMessageDeleted);
    }

    function handleNewMessage(message) {
        if (!message) return;

        if (message.sender === currentRecipient) {
            addMessageToDOM(message);
            allMessages.push(message);
            scrollToBottom();
            playMessageSound();
            updateLastMessagePreview(message);
        } else {
            // Уведомление о новом сообщении от другого пользователя
            showNewMessageNotification(message);
            loadContacts();
        }
    }

    function handleMessageSent(message) {
        if (!message) return;

        // Если сообщение отправлено текущему собеседнику
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

            // Добавляем метку редактирования
            const timeElement = messageElement.querySelector('.message-time');
            if (timeElement && !timeElement.textContent.includes('(изм.)')) {
                timeElement.textContent += ' (изм.)';
            }

            // Обновляем в allMessages
            const messageIndex = allMessages.findIndex(m => m.id === data.message_id);
            if (messageIndex !== -1) {
                allMessages[messageIndex].message = data.new_text;
                allMessages[messageIndex].edited = true;
                allMessages[messageIndex].edited_at = data.edited_at;
            }
        }
    }

    function handleMessageDeleted(data) {
        if (!data) return;

        const messageElement = document.querySelector(`[data-message-id="${data.message_id}"]`);
        if (messageElement) {
            if (data.permanent) {
                // Полное удаление
                messageElement.remove();
            } else {
                // Помечаем как удаленное
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

    // ============ ОНЛАЙН СТАТУС ============
    function updateOnlineStatus(username, isOnline) {
        const statusIndicator = document.getElementById(`status-${username}`);
        const headerStatusIndicator = document.getElementById(`header-status-${username}`);
        const headerStatusText = document.getElementById(`header-status-text-${username}`);

        if (statusIndicator) {
            statusIndicator.classList.toggle('online', isOnline);
        }

        if (headerStatusIndicator) {
            headerStatusIndicator.classList.toggle('online', isOnline);
        }

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
        if (onlineCount) {
            onlineCount.textContent = `${count}`;
        }
    }

    function updateLastMessagePreview(message) {
        const contactItem = document.querySelector(`.contact-item[data-username="${message.sender}"]`);
        if (contactItem) {
            const previewElement = contactItem.querySelector('.contact-preview');
            if (previewElement) {
                let shortMessage = '';
                if (message.type === 'image') {
                    shortMessage = '📷 Изображение';
                } else if (message.type === 'video') {
                    shortMessage = '🎬 Видео';
                } else if (message.type === 'sticker') {
                    shortMessage = '😊 Стикер';
                } else {
                    shortMessage = message.message.length > 30
                        ? message.message.substring(0, 30) + '...'
                        : message.message;
                }
                previewElement.textContent = shortMessage;

                // Обновляем время
                const timeElement = contactItem.querySelector('.message-time');
                if (timeElement) {
                    timeElement.textContent = formatTime(message.timestamp);
                }
            }
        }
    }

    function updateActiveContact() {
        document.querySelectorAll('.contact-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.username === currentRecipient) {
                item.classList.add('active');
            }
        });
    }

    // Восстановление сохраненного чата
    function restoreSavedChat() {
        fetch('/api/get_saved_chat')
            .then(response => response.json())
            .then(data => {
                if (data.success && data.current_chat) {
                    // Загружаем информацию о пользователе
                    fetch(`/api/user/${data.current_chat}`)
                        .then(response => response.json())
                        .then(user => {
                            if (!user.error) {
                                // Открываем чат через 500мс, чтобы интерфейс успел загрузиться
                                setTimeout(() => {
                                    openChat(user.username, user.name, user.avatar_color);
                                }, 500);
                            }
                        })
                        .catch(error => console.error('Error loading user:', error));
                }
            })
            .catch(error => console.error('Error loading saved chat:', error));
    }

    // ============ ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ============
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
        } catch (e) {
            // Игнорируем ошибки воспроизведения звука
        }
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

        // Показываем
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);

        // Автоматическое закрытие
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
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
            const diff = now - date;

            // Если сегодня
            if (date.toDateString() === now.toDateString()) {
                return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
            // Если вчера
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            if (date.toDateString() === yesterday.toDateString()) {
                return 'Вчера';
            }
            // Если на этой неделе
            if (diff < 7 * 24 * 60 * 60 * 1000) {
                const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
                return days[date.getDay()];
            }
            // Иначе показываем дату
            return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
        } catch (e) {
            console.error('Error formatting time:', e);
            return '';
        }
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

    // Открытие медиа в полноэкранном режиме
    window.openMediaViewer = function(url, type) {
        const viewer = document.createElement('div');
        viewer.className = 'media-viewer';
        viewer.innerHTML = `
            <div class="media-viewer-content">
                <button class="close-viewer" onclick="closeMediaViewer()">
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
    initAttachments();

    // Клики по контактам
    if (contactsList) {
        contactsList.addEventListener('click', (e) => {
            const contactItem = e.target.closest('.contact-item');
            if (contactItem && !contactItem.classList.contains('search-result')) {
                const username = contactItem.dataset.username;
                const name = contactItem.querySelector('h4').textContent;
                const color = contactItem.dataset.color || '#4ECDC4';
                openChat(username, name, color);
            }
        });
    }

    // Кнопка нового чата
    const startNewChatBtn = document.getElementById('start-new-chat');
    if (startNewChatBtn) {
        startNewChatBtn.addEventListener('click', () => {
            if (searchInput) searchInput.focus();
        });
    }

    // Запрос разрешения на уведомления
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }

    // Загружаем онлайн статусы
    setTimeout(() => {
        fetch('/get_online_status')
            .then(response => response.json())
            .then(onlineUsers => {
                for (const [username, status] of Object.entries(onlineUsers)) {
                    updateOnlineStatus(username, status.online);
                }
            })
            .catch(console.error);
    }, 1000);

    console.log('Kildear Messenger инициализирован');
});