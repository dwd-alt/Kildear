// Добавьте эту функцию в начало script.js
function applyTheme(theme) {
    if (theme === 'dark') {
        document.body.classList.remove('light-theme');
        document.body.classList.add('dark-theme');
    } else {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
    }
}

// Вставьте этот код в конец DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
    // ... существующий код ...

    // Применяем тему при загрузке
    const currentUserTheme = 'dark'; // Можно получить с сервера
    applyTheme(currentUserTheme);

    // ... остальной код ...
});
document.addEventListener('DOMContentLoaded', function() {
    // Инициализация
    const socket = io();
    const currentUser = document.getElementById('current-user').value;
    const currentUserName = document.getElementById('current-user-name').value;
    const currentUserColor = document.getElementById('current-user-color').value;

    let currentRecipient = null;
    let currentRecipientName = '';
    let currentRecipientColor = '';
    let typingTimeout = null;

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

    // Мобильное меню
    if (window.innerWidth <= 768) {
        const mobileMenu = document.createElement('div');
        mobileMenu.className = 'mobile-menu';
        mobileMenu.innerHTML = `
            <a href="#" class="mobile-menu-item active" id="mobile-chats">
                <i class="fas fa-comments"></i>
                <span>Чаты</span>
            </a>
            <a href="#" class="mobile-menu-item" id="mobile-search">
                <i class="fas fa-search"></i>
                <span>Поиск</span>
            </a>
            <a href="#" class="mobile-menu-item" id="mobile-profile">
                <i class="fas fa-user"></i>
                <span>Профиль</span>
            </a>
        `;
        document.body.appendChild(mobileMenu);

        // Обработчики мобильного меню
        document.getElementById('mobile-chats').addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelector('.sidebar').scrollIntoView({ behavior: 'smooth' });
        });

        document.getElementById('mobile-search').addEventListener('click', (e) => {
            e.preventDefault();
            searchInput.focus();
        });

        document.getElementById('mobile-profile').addEventListener('click', (e) => {
            e.preventDefault();
            showNotification('Профиль в разработке', 'info');
        });
    }

    // Инициализация WebSocket
    function initWebSocket() {
        socket.on('connect', () => {
            console.log('✓ Подключен к серверу');
            showNotification('Подключено к серверу', 'success');
        });

        socket.on('disconnect', () => {
            console.log('✗ Отключен от сервера');
            showNotification('Нет подключения к серверу', 'error');
        });

        socket.on('user_status', handleUserStatus);
        socket.on('new_message', handleNewMessage);
        socket.on('message_sent', handleMessageSent);
        socket.on('user_typing', handleUserTyping);
    }

    // Поиск пользователей
    function initSearch() {
        searchInput.addEventListener('input', debounce((e) => {
            const query = e.target.value.trim();

            if (query.length < 2) {
                searchResults.style.display = 'none';
                return;
            }

            searchUsers(query);
        }, 300));

        // Закрытие результатов при клике вне
        document.addEventListener('click', (e) => {
            if (!searchResults.contains(e.target) && e.target !== searchInput) {
                searchResults.style.display = 'none';
            }
        });
    }

    // Поиск пользователей
    function searchUsers(query) {
        fetch(`/search_users?q=${encodeURIComponent(query)}`)
            .then(response => response.json())
            .then(users => {
                displaySearchResults(users);
            })
            .catch(error => {
                console.error('Search error:', error);
                showNotification('Ошибка поиска', 'error');
            });
    }

    // Отображение результатов поиска
    function displaySearchResults(users) {
        if (users.length === 0) {
            searchResults.innerHTML = '<div class="no-results">Пользователи не найдены</div>';
            searchResults.style.display = 'block';
            return;
        }

        searchResults.innerHTML = '';
        users.forEach(user => {
            const userElement = document.createElement('div');
            userElement.className = 'contact-item';
            userElement.innerHTML = `
                <div class="contact-avatar" style="background: ${user.avatar_color}">
                    ${user.name[0].toUpperCase()}
                </div>
                <div class="contact-info">
                    <div class="contact-name-row">
                        <h4>${escapeHtml(user.name)}</h4>
                    </div>
                    <p class="contact-preview">
                        @${escapeHtml(user.username)}
                        ${user.description ? `· ${escapeHtml(user.description.substring(0, 30))}${user.description.length > 30 ? '...' : ''}` : ''}
                    </p>
                </div>
            `;

            userElement.addEventListener('click', () => {
                openChat(user.username, user.name, user.avatar_color);
                searchInput.value = '';
                searchResults.style.display = 'none';
            });

            searchResults.appendChild(userElement);
        });

        searchResults.style.display = 'block';
    }

    // Открытие чата
    function openChat(username, name, color) {
        if (currentRecipient === username) return;

        currentRecipient = username;
        currentRecipientName = name;
        currentRecipientColor = color;
        document.getElementById('current-recipient').value = username;

        // Обновляем заголовок чата
        updateChatHeader();

        // Показываем поле ввода
        messageInputContainer.style.display = 'block';

        // Загружаем сообщения
        loadMessages();

        // Помечаем активный контакт
        updateActiveContact();

        // Фокус на поле ввода
        setTimeout(() => {
            messageInput.focus();
        }, 100);
    }

    // Обновление заголовка чата
    function updateChatHeader() {
        chatHeader.innerHTML = `
            <div class="user-profile">
                <div class="user-avatar" style="background: ${currentRecipientColor}">
                    ${currentRecipientName[0].toUpperCase()}
                    <span class="status-indicator" id="header-status-${currentRecipient}"></span>
                </div>
                <div class="user-info">
                    <h3>${escapeHtml(currentRecipientName)}</h3>
                    <p class="user-status" id="header-status-text-${currentRecipient}">
                        <i class="fas fa-circle"></i> проверка...
                    </p>
                </div>
            </div>
        `;

        // Проверяем онлайн статус
        checkOnlineStatus(currentRecipient);
    }

    // Загрузка сообщений
    function loadMessages() {
        if (!currentRecipient) return;

        fetch(`/get_messages/${currentRecipient}`)
            .then(response => response.json())
            .then(messages => {
                displayMessages(messages);
            })
            .catch(error => {
                console.error('Error loading messages:', error);
                showNotification('Ошибка загрузки сообщений', 'error');
            });
    }

    // Отображение сообщений
    function displayMessages(messages) {
        messagesContainer.innerHTML = '';

        if (messages.length === 0) {
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

    // Добавление сообщения в DOM
    function addMessageToDOM(message) {
        const isOutgoing = message.sender === currentUser;
        const messageElement = document.createElement('div');
        messageElement.className = `message ${isOutgoing ? 'outgoing' : 'incoming'}`;

        const time = formatTime(message.timestamp);
        const avatarColor = isOutgoing ? currentUserColor : currentRecipientColor;
        const avatarText = isOutgoing ? currentUserName[0].toUpperCase() : currentRecipientName[0].toUpperCase();

        messageElement.innerHTML = `
            <div class="message-avatar" style="background: ${avatarColor}">
                ${avatarText}
            </div>
            <div class="message-content">
                <div class="message-bubble">
                    ${escapeHtml(message.message)}
                </div>
                <div class="message-time">${time}</div>
            </div>
        `;

        messagesContainer.appendChild(messageElement);
    }

    // Инициализация формы сообщения
    function initMessageForm() {
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

    // Отправка сообщения
    function sendMessage() {
        const message = messageInput.value.trim();
        if (!message || !currentRecipient) {
            showNotification('Введите сообщение', 'info');
            return;
        }

        // Проверяем подключение
        if (!socket.connected) {
            showNotification('Нет подключения к серверу', 'error');
            return;
        }

        socket.emit('send_message', {
            recipient: currentRecipient,
            message: message
        });

        // Очищаем поле ввода
        messageInput.value = '';

        // Сбрасываем статус "печатает"
        clearTimeout(typingTimeout);
        socket.emit('typing', {
            recipient: currentRecipient,
            is_typing: false
        });

        // Фокус остаётся в поле ввода
        messageInput.focus();
    }

    // Обработка нового сообщения
    function handleNewMessage(message) {
        if (message.sender === currentRecipient) {
            addMessageToDOM(message);
            scrollToBottom();
            playMessageSound();
            updateLastMessagePreview(message);
        } else {
            // Уведомление о новом сообщении от другого пользователя
            showNewMessageNotification(message);
        }
    }

    // Обработка отправленного сообщения
    function handleMessageSent(message) {
        // Если сообщение отправлено текущему собеседнику
        if (message.recipient === currentRecipient) {
            addMessageToDOM(message);
            scrollToBottom();
        }
    }

    // Обработка статуса пользователя
    function handleUserStatus(data) {
        updateOnlineStatus(data.username, data.online);
    }

    // Обработка статуса "печатает"
    function handleUserTyping(data) {
        if (data.username === currentRecipient && data.is_typing) {
            typingText.textContent = `${currentRecipientName} печатает...`;
            typingIndicator.style.display = 'flex';
        } else if (data.username === currentRecipient && !data.is_typing) {
            typingIndicator.style.display = 'none';
        }
    }

    // Обновление онлайн статуса
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

    // Проверка онлайн статуса
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

    // Обновление счетчика онлайн
    function updateOnlineCount() {
        const onlineItems = document.querySelectorAll('.status-indicator.online');
        const count = onlineItems.length;
        if (onlineCount) {
            onlineCount.textContent = `${count} онлайн`;
        }
    }

    // Обновление превью последнего сообщения
    function updateLastMessagePreview(message) {
        const contactItem = document.querySelector(`.contact-item[data-username="${message.sender}"]`);
        if (contactItem) {
            const previewElement = contactItem.querySelector('.contact-preview');
            if (previewElement) {
                const shortMessage = message.message.length > 30
                    ? message.message.substring(0, 30) + '...'
                    : message.message;
                previewElement.textContent = shortMessage;
            }
        }
    }

    // Обновление активного контакта
    function updateActiveContact() {
        document.querySelectorAll('.contact-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.username === currentRecipient) {
                item.classList.add('active');
            }
        });
    }

    // Прокрутка вниз
    function scrollToBottom() {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // Проигрывание звука сообщения
    function playMessageSound() {
        try {
            const audio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==');
            audio.volume = 0.1;
            audio.play();
        } catch (e) {
            // Игнорируем ошибки воспроизведения звука
        }
    }

    // Показать уведомление
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

    // Показать уведомление о новом сообщении
    function showNewMessageNotification(message) {
        showNotification(`Новое сообщение от ${message.sender}`, 'info');

        // Воспроизводим звук
        playMessageSound();
    }

    // Форматирование времени
    function formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    // Экранирование HTML
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Дебаунс
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

    // Кнопка нового чата
    document.getElementById('start-new-chat')?.addEventListener('click', () => {
        searchInput.focus();
    });

    // Кнопка поиска
    document.getElementById('search-toggle')?.addEventListener('click', () => {
        searchInput.focus();
    });

    // Запрос разрешения на уведомления
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }

    // Инициализация
    initWebSocket();
    initSearch();
    initMessageForm();

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