// static/stickers.js
document.addEventListener('DOMContentLoaded', function() {
    // Инициализация стикеров
    initStickers();
});

function initStickers() {
    // Находим кнопку для стикеров
    const stickersBtn = document.getElementById('stickers-toggle');
    if (!stickersBtn) {
        // Если кнопки нет, создаем её
        const attachmentButtons = document.querySelector('.attachment-buttons');
        if (attachmentButtons) {
            const stickerBtn = document.createElement('button');
            stickerBtn.type = 'button';
            stickerBtn.className = 'btn-icon';
            stickerBtn.id = 'stickers-toggle';
            stickerBtn.title = 'Стикеры';
            stickerBtn.innerHTML = '<i class="fas fa-smile"></i>';
            attachmentButtons.appendChild(stickerBtn);
        }
    }

    // Создаем контейнер для стикеров
    createStickersPanel();
}

function createStickersPanel() {
    // Удаляем существующую панель
    const existingPanel = document.getElementById('stickers-panel');
    if (existingPanel) {
        existingPanel.remove();
    }

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
        <div class="sticker-categories" id="sticker-categories">
            <button class="sticker-category-btn active" data-category="emotions">
                <span>Эмоции</span>
            </button>
            <button class="sticker-category-btn" data-category="animals">
                <span>Животные</span>
            </button>
            <button class="sticker-category-btn" data-category="actions">
                <span>Действия</span>
            </button>
            <button class="sticker-category-btn" data-category="food">
                <span>Еда</span>
            </button>
            <button class="sticker-category-btn" data-category="objects">
                <span>Объекты</span>
            </button>
            <button class="sticker-category-btn" data-category="flags">
                <span>Флаги</span>
            </button>
        </div>
        <div class="stickers-grid" id="stickers-grid"></div>
    `;

    document.body.appendChild(stickersContainer);

    // Загружаем стикеры первой категории
    loadStickers('emotions');

    // Назначаем обработчики событий
    setupStickerEvents();
}

function setupStickerEvents() {
    const stickersBtn = document.getElementById('stickers-toggle');
    const stickersPanel = document.getElementById('stickers-panel');
    const closeBtn = stickersPanel?.querySelector('.close-stickers');
    const categoryBtns = stickersPanel?.querySelectorAll('.sticker-category-btn');

    if (stickersBtn) {
        stickersBtn.addEventListener('click', toggleStickers);
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', closeStickers);
    }

    if (categoryBtns) {
        categoryBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                const category = this.dataset.category;
                loadStickers(category);

                // Обновляем активную категорию
                categoryBtns.forEach(b => b.classList.remove('active'));
                this.classList.add('active');
            });
        });
    }

    // Закрытие при клике вне панели
    document.addEventListener('click', function(event) {
        const stickersBtn = document.getElementById('stickers-toggle');
        const stickersPanel = document.getElementById('stickers-panel');

        if (!stickersPanel || !stickersBtn) return;

        if (!stickersPanel.contains(event.target) && !stickersBtn.contains(event.target)) {
            closeStickers();
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

function loadStickers(category) {
    const grid = document.getElementById('stickers-grid');
    if (!grid) return;

    grid.innerHTML = '';

    const stickerSets = {
        'emotions': [
            { emoji: '😊', text: 'Улыбка' },
            { emoji: '😂', text: 'Смех' },
            { emoji: '😍', text: 'Любовь' },
            { emoji: '😉', text: 'Подмигивание' },
            { emoji: '😎', text: 'Крутой' },
            { emoji: '😢', text: 'Грусть' },
            { emoji: '😠', text: 'Злость' },
            { emoji: '😲', text: 'Удивление' },
            { emoji: '🤔', text: 'Размышление' },
            { emoji: '🤦', text: 'Рукопожатие' },
            { emoji: '😭', text: 'Слёзы' },
            { emoji: '😘', text: 'Поцелуй' }
        ],
        'animals': [
            { emoji: '🐱', text: 'Кот' },
            { emoji: '🐶', text: 'Собака' },
            { emoji: '🦊', text: 'Лиса' },
            { emoji: '🦁', text: 'Лев' },
            { emoji: '🐯', text: 'Тигр' },
            { emoji: '🐻', text: 'Медведь' },
            { emoji: '🐼', text: 'Панда' },
            { emoji: '🐰', text: 'Кролик' },
            { emoji: '🦉', text: 'Сова' },
            { emoji: '🦄', text: 'Единорог' },
            { emoji: '🐵', text: 'Обезьяна' },
            { emoji: '🐲', text: 'Дракон' }
        ],
        'actions': [
            { emoji: '👍', text: 'Класс' },
            { emoji: '👎', text: 'Не нравится' },
            { emoji: '👌', text: 'ОК' },
            { emoji: '👏', text: 'Аплодисменты' },
            { emoji: '🙏', text: 'Молитва' },
            { emoji: '✊', text: 'Кулак' },
            { emoji: '👋', text: 'Привет' },
            { emoji: '❤️', text: 'Сердце' },
            { emoji: '🔥', text: 'Огонь' },
            { emoji: '⭐', text: 'Звезда' },
            { emoji: '🚀', text: 'Ракета' },
            { emoji: '🏆', text: 'Трофей' }
        ],
        'food': [
            { emoji: '☕', text: 'Кофе' },
            { emoji: '🍕', text: 'Пицца' },
            { emoji: '🍺', text: 'Пиво' },
            { emoji: '🎂', text: 'Торт' },
            { emoji: '🍔', text: 'Бургер' },
            { emoji: '🍣', text: 'Суши' },
            { emoji: '🍦', text: 'Мороженое' },
            { emoji: '🍸', text: 'Коктейль' },
            { emoji: '🍿', text: 'Попкорн' },
            { emoji: '🍫', text: 'Шоколад' }
        ],
        'objects': [
            { emoji: '🎁', text: 'Подарок' },
            { emoji: '🎈', text: 'Шарик' },
            { emoji: '🎵', text: 'Музыка' },
            { emoji: '📷', text: 'Камера' },
            { emoji: '📱', text: 'Телефон' },
            { emoji: '💰', text: 'Деньги' },
            { emoji: '⏰', text: 'Часы' },
            { emoji: '📚', text: 'Книги' },
            { emoji: '💻', text: 'Компьютер' },
            { emoji: '🔑', text: 'Ключ' }
        ],
        'flags': [
            { emoji: '🇷🇺', text: 'Россия' },
            { emoji: '🇺🇸', text: 'США' },
            { emoji: '🇬🇧', text: 'Великобритания' },
            { emoji: '🇩🇪', text: 'Германия' },
            { emoji: '🇫🇷', text: 'Франция' },
            { emoji: '🇪🇸', text: 'Испания' },
            { emoji: '🇮🇹', text: 'Италия' },
            { emoji: '🇯🇵', text: 'Япония' },
            { emoji: '🇨🇳', text: 'Китай' },
            { emoji: '🇺🇦', text: 'Украина' }
        ]
    };

    if (stickerSets[category]) {
        stickerSets[category].forEach(sticker => {
            const stickerEl = document.createElement('div');
            stickerEl.className = 'sticker-item';
            stickerEl.title = sticker.text;
            stickerEl.innerHTML = `
                <div class="sticker-emoji">${sticker.emoji}</div>
            `;

            stickerEl.addEventListener('click', () => {
                sendSticker(sticker.emoji);
            });

            grid.appendChild(stickerEl);
        });
    }
}

function sendSticker(emoji) {
    // Получаем текущего получателя из глобальной переменной или из DOM
    const currentRecipient = window.currentRecipient ||
                           document.getElementById('current-recipient')?.value;

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

    // Находим кнопку отправки
    const sendBtn = document.querySelector('#send-message-btn') ||
                   document.querySelector('.btn-send');

    if (sendBtn) {
        const originalIcon = sendBtn.innerHTML;
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        sendBtn.disabled = true;

        socket.emit('send_message', messageData, (response) => {
            sendBtn.innerHTML = originalIcon;
            sendBtn.disabled = false;

            if (response && response.error) {
                showNotification('Ошибка отправки: ' + response.error, 'error');
            } else {
                // Закрываем панель стикеров после отправки
                closeStickers();
            }
        });
    }
}

// Вспомогательная функция для показа уведомлений
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;

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