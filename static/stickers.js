// static/stickers.js
const stickers = {
    'emotions': [
        { id: 'smile', emoji: '😊', text: 'Улыбка' },
        { id: 'laugh', emoji: '😂', text: 'Смех' },
        { id: 'love', emoji: '😍', text: 'Любовь' },
        { id: 'wink', emoji: '😉', text: 'Подмигивание' },
        { id: 'cool', emoji: '😎', text: 'Крутой' },
        { id: 'sad', emoji: '😢', text: 'Грусть' },
        { id: 'angry', emoji: '😠', text: 'Злость' },
        { id: 'surprise', emoji: '😲', text: 'Удивление' },
        { id: 'thinking', emoji: '🤔', text: 'Размышление' },
        { id: 'facepalm', emoji: '🤦', text: 'Рукопожатие' }
    ],
    'animals': [
        { id: 'cat', emoji: '🐱', text: 'Кот' },
        { id: 'dog', emoji: '🐶', text: 'Собака' },
        { id: 'fox', emoji: '🦊', text: 'Лиса' },
        { id: 'lion', emoji: '🦁', text: 'Лев' },
        { id: 'tiger', emoji: '🐯', text: 'Тигр' },
        { id: 'bear', emoji: '🐻', text: 'Медведь' },
        { id: 'panda', emoji: '🐼', text: 'Панда' },
        { id: 'rabbit', emoji: '🐰', text: 'Кролик' },
        { id: 'owl', emoji: '🦉', text: 'Сова' },
        { id: 'unicorn', emoji: '🦄', text: 'Единорог' }
    ],
    'actions': [
        { id: 'thumbs_up', emoji: '👍', text: 'Класс' },
        { id: 'thumbs_down', emoji: '👎', text: 'Не нравится' },
        { id: 'ok', emoji: '👌', text: 'ОК' },
        { id: 'clap', emoji: '👏', text: 'Аплодисменты' },
        { id: 'pray', emoji: '🙏', text: 'Молитва' },
        { id: 'fist', emoji: '✊', text: 'Кулак' },
        { id: 'wave', emoji: '👋', text: 'Привет' },
        { id: 'heart', emoji: '❤️', text: 'Сердце' },
        { id: 'fire', emoji: '🔥', text: 'Огонь' },
        { id: 'star', emoji: '⭐', text: 'Звезда' }
    ],
    'objects': [
        { id: 'coffee', emoji: '☕', text: 'Кофе' },
        { id: 'pizza', emoji: '🍕', text: 'Пицца' },
        { id: 'beer', emoji: '🍺', text: 'Пиво' },
        { id: 'cake', emoji: '🎂', text: 'Торт' },
        { id: 'gift', emoji: '🎁', text: 'Подарок' },
        { id: 'balloon', emoji: '🎈', text: 'Шарик' },
        { id: 'music', emoji: '🎵', text: 'Музыка' },
        { id: 'camera', emoji: '📷', text: 'Камера' },
        { id: 'phone', emoji: '📱', text: 'Телефон' },
        { id: 'money', emoji: '💰', text: 'Деньги' }
    ]
};

function initStickers() {
    const stickerBtn = document.createElement('button');
    stickerBtn.className = 'btn-icon';
    stickerBtn.id = 'stickers-btn';
    stickerBtn.title = 'Стикеры';
    stickerBtn.innerHTML = '<i class="fas fa-sticky-note"></i>';

    const attachmentButtons = document.querySelector('.attachment-buttons');
    if (attachmentButtons) {
        attachmentButtons.appendChild(stickerBtn);
    }

    // Создаем контейнер для стикеров
    const stickersContainer = document.createElement('div');
    stickersContainer.id = 'stickers-container';
    stickersContainer.className = 'stickers-container';
    stickersContainer.style.display = 'none';

    // Заголовок
    const header = document.createElement('div');
    header.className = 'stickers-header';
    header.innerHTML = `
        <h4><i class="fas fa-sticky-note"></i> Стикеры</h4>
        <button class="btn-icon close-stickers">
            <i class="fas fa-times"></i>
        </button>
    `;
    stickersContainer.appendChild(header);

    // Категории
    const categories = document.createElement('div');
    categories.className = 'sticker-categories';

    Object.keys(stickers).forEach(category => {
        const btn = document.createElement('button');
        btn.className = 'sticker-category-btn';
        btn.dataset.category = category;
        btn.textContent = getCategoryName(category);
        categories.appendChild(btn);
    });
    stickersContainer.appendChild(categories);

    // Сетка стикеров
    const grid = document.createElement('div');
    grid.className = 'stickers-grid';
    stickersContainer.appendChild(grid);

    // Добавляем в DOM
    const messageInputContainer = document.querySelector('.message-input-container');
    if (messageInputContainer) {
        messageInputContainer.appendChild(stickersContainer);
    }

    // Обработчики событий
    stickerBtn.addEventListener('click', toggleStickers);

    if (stickersContainer.querySelector('.close-stickers')) {
        stickersContainer.querySelector('.close-stickers').addEventListener('click', () => {
            stickersContainer.style.display = 'none';
        });
    }

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

    // Показываем первую категорию по умолчанию
    showStickers('emotions');
    const firstCategoryBtn = categories.querySelector('[data-category="emotions"]');
    if (firstCategoryBtn) {
        firstCategoryBtn.classList.add('active');
    }
}

function toggleStickers() {
    const container = document.getElementById('stickers-container');
    if (!container) return;

    if (container.style.display === 'none' || !container.style.display) {
        container.style.display = 'block';
    } else {
        container.style.display = 'none';
    }
}

function showStickers(category) {
    const grid = document.querySelector('.stickers-grid');
    if (!grid) return;

    grid.innerHTML = '';

    if (stickers[category]) {
        stickers[category].forEach(sticker => {
            const stickerEl = document.createElement('div');
            stickerEl.className = 'sticker-item';
            stickerEl.title = sticker.text;
            stickerEl.innerHTML = `
                <div class="sticker-emoji">${sticker.emoji}</div>
                <div class="sticker-text">${sticker.text}</div>
            `;

            stickerEl.addEventListener('click', () => {
                sendSticker(sticker.emoji);
                const container = document.getElementById('stickers-container');
                if (container) {
                    container.style.display = 'none';
                }
            });

            grid.appendChild(stickerEl);
        });
    }
}

function getCategoryName(category) {
    const names = {
        'emotions': 'Эмоции',
        'animals': 'Животные',
        'actions': 'Действия',
        'objects': 'Объекты'
    };
    return names[category] || category;
}

function sendSticker(emoji) {
    const currentRecipient = document.getElementById('current-recipient')?.value;
    if (!currentRecipient) {
        showNotification('Выберите чат для отправки стикера', 'info');
        return;
    }

    const socket = io();
    const messageData = {
        recipient: currentRecipient,
        message: emoji,
        type: 'sticker'
    };

    const sendBtn = document.querySelector('.btn-send');

    if (sendBtn) {
        const originalIcon = sendBtn.innerHTML;
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        sendBtn.disabled = true;

        socket.emit('send_message', messageData, (response) => {
            sendBtn.innerHTML = originalIcon;
            sendBtn.disabled = false;

            if (response && response.error) {
                showNotification('Ошибка отправки: ' + response.error, 'error');
            }
        });
    }
}

// Вспомогательная функция для показа уведомлений
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

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', initStickers);