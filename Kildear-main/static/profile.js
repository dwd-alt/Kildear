document.addEventListener('DOMContentLoaded', function() {
    // Элементы DOM
    const editProfileForm = document.getElementById('edit-profile-form');
    const changePasswordForm = document.getElementById('change-password-form');
    const changeUsernameForm = document.getElementById('change-username-form');
    const deleteAccountBtn = document.getElementById('delete-account');
    const changeAvatarBtn = document.getElementById('change-avatar');
    const removeAvatarBtn = document.getElementById('remove-avatar');
    const avatarInput = document.getElementById('avatar-input');
    const avatarPreview = document.getElementById('avatar-preview');
    const themeOptions = document.querySelectorAll('.theme-option');

    let currentAvatarData = null;

    // Инициализация тем
    themeOptions.forEach(option => {
        option.addEventListener('click', () => {
            themeOptions.forEach(opt => opt.classList.remove('active'));
            option.classList.add('active');
            const theme = option.dataset.theme;
            applyTheme(theme);
            localStorage.setItem('theme', theme);
        });
    });

    // Смена аватарки
    changeAvatarBtn.addEventListener('click', () => {
        avatarInput.click();
    });

    avatarInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            showNotification('Пожалуйста, выберите изображение', 'error');
            return;
        }

        if (file.size > 5 * 1024 * 1024) { // 5MB
            showNotification('Изображение слишком большое (максимум 5MB)', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            currentAvatarData = e.target.result;
            avatarPreview.innerHTML = `<img src="${currentAvatarData}" alt="Аватар">`;
        };
        reader.onerror = function() {
            showNotification('Ошибка чтения файла', 'error');
        };
        reader.readAsDataURL(file);
    });

    // Удаление аватарки
    removeAvatarBtn.addEventListener('click', () => {
        currentAvatarData = null;
        const placeholder = avatarPreview.querySelector('.avatar-placeholder');
        if (!placeholder) {
            const userInitial = document.querySelector('.user-info h2').textContent[0];
            avatarPreview.innerHTML = `<div class="avatar-placeholder" style="background: var(--primary-color);">${userInitial}</div>`;
        }
    });

    // Редактирование профиля
    editProfileForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const name = document.getElementById('edit-name').value.trim();
        const description = document.getElementById('edit-description').value.trim();
        const activeTheme = document.querySelector('.theme-option.active').dataset.theme;

        if (!name) {
            showNotification('Имя не может быть пустым', 'error');
            return;
        }

        const data = {
            name: name,
            description: description,
            theme: activeTheme
        };

        if (currentAvatarData) {
            data.avatar = currentAvatarData;
        }

        const submitBtn = editProfileForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Сохранение...';
        submitBtn.disabled = true;

        fetch('/api/profile/update', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        })
        .then(response => response.json())
        .then(result => {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;

            if (result.success) {
                showNotification('Профиль успешно обновлен', 'success');
                // Обновляем имя в заголовке
                document.querySelector('.user-info h2').textContent = name;
                if (description) {
                    document.querySelector('.description').textContent = description;
                }
                currentAvatarData = null;
            } else {
                showNotification(result.message || 'Ошибка обновления профиля', 'error');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
            showNotification('Ошибка соединения', 'error');
        });
    });

    // Смена пароля
    changePasswordForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const currentPassword = document.getElementById('current-password').value;
        const newPassword = document.getElementById('new-password').value;
        const confirmPassword = document.getElementById('confirm-new-password').value;

        if (!currentPassword || !newPassword || !confirmPassword) {
            showNotification('Заполните все поля', 'error');
            return;
        }

        if (newPassword.length < 6) {
            showNotification('Новый пароль должен быть не менее 6 символов', 'error');
            return;
        }

        if (newPassword !== confirmPassword) {
            showNotification('Пароли не совпадают', 'error');
            return;
        }

        const submitBtn = changePasswordForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Смена пароля...';
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
        .then(result => {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;

            if (result.success) {
                showNotification('Пароль успешно изменен', 'success');
                changePasswordForm.reset();
            } else {
                showNotification(result.message || 'Ошибка смены пароля', 'error');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
            showNotification('Ошибка соединения', 'error');
        });
    });

    // Смена юзернейма
    changeUsernameForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const newUsername = document.getElementById('new-username').value.trim().toLowerCase();
        const password = document.getElementById('password-for-username').value;

        if (!newUsername || !password) {
            showNotification('Заполните все поля', 'error');
            return;
        }

        if (newUsername.length < 3) {
            showNotification('Юзернейм должен быть не менее 3 символов', 'error');
            return;
        }

        if (newUsername === document.querySelector('.username').textContent.substring(1)) {
            showNotification('Это ваш текущий юзернейм', 'info');
            return;
        }

        const submitBtn = changeUsernameForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Смена юзернейма...';
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
        .then(result => {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;

            if (result.success) {
                showNotification('Юзернейм успешно изменен', 'success');
                document.querySelector('.username').textContent = '@' + newUsername;
                document.getElementById('new-username').value = newUsername;
                changeUsernameForm.reset();

                // Обновляем сессию
                setTimeout(() => {
                    window.location.reload();
                }, 1500);
            } else {
                showNotification(result.message || 'Ошибка смены юзернейма', 'error');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
            showNotification('Ошибка соединения', 'error');
        });
    });

    // Удаление аккаунта
    deleteAccountBtn.addEventListener('click', () => {
        if (confirm('ВНИМАНИЕ! Это действие нельзя отменить. Все ваши данные будут удалены. Продолжить?')) {
            if (confirm('Вы уверены? Это приведет к полному удалению вашего аккаунта и всех сообщений.')) {
                showNotification('Функция удаления аккаунта в разработке', 'info');
                // TODO: Реализовать удаление аккаунта
            }
        }
    });

    // Вспомогательные функции
    function applyTheme(theme) {
        if (theme === 'dark') {
            document.body.classList.remove('light-theme');
            document.body.classList.add('dark-theme');
        } else {
            document.body.classList.remove('dark-theme');
            document.body.classList.add('light-theme');
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

    console.log('Профиль инициализирован');
});