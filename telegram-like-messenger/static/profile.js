document.addEventListener('DOMContentLoaded', function() {
    // Элементы
    const editProfileForm = document.getElementById('edit-profile-form');
    const changePasswordForm = document.getElementById('change-password-form');
    const changeUsernameForm = document.getElementById('change-username-form');
    const avatarInput = document.getElementById('avatar-input');
    const uploadAvatarBtn = document.getElementById('upload-avatar-btn');
    const avatarPreview = document.getElementById('avatar-preview');
    const themeOptions = document.querySelectorAll('.theme-option');
    const deleteChatsBtn = document.getElementById('delete-chats-btn');
    const deleteAccountBtn = document.getElementById('delete-account-btn');
    const currentUser = document.getElementById('current-user').value;

    // Загрузка аватарки
    uploadAvatarBtn.addEventListener('click', () => {
        avatarInput.click();
    });

    avatarInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.match('image.*')) {
            showNotification('Пожалуйста, выберите изображение', 'error');
            return;
        }

        if (file.size > 5 * 1024 * 1024) { // 5MB
            showNotification('Изображение должно быть меньше 5MB', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            // Обновляем превью
            updateAvatarPreview(e.target.result);

            // Сохраняем на сервере
            saveAvatar(e.target.result);
        };
        reader.readAsDataURL(file);
    });

    function updateAvatarPreview(imageData) {
        const img = avatarPreview.querySelector('img');
        const placeholder = avatarPreview.querySelector('.avatar-placeholder');

        if (placeholder) {
            placeholder.style.display = 'none';
        }

        if (img) {
            img.src = imageData;
        } else {
            const newImg = document.createElement('img');
            newImg.src = imageData;
            newImg.alt = 'Аватар';
            avatarPreview.appendChild(newImg);
        }
    }

    function saveAvatar(base64Data) {
        fetch('/api/profile/update', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                avatar: base64Data
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification('Аватарка обновлена', 'success');
            } else {
                showNotification(data.message || 'Ошибка', 'error');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showNotification('Ошибка сети', 'error');
        });
    }

    // Редактирование профиля
    editProfileForm.addEventListener('submit', function(e) {
        e.preventDefault();

        const name = document.getElementById('name').value.trim();
        const description = document.getElementById('description').value.trim();

        if (!name) {
            showNotification('Введите имя', 'error');
            return;
        }

        const submitBtn = editProfileForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<div class="loader"></div>';
        submitBtn.disabled = true;

        fetch('/api/profile/update', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: name,
                description: description
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification('Профиль обновлен', 'success');
                // Обновляем имя в заголовке
                document.querySelector('.user-info h2').textContent = name;
                if (description) {
                    document.querySelector('.description').textContent = description;
                }
            } else {
                showNotification(data.message || 'Ошибка', 'error');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showNotification('Ошибка сети', 'error');
        })
        .finally(() => {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        });
    });

    // Смена пароля
    changePasswordForm.addEventListener('submit', function(e) {
        e.preventDefault();

        const currentPassword = document.getElementById('current-password').value;
        const newPassword = document.getElementById('new-password').value;
        const confirmPassword = document.getElementById('confirm-password').value;

        if (!currentPassword || !newPassword || !confirmPassword) {
            showNotification('Заполните все поля', 'error');
            return;
        }

        if (newPassword.length < 6) {
            showNotification('Пароль должен быть не менее 6 символов', 'error');
            return;
        }

        if (newPassword !== confirmPassword) {
            showNotification('Пароли не совпадают', 'error');
            return;
        }

        const submitBtn = changePasswordForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<div class="loader"></div>';
        submitBtn.disabled = true;

        fetch('/api/profile/change_password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                current_password: currentPassword,
                new_password: newPassword,
                confirm_password: confirmPassword
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification('Пароль успешно изменен', 'success');
                changePasswordForm.reset();
            } else {
                showNotification(data.message || 'Ошибка', 'error');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showNotification('Ошибка сети', 'error');
        })
        .finally(() => {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        });
    });

    // Смена юзернейма
    changeUsernameForm.addEventListener('submit', function(e) {
        e.preventDefault();

        const newUsername = document.getElementById('new-username').value.trim().toLowerCase();
        const password = document.getElementById('username-password').value;

        if (!newUsername || !password) {
            showNotification('Заполните все поля', 'error');
            return;
        }

        if (newUsername.length < 3) {
            showNotification('Юзернейм должен быть не менее 3 символов', 'error');
            return;
        }

        if (!/^[a-z0-9_]+$/.test(newUsername)) {
            showNotification('Юзернейм может содержать только латинские буквы, цифры и подчёркивания', 'error');
            return;
        }

        const submitBtn = changeUsernameForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<div class="loader"></div>';
        submitBtn.disabled = true;

        fetch('/api/profile/change_username', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                new_username: newUsername,
                password: password
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification('Юзернейм успешно изменен', 'success');
                // Обновляем данные и перезагружаем страницу
                setTimeout(() => {
                    window.location.reload();
                }, 1500);
            } else {
                showNotification(data.message || 'Ошибка', 'error');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showNotification('Ошибка сети', 'error');
        })
        .finally(() => {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        });
    });

    // Выбор темы
    themeOptions.forEach(option => {
        option.addEventListener('click', function() {
            const theme = this.dataset.theme;

            // Убираем активный класс у всех
            themeOptions.forEach(opt => opt.classList.remove('active'));
            // Добавляем активный класс выбранному
            this.classList.add('active');

            // Обновляем отображение
            document.getElementById('theme-display').textContent =
                theme === 'dark' ? 'Тёмная' : 'Светлая';

            // Сохраняем на сервере
            fetch('/api/profile/update', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    theme: theme
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Применяем тему сразу
                    applyTheme(theme);
                    showNotification('Тема изменена', 'success');
                }
            })
            .catch(error => {
                console.error('Error:', error);
            });
        });
    });

    function applyTheme(theme) {
        if (theme === 'dark') {
            document.body.classList.remove('light-theme');
            document.body.classList.add('dark-theme');
        } else {
            document.body.classList.remove('dark-theme');
            document.body.classList.add('light-theme');
        }
    }

    // Удаление чатов
    deleteChatsBtn.addEventListener('click', function() {
        if (confirm('Вы уверены? Это удалит все ваши чаты. Это действие нельзя отменить.')) {
            showNotification('Эта функция в разработке', 'info');
        }
    });

    // Удаление аккаунта
    deleteAccountBtn.addEventListener('click', function() {
        if (confirm('ВНИМАНИЕ! Это удалит ваш аккаунт, все сообщения и данные. Это действие нельзя отменить.')) {
            const password = prompt('Для подтверждения введите ваш пароль:');
            if (password) {
                showNotification('Функция удаления аккаунта в разработке', 'info');
            }
        }
    });

    // Функция уведомлений
    function showNotification(message, type = 'info') {
        // Создаем уведомление
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;

        let icon = 'info-circle';
        if (type === 'success') icon = 'check-circle';
        if (type === 'error') icon = 'exclamation-circle';

        notification.innerHTML = `
            <i class="fas fa-${icon}"></i>
            <div class="notification-content">
                <div class="notification-message">${message}</div>
            </div>
            <button class="notification-close">
                <i class="fas fa-times"></i>
            </button>
        `;

        document.body.appendChild(notification);

        // Закрытие по клику
        notification.querySelector('.notification-close').addEventListener('click', () => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        });

        // Автоматическое закрытие
        setTimeout(() => {
            notification.classList.add('show');
            setTimeout(() => {
                notification.classList.remove('show');
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 300);
            }, 3000);
        }, 10);
    }

    // Применяем текущую тему при загрузке
    const currentTheme = document.body.classList.contains('light-theme') ? 'light' : 'dark';
    themeOptions.forEach(option => {
        if (option.dataset.theme === currentTheme) {
            option.classList.add('active');
        }
    });
});