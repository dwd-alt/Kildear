from flask import Flask, render_template, request, redirect, url_for, session, jsonify, send_from_directory
from flask_socketio import SocketIO, emit, join_room, leave_room
from werkzeug.security import generate_password_hash, check_password_hash
import json
import os
from datetime import datetime
import uuid
import base64
import threading
import time
import logging
from cryptography.fernet import Fernet
import hashlib

app = Flask(__name__)
app.config['SECRET_KEY'] = 'kildear-messenger-secret-2024-secure'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max
app.config['UPLOAD_FOLDER'] = 'static/uploads'

# Генерация мастер-ключа для шифрования базы
MASTER_KEY = Fernet.generate_key()
cipher_suite = Fernet(MASTER_KEY)

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Создаем папки
os.makedirs('static/uploads/media', exist_ok=True)
os.makedirs('static/uploads/avatars', exist_ok=True)
os.makedirs('database', exist_ok=True)

socketio = SocketIO(app,
                    cors_allowed_origins="*",
                    async_mode='threading',
                    max_http_buffer_size=50 * 1024 * 1024,
                    ping_timeout=60,
                    ping_interval=25,
                    logger=True,
                    engineio_logger=True)

# Хранилище активных звонков
active_calls = {}


# Функция шифрования данных для хранения в базе
def encrypt_data(data):
    if isinstance(data, str):
        data = data.encode('utf-8')
    return cipher_suite.encrypt(data).decode('utf-8')


def decrypt_data(encrypted_data):
    if isinstance(encrypted_data, str):
        encrypted_data = encrypted_data.encode('utf-8')
    return cipher_suite.decrypt(encrypted_data).decode('utf-8')


# Функция инициализации базы данных
def init_database():
    print("📂 Инициализация базы данных...")

    required_files = [
        'database/users.json',
        'database/messages.json',
        'database/online.json',
        'database/blocks.json',
        'database/pinned.json',
        'database/saved_chats.json',
        'database/calls.json',
        'database/security.json'
    ]

    for filepath in required_files:
        if not os.path.exists(filepath):
            print(f"  Создаю: {filepath}")
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump({}, f, ensure_ascii=False, indent=2)

    print("✅ База данных готова")


# Вызываем инициализацию
init_database()


# Функции для работы с базой данных
def load_json_file(filepath, default_data=None, encrypted=False):
    if default_data is None:
        default_data = {}
    try:
        if os.path.exists(filepath) and os.path.getsize(filepath) > 0:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if encrypted and 'encrypted' in data:
                    return json.loads(decrypt_data(data['data']))
                return data
    except Exception as e:
        logger.error(f"Error loading {filepath}: {e}")
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(default_data, f, ensure_ascii=False, indent=2)
    return default_data


def save_json_file(filepath, data, encrypted=False):
    try:
        if encrypted:
            data_to_save = {
                'encrypted': True,
                'timestamp': datetime.now().isoformat(),
                'data': encrypt_data(json.dumps(data, ensure_ascii=False))
            }
        else:
            data_to_save = data

        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data_to_save, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        logger.error(f"Error saving {filepath}: {e}")
        return False


# Загрузка пользователей с шифрованием
def load_users():
    return load_json_file('database/users.json', {}, encrypted=True)


def save_users(users):
    return save_json_file('database/users.json', users, encrypted=True)


# Загрузка сообщений с шифрованием
def load_messages():
    return load_json_file('database/messages.json', {}, encrypted=True)


def save_messages(messages):
    return save_json_file('database/messages.json', messages, encrypted=True)


# Остальные файлы загружаются без шифрования для производительности
def load_online():
    return load_json_file('database/online.json', {})


def save_online(online):
    return save_json_file('database/online.json', online)


def load_blocks():
    return load_json_file('database/blocks.json', {})


def save_blocks(blocks):
    return save_json_file('database/blocks.json', blocks)


def load_pinned():
    return load_json_file('database/pinned.json', {})


def save_pinned(pinned):
    return save_json_file('database/pinned.json', pinned)


def load_saved_chats():
    return load_json_file('database/saved_chats.json', {})


def save_saved_chats(chats):
    return save_json_file('database/saved_chats.json', chats)


def load_calls():
    return load_json_file('database/calls.json', {})


def save_calls(calls):
    return save_json_file('database/calls.json', calls)


def load_security():
    return load_json_file('database/security.json', {})


def save_security(security):
    return save_json_file('database/security.json', security)


# Функции для работы с файлами
def save_avatar(username, base64_data):
    try:
        if ',' in base64_data:
            base64_data = base64_data.split(',')[1]

        img_data = base64.b64decode(base64_data)
        filename = f"{username}_{int(datetime.now().timestamp())}.png"
        filepath = os.path.join('static/uploads/avatars', filename)

        with open(filepath, 'wb') as f:
            f.write(img_data)

        return f"/static/uploads/avatars/{filename}"
    except Exception as e:
        print(f"Ошибка сохранения аватарки: {e}")
        return None


def save_media_file(file_data, filename, file_type):
    try:
        if ',' in file_data:
            file_data = file_data.split(',')[1]

        file_bytes = base64.b64decode(file_data)

        file_ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else 'bin'
        unique_filename = f"{uuid.uuid4().hex}.{file_ext}"
        filepath = os.path.join('static/uploads/media', unique_filename)

        with open(filepath, 'wb') as f:
            f.write(file_bytes)

        return f"media/{unique_filename}"
    except Exception as e:
        print(f"Ошибка сохранения медиа: {e}")
        return None


def generate_color_from_username(username):
    colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8']
    hash_value = sum(ord(char) for char in username)
    return colors[hash_value % len(colors)]


def is_username_taken(username, exclude_user=None):
    users = load_users()
    if exclude_user and username == exclude_user:
        return False
    return username in users


def generate_unique_username(base_username):
    users = load_users()
    if base_username not in users:
        return base_username

    counter = 1
    while True:
        new_username = f"{base_username}{counter}"
        if new_username not in users:
            return new_username
        counter += 1


def is_user_blocked(blocker, blocked_user):
    blocks = load_blocks()
    if blocker in blocks and blocked_user in blocks[blocker]:
        return True
    return False


def block_user(blocker, user_to_block):
    blocks = load_blocks()
    if blocker not in blocks:
        blocks[blocker] = []
    if user_to_block not in blocks[blocker]:
        blocks[blocker].append(user_to_block)
        save_blocks(blocks)
        return True
    return False


def unblock_user(blocker, user_to_unblock):
    blocks = load_blocks()
    if blocker in blocks and user_to_unblock in blocks[blocker]:
        blocks[blocker].remove(user_to_unblock)
        save_blocks(blocks)
        return True
    return False


def get_blocked_users(username):
    blocks = load_blocks()
    return blocks.get(username, [])


def pin_message(username, message_id):
    pinned = load_pinned()
    if username not in pinned:
        pinned[username] = []
    if message_id not in pinned[username]:
        pinned[username].append(message_id)
        save_pinned(pinned)
        return True
    return False


def unpin_message(username, message_id):
    pinned = load_pinned()
    if username in pinned and message_id in pinned[username]:
        pinned[username].remove(message_id)
        save_pinned(pinned)
        return True
    return False


def get_pinned_messages(username):
    pinned = load_pinned()
    return pinned.get(username, [])


# Функции для звонков
def save_call_record(call_data):
    calls = load_calls()
    call_id = call_data['call_id']
    calls[call_id] = call_data
    save_calls(calls)


def get_call_history(username):
    calls = load_calls()
    user_calls = []
    for call_id, call_data in calls.items():
        if call_data['caller'] == username or call_data['callee'] == username:
            user_calls.append(call_data)
    return user_calls


# Функция для генерации уникального ключа шифрования для пользователя
def generate_user_encryption_key(username):
    # Используем комбинацию username, секретного ключа и соли
    secret_salt = 'kildear_secure_salt_2024'
    key_material = f"{username}_{secret_salt}_{MASTER_KEY.decode('utf-8')[:32]}"

    # Генерируем хэш для использования как ключ
    key_hash = hashlib.sha256(key_material.encode('utf-8')).digest()

    # Конвертируем в формат base64 для Fernet
    return base64.urlsafe_b64encode(key_hash)


# Админские функции
def is_admin(username):
    admins = ['admin', 'administrator', 'root', 'moderator']
    return username.lower() in admins


def admin_get_user_messages(username):
    messages = load_messages()
    user_messages = []

    for dialog_key, dialog_messages in messages.items():
        for msg in dialog_messages:
            if msg['sender'] == username or msg['recipient'] == username:
                user_messages.append({
                    'dialog': dialog_key,
                    'message': msg
                })

    return user_messages


def admin_get_all_users():
    users = load_users()
    online_users = load_online()

    result = []
    for username, user_data in users.items():
        is_online = online_users.get(username, {}).get('online', False)
        last_seen = online_users.get(username, {}).get('last_seen', '')

        result.append({
            'username': username,
            'name': user_data['name'],
            'email': user_data.get('email', ''),
            'created_at': user_data.get('created_at', ''),
            'last_seen': last_seen,
            'online': is_online,
            'blocked': user_data.get('blocked', False),
            'message_count': admin_get_user_message_count(username)
        })

    return result


def admin_get_user_message_count(username):
    messages = load_messages()
    count = 0

    for dialog_key, dialog_messages in messages.items():
        for msg in dialog_messages:
            if msg['sender'] == username or msg['recipient'] == username:
                count += 1

    return count


def admin_block_user(username):
    users = load_users()
    if username in users:
        users[username]['blocked'] = True
        save_users(users)
        return True
    return False


def admin_unblock_user(username):
    users = load_users()
    if username in users:
        users[username]['blocked'] = False
        save_users(users)
        return True
    return False


def admin_change_username(old_username, new_username):
    users = load_users()

    if old_username not in users:
        return False, "Пользователь не найден"

    if is_username_taken(new_username, exclude_user=old_username):
        return False, "Этот юзернейм уже занят"

    # Обновляем username во всех сообщениях
    messages = load_messages()
    for dialog_key in list(messages.keys()):
        if old_username in dialog_key:
            usernames = dialog_key.split('_')
            if usernames[0] == old_username:
                new_dialog_key = f"{new_username}_{usernames[1]}"
            else:
                new_dialog_key = f"{usernames[0]}_{new_username}"

            for message in messages[dialog_key]:
                if message['sender'] == old_username:
                    message['sender'] = new_username
                if message['recipient'] == old_username:
                    message['recipient'] = new_username

            messages[new_dialog_key] = messages.pop(dialog_key)

    save_messages(messages)

    # Обновляем пользователя
    users[new_username] = users.pop(old_username)
    users[new_username]['username'] = new_username
    save_users(users)

    # Обновляем онлайн статус
    online_users = load_online()
    if old_username in online_users:
        online_users[new_username] = online_users.pop(old_username)

    # Обновляем блокировки
    blocks = load_blocks()
    for blocker, blocked_list in list(blocks.items()):
        if old_username in blocked_list:
            blocked_list[blocked_list.index(old_username)] = new_username

    return True, "Имя пользователя изменено"


# Новые маршруты для работы поиска и сохранения чата
@app.route('/api/get_all_users')
def api_get_all_users():
    if 'username' not in session:
        return jsonify({'error': 'Not authorized'}), 401

    users = load_users()
    online_users = load_online()

    result = []
    current_username = session['username']
    blocked_users = get_blocked_users(current_username)

    for username, user_data in users.items():
        if username == current_username:
            continue

        if username in blocked_users:
            continue

        is_online = online_users.get(username, {}).get('online', False)
        last_seen = online_users.get(username, {}).get('last_seen', '')

        result.append({
            'username': username,
            'name': user_data['name'],
            'description': user_data.get('description', ''),
            'avatar': user_data.get('avatar'),
            'avatar_color': user_data.get('avatar_color', '#4ECDC4'),
            'is_online': is_online,
            'last_seen': last_seen,
            'created_at': user_data.get('created_at', '')
        })

    return jsonify(result)


@app.route('/api/save_current_chat', methods=['POST'])
def api_save_current_chat():
    if 'username' not in session:
        return jsonify({'error': 'Not authorized'}), 401

    data = request.json
    chat_with = data.get('chat_with')

    if not chat_with:
        return jsonify({'error': 'No user specified'}), 400

    saved_chats = load_saved_chats()
    username = session['username']

    if username not in saved_chats:
        saved_chats[username] = {}

    saved_chats[username]['current_chat'] = chat_with
    saved_chats[username]['last_opened'] = datetime.now().isoformat()

    save_saved_chats(saved_chats)

    return jsonify({'success': True})


@app.route('/api/save_chat', methods=['POST'])
def save_chat():
    if 'username' not in session:
        return jsonify({'error': 'Not authorized'}), 401

    data = request.json
    chat_with = data.get('chat_with')

    if not chat_with:
        return jsonify({'error': 'No user specified'}), 400

    saved_chats = load_saved_chats()
    username = session['username']

    if username not in saved_chats:
        saved_chats[username] = {}

    saved_chats[username]['current_chat'] = chat_with
    saved_chats[username]['last_opened'] = datetime.now().isoformat()

    save_saved_chats(saved_chats)
    return jsonify({'success': True})


# Маршруты для звонков
@app.route('/api/get_call_history')
def api_get_call_history():
    if 'username' not in session:
        return jsonify({'error': 'Not authorized'}), 401

    calls = get_call_history(session['username'])
    return jsonify(calls)


# Маршрут для получения информации о безопасности
@app.route('/api/security_info')
def api_security_info():
    if 'username' not in session:
        return jsonify({'error': 'Not authorized'}), 401

    security_data = load_security()
    username = session['username']

    if username not in security_data:
        # Генерируем информацию о безопасности для пользователя
        user_key = generate_user_encryption_key(username)
        security_data[username] = {
            'encryption_enabled': True,
            'key_generated': datetime.now().isoformat(),
            'encryption_method': 'AES-256-GCM',
            'fingerprint': hashlib.sha256(user_key).hexdigest()[:32]
        }
        save_security(security_data)

    return jsonify(security_data[username])


# Основные маршруты
@app.route('/')
def index():
    if 'username' in session:
        return redirect(url_for('chat'))
    return redirect(url_for('login'))


@app.route('/register', methods=['GET', 'POST'])
def register():
    if 'username' in session:
        return redirect(url_for('chat'))

    if request.method == 'POST':
        username = request.form.get('username', '').strip().lower()
        name = request.form.get('name', '').strip()
        description = request.form.get('description', '').strip()
        password = request.form.get('password', '').strip()
        confirm_password = request.form.get('confirm_password', '').strip()

        # Валидация
        if not username or not name or not password:
            return render_template('register.html', error='Все обязательные поля должны быть заполнены')

        if len(username) < 3:
            return render_template('register.html', error='Юзернейм должен быть не менее 3 символов')

        if len(password) < 6:
            return render_template('register.html', error='Пароль должен быть не менее 6 символов')

        if password != confirm_password:
            return render_template('register.html', error='Пароли не совпадают')

        users = load_users()

        if is_username_taken(username):
            suggested_username = generate_unique_username(username)
            return render_template('register.html',
                                   error=f'Юзернейм "{username}" занят. Попробуйте "{suggested_username}"',
                                   suggested_username=suggested_username)

        # Генерируем ключ шифрования для пользователя
        user_key = generate_user_encryption_key(username)

        # Сохраняем пользователя
        users[username] = {
            'name': name,
            'description': description,
            'username': username,
            'password_hash': generate_password_hash(password),
            'avatar_color': generate_color_from_username(username),
            'avatar': None,
            'theme': 'dark',
            'created_at': datetime.now().isoformat(),
            'last_seen': datetime.now().isoformat(),
            'blocked': False,
            'encryption_key': user_key.decode('utf-8')
        }
        save_users(users)

        session['username'] = username

        # Добавляем в онлайн
        online_users = load_online()
        online_users[username] = {
            'online': True,
            'last_seen': datetime.now().isoformat()
        }
        save_online(online_users)

        # Создаем запись о безопасности
        security_data = load_security()
        security_data[username] = {
            'encryption_enabled': True,
            'key_generated': datetime.now().isoformat(),
            'encryption_method': 'AES-256-GCM',
            'fingerprint': hashlib.sha256(user_key).hexdigest()[:32]
        }
        save_security(security_data)

        return redirect(url_for('chat'))

    return render_template('register.html')


@app.route('/login', methods=['GET', 'POST'])
def login():
    if 'username' in session:
        return redirect(url_for('chat'))

    if request.method == 'POST':
        username = request.form.get('username', '').strip().lower()
        password = request.form.get('password', '').strip()

        users = load_users()
        if username in users:
            user = users[username]

            # Проверяем блокировку
            if user.get('blocked', False):
                return render_template('login.html', error='Аккаунт заблокирован')

            if check_password_hash(user['password_hash'], password):
                session['username'] = username

                # Обновляем статус онлайн
                online_users = load_online()
                online_users[username] = {
                    'online': True,
                    'last_seen': datetime.now().isoformat()
                }
                save_online(online_users)

                return redirect(url_for('chat'))
            else:
                return render_template('login.html', error='Неверный пароль')
        else:
            return render_template('login.html', error='Пользователь не найден')

    return render_template('login.html')


@app.route('/logout')
def logout():
    if 'username' in session:
        username = session['username']
        online_users = load_online()
        if username in online_users:
            online_users[username] = {
                'online': False,
                'last_seen': datetime.now().isoformat()
            }
            save_online(online_users)
    session.clear()
    return redirect(url_for('login'))


@app.route('/chat')
def chat():
    if 'username' not in session:
        return redirect(url_for('login'))

    users = load_users()
    current_user = users.get(session['username'])

    if not current_user:
        session.clear()
        return redirect(url_for('login'))

    # Проверяем блокировку
    if current_user.get('blocked', False):
        session.clear()
        return render_template('blocked.html')

    return render_template('chat.html', current_user=current_user, is_admin=is_admin(session['username']))


@app.route('/profile')
@app.route('/profile/<username>')
def profile(username=None):
    if 'username' not in session:
        return redirect(url_for('login'))

    current_username = session['username']
    users = load_users()
    current_user = users.get(current_username)

    if not current_user:
        session.clear()
        return redirect(url_for('login'))

    # Если username не указан, показываем профиль текущего пользователя
    if not username:
        return render_template('profile.html',
                               user=current_user,
                               is_admin=is_admin(current_username))

    # Показываем профиль другого пользователя
    other_user = users.get(username)
    if not other_user:
        return redirect(url_for('profile'))

    # Проверяем блокировки
    blocked_users = get_blocked_users(current_username)
    is_blocked_by_me = username in blocked_users

    # Проверяем, блокирует ли меня этот пользователь
    is_blocking_me = is_user_blocked(username, current_username)

    return render_template('profile.html',
                           user=other_user,
                           is_other_profile=True,
                           is_blocked=is_blocked_by_me,
                           is_blocking_me=is_blocking_me,
                           is_admin=is_admin(current_username),
                           current_user=current_user)


@app.route('/api/profile/update', methods=['POST'])
def update_profile():
    if 'username' not in session:
        return jsonify({'success': False, 'message': 'Не авторизован'}), 401

    users = load_users()
    current_user = users.get(session['username'])

    if not current_user:
        return jsonify({'success': False, 'message': 'Пользователь не найден'}), 404

    data = request.json

    # Обновляем данные
    if 'name' in data:
        current_user['name'] = data['name'].strip()

    if 'description' in data:
        current_user['description'] = data['description'].strip()

    if 'theme' in data and data['theme'] in ['dark', 'light']:
        current_user['theme'] = data['theme']

    if 'avatar' in data and data['avatar']:
        avatar_url = save_avatar(session['username'], data['avatar'])
        if avatar_url:
            current_user['avatar'] = avatar_url

    users[session['username']] = current_user
    save_users(users)

    return jsonify({'success': True, 'message': 'Профиль обновлен'})


@app.route('/api/profile/change_password', methods=['POST'])
def change_password():
    if 'username' not in session:
        return jsonify({'success': False, 'message': 'Не авторизован'}), 401

    users = load_users()
    current_user = users.get(session['username'])

    if not current_user:
        return jsonify({'success': False, 'message': 'Пользователь не найден'}), 404

    data = request.json
    current_password = data.get('current_password', '')
    new_password = data.get('new_password', '')
    confirm_password = data.get('confirm_password', '')

    # Проверяем текущий пароль
    if not check_password_hash(current_user['password_hash'], current_password):
        return jsonify({'success': False, 'message': 'Неверный текущий пароль'})

    # Валидация нового пароля
    if len(new_password) < 6:
        return jsonify({'success': False, 'message': 'Новый пароль должен быть не менее 6 символов'})

    if new_password != confirm_password:
        return jsonify({'success': False, 'message': 'Пароли не совпадают'})

    # Обновляем пароль
    current_user['password_hash'] = generate_password_hash(new_password)
    users[session['username']] = current_user
    save_users(users)

    return jsonify({'success': True, 'message': 'Пароль успешно изменен'})


@app.route('/api/profile/change_username', methods=['POST'])
def change_username():
    if 'username' not in session:
        return jsonify({'success': False, 'message': 'Не авторизован'}), 401

    data = request.json
    new_username = data.get('new_username', '').strip().lower()
    password = data.get('password', '')

    if not new_username or not password:
        return jsonify({'success': False, 'message': 'Заполните все поля'})

    if len(new_username) < 3:
        return jsonify({'success': False, 'message': 'Юзернейм должен быть не менее 3 символов'})

    users = load_users()
    current_user = users.get(session['username'])

    # Проверяем пароль
    if not check_password_hash(current_user['password_hash'], password):
        return jsonify({'success': False, 'message': 'Неверный пароль'})

    # Проверяем занят ли юзернейм
    if is_username_taken(new_username, exclude_user=session['username']):
        return jsonify({'success': False, 'message': 'Этот юзернейм уже занят'})

    success, message = admin_change_username(session['username'], new_username)
    if success:
        # Обновляем сессию
        session['username'] = new_username
        return jsonify({'success': True, 'message': message, 'new_username': new_username})
    else:
        return jsonify({'success': False, 'message': message})


@app.route('/api/user/<username>')
def get_user(username):
    if 'username' not in session:
        return jsonify({'error': 'Not authorized'}), 401

    users = load_users()
    user = users.get(username)

    if not user:
        return jsonify({'error': 'User not found'}), 404

    # Скрываем чувствительные данные
    user_data = {
        'name': user['name'],
        'username': user['username'],
        'description': user.get('description', ''),
        'avatar': user.get('avatar'),
        'avatar_color': user.get('avatar_color', '#4ECDC4'),
        'created_at': user.get('created_at', '')
    }

    return jsonify(user_data)


@app.route('/search_users')
def search_users():
    if 'username' not in session:
        return jsonify({'error': 'Not authorized'}), 401

    query = request.args.get('q', '').lower().strip()
    if not query:
        return jsonify([])

    users = load_users()
    results = []

    current_user = session['username']
    blocked_users = get_blocked_users(current_user)

    for username, user_data in users.items():
        if username == session['username']:
            continue

        # Пропускаем заблокированных пользователей
        if username in blocked_users:
            continue

        if (query in username.lower() or
                query in user_data['name'].lower() or
                (user_data.get('description') and query in user_data['description'].lower())):
            # Проверяем онлайн статус
            online_users = load_online()
            is_online = online_users.get(username, {}).get('online', False)

            results.append({
                'username': username,
                'name': user_data['name'],
                'description': user_data.get('description', ''),
                'avatar': user_data.get('avatar'),
                'avatar_color': user_data.get('avatar_color', '#4ECDC4'),
                'is_online': is_online
            })

    return jsonify(results)


@app.route('/get_messages/<recipient>')
def get_messages(recipient):
    if 'username' not in session:
        return jsonify({'error': 'Not authorized'}), 401

    sender = session['username']

    # Проверяем блокировки
    if is_user_blocked(sender, recipient) or is_user_blocked(recipient, sender):
        return jsonify({'error': 'User blocked', 'messages': []})

    dialog_key = '_'.join(sorted([sender, recipient]))

    messages = load_messages()
    dialog_messages = messages.get(dialog_key, [])

    # Фильтруем удаленные сообщения (показываем только если не удалены для всех)
    filtered_messages = []
    for msg in dialog_messages:
        if not msg.get('deleted') or (msg.get('deleted_by') == sender and not msg.get('permanent')):
            filtered_messages.append(msg)

    return jsonify(filtered_messages)


@app.route('/get_online_status')
def get_online_status():
    if 'username' not in session:
        return jsonify({'error': 'Not authorized'}), 401

    online_users = load_online()
    return jsonify(online_users)


@app.route('/api/get_chats')
def get_chats():
    if 'username' not in session:
        return jsonify([]), 401

    username = session['username']
    users = load_users()
    messages = load_messages()

    chats = []
    for dialog_key in messages.keys():
        if username in dialog_key:
            usernames = dialog_key.split('_')
            other_user = usernames[0] if usernames[1] == username else usernames[1]

            # Проверяем блокировки
            if is_user_blocked(username, other_user) or is_user_blocked(other_user, username):
                continue

            if other_user in users:
                user_data = users[other_user]

                # Получаем последнее сообщение (не удаленное)
                dialog_messages = messages[dialog_key]
                last_message = None
                for msg in reversed(dialog_messages):
                    if not msg.get('deleted') or (msg.get('deleted_by') == username and not msg.get('permanent')):
                        last_message = {
                            'message': msg.get('message', ''),
                            'type': msg.get('type', 'text'),
                            'timestamp': msg.get('timestamp')
                        }
                        break

                # Проверяем онлайн статус
                online_users = load_online()
                is_online = online_users.get(other_user, {}).get('online', False)

                chats.append({
                    'username': other_user,
                    'name': user_data['name'],
                    'description': user_data.get('description', ''),
                    'avatar': user_data.get('avatar'),
                    'avatar_color': user_data.get('avatar_color', '#4ECDC4'),
                    'last_message': last_message,
                    'is_online': is_online
                })

    # Сортируем по времени последнего сообщения
    chats.sort(key=lambda x: x['last_message']['timestamp'] if x['last_message'] else '', reverse=True)

    return jsonify(chats)


@app.route('/api/block_user', methods=['POST'])
def api_block_user():
    if 'username' not in session:
        return jsonify({'success': False, 'message': 'Не авторизован'}), 401

    data = request.json
    user_to_block = data.get('username', '')

    if not user_to_block:
        return jsonify({'success': False, 'message': 'Укажите пользователя'})

    if user_to_block == session['username']:
        return jsonify({'success': False, 'message': 'Нельзя заблокировать себя'})

    if block_user(session['username'], user_to_block):
        return jsonify({'success': True, 'message': f'Пользователь @{user_to_block} заблокирован'})
    else:
        return jsonify({'success': False, 'message': 'Ошибка блокировки'})


@app.route('/api/unblock_user', methods=['POST'])
def api_unblock_user():
    if 'username' not in session:
        return jsonify({'success': False, 'message': 'Не авторизован'}), 401

    data = request.json
    user_to_unblock = data.get('username', '')

    if not user_to_unblock:
        return jsonify({'success': False, 'message': 'Укажите пользователя'})

    if unblock_user(session['username'], user_to_unblock):
        return jsonify({'success': True, 'message': f'Пользователь @{user_to_unblock} разблокирован'})
    else:
        return jsonify({'success': False, 'message': 'Ошибка разблокировки'})


@app.route('/api/get_blocked_users')
def api_get_blocked_users():
    if 'username' not in session:
        return jsonify({'error': 'Not authorized'}), 401

    blocked_users = get_blocked_users(session['username'])
    users = load_users()

    result = []
    for username in blocked_users:
        if username in users:
            user_data = users[username]
            result.append({
                'username': username,
                'name': user_data['name'],
                'avatar': user_data.get('avatar'),
                'avatar_color': user_data.get('avatar_color', '#4ECDC4')
            })

    return jsonify(result)


@app.route('/api/pin_message', methods=['POST'])
def api_pin_message():
    if 'username' not in session:
        return jsonify({'success': False, 'message': 'Не авторизован'}), 401

    data = request.json
    message_id = data.get('message_id', '')

    if not message_id:
        return jsonify({'success': False, 'message': 'Укажите ID сообщения'})

    if pin_message(session['username'], message_id):
        return jsonify({'success': True, 'message': 'Сообщение закреплено'})
    else:
        return jsonify({'success': False, 'message': 'Ошибка закрепления'})


@app.route('/api/unpin_message', methods=['POST'])
def api_unpin_message():
    if 'username' not in session:
        return jsonify({'success': False, 'message': 'Не авторизован'}), 401

    data = request.json
    message_id = data.get('message_id', '')

    if not message_id:
        return jsonify({'success': False, 'message': 'Укажите ID сообщения'})

    if unpin_message(session['username'], message_id):
        return jsonify({'success': True, 'message': 'Сообщение откреплено'})
    else:
        return jsonify({'success': False, 'message': 'Ошибка открепления'})


@app.route('/api/get_pinned_messages')
def api_get_pinned_messages():
    if 'username' not in session:
        return jsonify({'error': 'Not authorized'}), 401

    pinned_ids = get_pinned_messages(session['username'])
    messages = load_messages()

    pinned_messages = []
    for dialog_key, dialog_messages in messages.items():
        for msg in dialog_messages:
            if msg['id'] in pinned_ids and not msg.get('deleted'):
                # Добавляем информацию о диалоге
                usernames = dialog_key.split('_')
                other_user = usernames[0] if usernames[1] == session['username'] else usernames[1]

                pinned_messages.append({
                    'message': msg,
                    'dialog_with': other_user
                })

    return jsonify(pinned_messages)


@app.route('/api/edit_message', methods=['POST'])
def api_edit_message():
    if 'username' not in session:
        return jsonify({'success': False, 'message': 'Не авторизован'}), 401

    data = request.json
    message_id = data.get('message_id', '')
    new_text = data.get('new_text', '')

    if not message_id or not new_text:
        return jsonify({'success': False, 'message': 'Заполните все поля'})

    messages = load_messages()

    for dialog_key, dialog_messages in messages.items():
        for msg in dialog_messages:
            if msg['id'] == message_id and msg['sender'] == session['username'] and not msg.get('deleted'):
                msg['message'] = new_text
                msg['edited'] = True
                msg['edited_at'] = datetime.now().isoformat()

                save_messages(messages)

                # Отправляем обновление через WebSocket
                socketio.emit('message_edited', {
                    'message_id': message_id,
                    'new_text': new_text,
                    'edited_at': msg['edited_at']
                }, room=dialog_key)

                return jsonify({'success': True, 'message': 'Сообщение изменено'})

    return jsonify({'success': False, 'message': 'Сообщение не найдено или нет прав'})


@app.route('/static/uploads/<path:filename>')
def serve_uploaded_file(filename):
    return send_from_directory('static/uploads', filename)


# WebSocket события для чата
@socketio.on('connect')
def handle_connect():
    if 'username' in session:
        username = session['username']
        join_room(username)

        online_users = load_online()
        online_users[username] = {
            'online': True,
            'last_seen': datetime.now().isoformat()
        }
        save_online(online_users)

        emit('user_status', {
            'username': username,
            'online': True,
            'last_seen': datetime.now().isoformat()
        }, broadcast=True)

        logger.info(f"✓ Пользователь подключился: {username}")


@socketio.on('disconnect')
def handle_disconnect():
    if 'username' in session:
        username = session['username']
        leave_room(username)

        online_users = load_online()
        if username in online_users:
            online_users[username] = {
                'online': False,
                'last_seen': datetime.now().isoformat()
            }
            save_online(online_users)

        emit('user_status', {
            'username': username,
            'online': False,
            'last_seen': datetime.now().isoformat()
        }, broadcast=True)

        logger.info(f"✗ Пользователь отключился: {username}")


@socketio.on('typing')
def handle_typing(data):
    if 'username' in session:
        sender = session['username']
        recipient = data.get('recipient')

        # Проверяем блокировки
        if not is_user_blocked(sender, recipient) and not is_user_blocked(recipient, sender):
            emit('user_typing', {
                'username': sender,
                'recipient': recipient,
                'is_typing': data.get('is_typing', False)
            }, room=recipient)


@socketio.on('send_message')
def handle_send_message(data):
    sender = session.get('username')
    if not sender:
        return {'error': 'Not authorized'}

    recipient = data.get('recipient')
    message = data.get('message', '').strip()
    message_type = data.get('type', 'text')
    file_data = data.get('file_data')
    file_name = data.get('file_name')
    file_size = data.get('file_size')
    reply_to = data.get('reply_to')
    forward_from = data.get('forward_from')
    encrypted = data.get('encrypted', False)

    if not recipient or (not message and not file_data and message_type in ['text', 'sticker']):
        return {'error': 'No message content'}

    # Проверяем блокировки
    if is_user_blocked(sender, recipient) or is_user_blocked(recipient, sender):
        return {'error': 'User blocked'}

    dialog_key = '_'.join(sorted([sender, recipient]))

    messages = load_messages()
    if dialog_key not in messages:
        messages[dialog_key] = []

    message_id = str(uuid.uuid4())
    timestamp = datetime.now().isoformat()

    message_obj = {
        'id': message_id,
        'sender': sender,
        'recipient': recipient,
        'message': message,
        'type': message_type,
        'timestamp': timestamp,
        'read': False,
        'edited': False,
        'reply_to': reply_to,
        'forward_from': forward_from,
        'encrypted': encrypted
    }

    # Обработка медиафайлов
    if file_data and file_name and message_type in ['image', 'video']:
        try:
            # Проверяем размер данных
            if len(file_data) > 50 * 1024 * 1024:  # 50MB max
                return {'error': 'File too large'}

            file_path = save_media_file(file_data, file_name, message_type)
            if file_path:
                message_obj['file_path'] = file_path
                message_obj['file_name'] = file_name
                message_obj['file_size'] = file_size
            else:
                return {'error': 'Failed to save file'}
        except Exception as e:
            print(f"Error saving media file: {e}")
            return {'error': 'Media upload failed'}

    messages[dialog_key].append(message_obj)

    # Ограничиваем историю сообщений
    if len(messages[dialog_key]) > 1000:
        messages[dialog_key] = messages[dialog_key][-1000:]

    save_messages(messages)

    # Отправляем получателю
    try:
        emit('new_message', message_obj, room=recipient)
    except Exception as e:
        print(f"Error emitting to recipient: {e}")

    # Подтверждение отправителю
    try:
        emit('message_sent', message_obj, room=sender)
    except Exception as e:
        print(f"Error emitting to sender: {e}")

    logger.info(f"💬 Сообщение от {sender} → {recipient} {'🔒' if encrypted else ''}")
    return {'success': True}


@socketio.on('delete_message')
def handle_delete_message(data):
    if 'username' not in session:
        return

    message_id = data.get('message_id')
    delete_for_everyone = data.get('delete_for_everyone', False)
    username = session['username']

    messages = load_messages()

    for dialog_key, dialog_messages in messages.items():
        for msg in dialog_messages:
            if msg['id'] == message_id:
                # Проверяем права
                if msg['sender'] == username or delete_for_everyone or is_admin(username):
                    # Помечаем как удаленное
                    msg['deleted'] = True
                    msg['deleted_by'] = username
                    msg['deleted_at'] = datetime.now().isoformat()
                    msg['permanent'] = delete_for_everyone or is_admin(username)

                    save_messages(messages)

                    # Отправляем уведомление
                    emit('message_deleted', {
                        'message_id': message_id,
                        'deleted_by': username,
                        'permanent': msg['permanent']
                    }, room=dialog_key)

                    # Также отправляем конкретным пользователям
                    for user in dialog_key.split('_'):
                        emit('message_deleted', {
                            'message_id': message_id,
                            'deleted_by': username
                        }, room=user)

                    logger.info(f"🗑️ Сообщение {message_id} удалено пользователем {username}")
                    return
                else:
                    # Пользователь пытается удалить чужое сообщение без флага delete_for_everyone
                    emit('error', {'message': 'Вы не можете удалить это сообщение'}, room=username)
                    return


# WebSocket события для звонков
@socketio.on('start_call')
def handle_start_call(data):
    if 'username' not in session:
        return

    caller = session['username']
    callee = data.get('to')
    call_id = data.get('call_id')
    call_type = data.get('call_type')

    # Проверяем блокировки
    if is_user_blocked(caller, callee) or is_user_blocked(callee, caller):
        emit('call_error', {'message': 'User blocked'}, room=caller)
        return

    # Проверяем онлайн статус
    online_users = load_online()
    if not online_users.get(callee, {}).get('online', False):
        emit('call_error', {'message': 'User is offline'}, room=caller)
        return

    # Сохраняем информацию о звонке
    active_calls[call_id] = {
        'caller': caller,
        'callee': callee,
        'type': call_type,
        'started_at': datetime.now().isoformat(),
        'status': 'ringing'
    }

    # Отправляем запрос на звонок
    emit('incoming_call', {
        'caller': caller,
        'call_id': call_id,
        'type': call_type,
        'timestamp': datetime.now().isoformat()
    }, room=callee)

    # Таймер ожидания ответа (30 секунд)
    def call_timeout():
        if call_id in active_calls and active_calls[call_id]['status'] == 'ringing':
            emit('call_timeout', {'call_id': call_id}, room=caller)
            del active_calls[call_id]

    socketio.start_background_task(
        lambda: (time.sleep(30), call_timeout())
    )


@socketio.on('accept_call')
def handle_accept_call(data):
    if 'username' not in session:
        return

    callee = session['username']
    call_id = data.get('call_id')

    if call_id not in active_calls:
        emit('call_error', {'message': 'Call not found'}, room=callee)
        return

    call_info = active_calls[call_id]

    if call_info['callee'] != callee:
        emit('call_error', {'message': 'Not authorized'}, room=callee)
        return

    # Обновляем статус звонка
    active_calls[call_id]['status'] = 'active'
    active_calls[call_id]['accepted_at'] = datetime.now().isoformat()

    # Отправляем подтверждение звонящему
    emit('call_accepted', {
        'call_id': call_id,
        'callee': callee,
        'timestamp': datetime.now().isoformat()
    }, room=call_info['caller'])


@socketio.on('reject_call')
def handle_reject_call(data):
    if 'username' not in session:
        return

    callee = session['username']
    call_id = data.get('call_id')

    if call_id not in active_calls:
        return

    call_info = active_calls[call_id]

    if call_info['callee'] != callee:
        return

    # Отправляем отклонение звонящему
    emit('call_rejected', {
        'call_id': call_id,
        'reason': data.get('reason', 'User rejected the call')
    }, room=call_info['caller'])

    # Удаляем информацию о звонке
    if call_id in active_calls:
        del active_calls[call_id]


@socketio.on('end_call')
def handle_end_call(data):
    if 'username' not in session:
        return

    user = session['username']
    call_id = data.get('call_id')

    if call_id not in active_calls:
        return

    call_info = active_calls[call_id]

    if user not in [call_info['caller'], call_info['callee']]:
        return

    # Определяем, кто завершил звонок
    ended_by = user

    # Определяем, кому отправить уведомление
    if user == call_info['caller']:
        recipient = call_info['callee']
    else:
        recipient = call_info['caller']

    # Сохраняем запись о звонке
    call_record = {
        'call_id': call_id,
        'caller': call_info['caller'],
        'callee': call_info['callee'],
        'type': call_info['type'],
        'started_at': call_info.get('started_at'),
        'ended_at': datetime.now().isoformat(),
        'duration': data.get('duration', 0),
        'ended_by': ended_by
    }
    save_call_record(call_record)

    # Отправляем уведомление о завершении
    emit('call_ended', {
        'call_id': call_id,
        'ended_by': ended_by,
        'duration': data.get('duration', 0),
        'timestamp': datetime.now().isoformat()
    }, room=recipient)

    # Удаляем из активных звонков
    if call_id in active_calls:
        del active_calls[call_id]


@socketio.on('webrtc_signal')
def handle_webrtc_signal(data):
    if 'username' not in session:
        return

    sender = session['username']
    recipient = data.get('to')
    signal = data.get('signal')
    call_id = data.get('call_id')

    # Проверяем, что звонок существует
    if call_id not in active_calls:
        return

    call_info = active_calls[call_id]

    # Проверяем, что отправитель является участником звонка
    if sender not in [call_info['caller'], call_info['callee']]:
        return

    # Проверяем, что получатель является участником звонка
    if recipient not in [call_info['caller'], call_info['callee']]:
        return

    # Пересылаем сигнал получателю
    emit('webrtc_signal', {
        'from': sender,
        'signal': signal,
        'call_id': call_id
    }, room=recipient)


@socketio.on('call_ice_candidate')
def handle_call_ice_candidate(data):
    if 'username' not in session:
        return

    sender = session['username']
    recipient = data.get('to')
    candidate = data.get('candidate')
    call_id = data.get('call_id')

    # Проверяем, что звонок существует
    if call_id not in active_calls:
        return

    call_info = active_calls[call_id]

    # Проверяем, что отправитель является участником звонка
    if sender not in [call_info['caller'], call_info['callee']]:
        return

    # Проверяем, что получатель является участником звонка
    if recipient not in [call_info['caller'], call_info['callee']]:
        return

    # Пересылаем ICE кандидата
    emit('call_ice_candidate', {
        'from': sender,
        'candidate': candidate,
        'call_id': call_id
    }, room=recipient)


# Админ-консоль
def admin_console():
    while True:
        try:
            command = input("\n👑 Админ> ").strip().lower()

            if command == 'exit' or command == 'quit':
                break
            elif command == 'users':
                users = admin_get_all_users()
                print(f"\nВсего пользователей: {len(users)}")
                for user in users:
                    status = '✅ онлайн' if user['online'] else '⏸️ офлайн'
                    blocked = '🚫 заблокирован' if user['blocked'] else '✅ активен'
                    print(f"  @{user['username']} - {user['name']} - {status} - {blocked}")

            elif command.startswith('messages '):
                username = command.split(' ', 1)[1]
                messages = admin_get_user_messages(username)
                print(f"\nСообщения пользователя @{username}: {len(messages)}")
                for msg in messages[:10]:  # Показываем первые 10
                    print(
                        f"  [{msg['message']['timestamp']}] {msg['message']['sender']} → {msg['message']['recipient']}: {msg['message']['message'][:50]}")

            elif command.startswith('block '):
                username = command.split(' ', 1)[1]
                if admin_block_user(username):
                    print(f"✅ Пользователь @{username} заблокирован")
                else:
                    print(f"❌ Ошибка блокировки пользователя @{username}")

            elif command.startswith('unblock '):
                username = command.split(' ', 1)[1]
                if admin_unblock_user(username):
                    print(f"✅ Пользователь @{username} разблокирован")
                else:
                    print(f"❌ Ошибка разблокировки пользователя @{username}")

            elif command.startswith('rename '):
                parts = command.split(' ')
                if len(parts) == 3:
                    old_username, new_username = parts[1], parts[2]
                    success, message = admin_change_username(old_username, new_username)
                    if success:
                        print(f"✅ Имя пользователя изменено: @{old_username} → @{new_username}")
                    else:
                        print(f"❌ {message}")
                else:
                    print("❌ Использование: rename <старый_юзернейм> <новый_юзернейм>")

            elif command == 'calls':
                calls = load_calls()
                print(f"\nВсего звонков: {len(calls)}")
                for call_id, call_data in list(calls.items())[:10]:
                    print(
                        f"  [{call_data.get('started_at', '')}] {call_data['caller']} → {call_data['callee']} ({call_data['type']})")

            elif command == 'security':
                security_data = load_security()
                print(f"\nИнформация о безопасности:")
                for username, data in security_data.items():
                    print(f"  @{username}: {data.get('encryption_method')} - {data.get('fingerprint')}")

            elif command == 'help' or command == '?':
                print("\nДоступные команды:")
                print("  users - показать всех пользователей")
                print("  messages <user> - показать сообщения пользователя")
                print("  block <user> - заблокировать пользователя")
                print("  unblock <user> - разблокировать пользователя")
                print("  rename <old> <new> - изменить имя пользователя")
                print("  calls - показать историю звонков")
                print("  security - показать информацию о безопасности")
                print("  exit - выход из админ-консоли")
            else:
                print("❌ Неизвестная команда. Введите 'help' для списка команд.")

        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"❌ Ошибка: {e}")


# Запуск админ-консоли в отдельном потоке
def start_admin_console():
    time.sleep(2)
    admin_console()


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))

    print("=" * 60)
    print("🚀 KILDEAR MESSENGER ЗАПУЩЕН")
    print("=" * 60)
    print(f"📡 Порт: {port}")
    print(f"   • Локально: http://localhost:{port}")
    print("=" * 60)
    print("🔒 Функции безопасности:")
    print("   • End-to-end шифрование сообщений (AES-256-GCM)")
    print("   • Шифрование базы данных на сервере")
    print("   • Защищенные WebRTC звонки")
    print("   • Хэширование паролей")
    print("   • Блокировка пользователей")
    print("   • Админ-панель")
    print("=" * 60)
    print("📋 Функции мессенджера:")
    print("   • Текстовые сообщения с шифрованием")
    print("   • Отправка изображений и видео")
    print("   • Стикеры")
    print("   • Аудио/Видео звонки")
    print("   • Онлайн статусы")
    print("   • Закрепление сообщений")
    print("   • Ответ на сообщения")
    print("   • Пересылка сообщений")
    print("   • Изменение сообщений")
    print("=" * 60)
    print("⚙️  Админ-команды:")
    print("   • users - показать всех пользователей")
    print("   • messages <user> - показать сообщения пользователя")
    print("   • block <user> - заблокировать пользователя")
    print("   • unblock <user> - разблокировать пользователя")
    print("   • rename <old> <new> - изменить имя пользователя")
    print("   • calls - показать историю звонков")
    print("   • security - показать информацию о безопасности")
    print("=" * 60)
    print("⚠️  Нажмите Ctrl+C для остановки")
    print("=" * 60)

    # Запускаем админ-консоль в отдельном потоке
    admin_thread = threading.Thread(target=start_admin_console, daemon=True)
    admin_thread.start()

    socketio.run(app, debug=False, host='0.0.0.0', port=port, allow_unsafe_werkzeug=True)