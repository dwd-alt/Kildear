from flask import Flask, render_template, request, redirect, url_for, session, jsonify
from flask_socketio import SocketIO, emit, join_room, leave_room
from werkzeug.security import generate_password_hash, check_password_hash
import json
import os
from datetime import datetime
import uuid
import base64

app = Flask(__name__)
app.config['SECRET_KEY'] = 'kildear-messenger-secret-2024-secure'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max

# Создаем папки
os.makedirs('static/uploads/avatars', exist_ok=True)
os.makedirs('database', exist_ok=True)

socketio = SocketIO(app, cors_allowed_origins="*")


# Функции для работы с базой данных
def load_json_file(filepath, default_data=None):
    if default_data is None:
        default_data = {}
    try:
        if os.path.exists(filepath) and os.path.getsize(filepath) > 0:
            with open(filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
    except:
        pass
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(default_data, f, ensure_ascii=False, indent=2)
    return default_data


def save_json_file(filepath, data):
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    except:
        return False


def load_users():
    return load_json_file('database/users.json', {})


def save_users(users):
    return save_json_file('database/users.json', users)


def load_messages():
    return load_json_file('database/messages.json', {})


def save_messages(messages):
    return save_json_file('database/messages.json', messages)


def load_online():
    return load_json_file('database/online.json', {})


def save_online(online):
    return save_json_file('database/online.json', online)


def save_avatar(username, base64_data):
    try:
        # Создаем папку если нет
        os.makedirs('static/uploads/avatars', exist_ok=True)

        # Убираем префикс base64 если есть
        if ',' in base64_data:
            base64_data = base64_data.split(',')[1]

        # Декодируем и сохраняем
        img_data = base64.b64decode(base64_data)
        filename = f"{username}_{int(datetime.now().timestamp())}.png"
        filepath = os.path.join('static/uploads/avatars', filename)

        with open(filepath, 'wb') as f:
            f.write(img_data)

        return f"/static/uploads/avatars/{filename}"
    except Exception as e:
        print(f"Ошибка сохранения аватарки: {e}")
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


# Маршруты
@app.route('/')
def index():
    if 'username' in session:
        return redirect(url_for('chat'))
    return redirect(url_for('login'))


@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form.get('username', '').strip().lower()
        name = request.form.get('name', '').strip()
        description = request.form.get('description', '').strip()
        password = request.form.get('password', '')
        confirm_password = request.form.get('confirm_password', '')

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

        # Сохраняем пользователя с хэшем пароля
        users[username] = {
            'name': name,
            'description': description,
            'username': username,
            'password_hash': generate_password_hash(password),
            'avatar_color': generate_color_from_username(username),
            'avatar': None,
            'theme': 'dark',  # По умолчанию темная тема
            'created_at': datetime.now().isoformat(),
            'last_seen': datetime.now().isoformat()
        }
        save_users(users)

        session['username'] = username
        return redirect(url_for('chat'))

    return render_template('register.html')


@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username', '').strip().lower()
        password = request.form.get('password', '')

        users = load_users()
        if username in users:
            user = users[username]
            if check_password_hash(user['password_hash'], password):
                session['username'] = username
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

    # Получаем список контактов
    contacts = []
    for username, user_data in users.items():
        if username != session['username']:
            contacts.append({
                'username': username,
                'name': user_data['name'],
                'description': user_data.get('description', ''),
                'avatar': user_data.get('avatar'),
                'avatar_color': user_data.get('avatar_color', '#4ECDC4')
            })

    return render_template('chat.html',
                           current_user=current_user,
                           contacts=contacts)


@app.route('/profile')
def profile():
    if 'username' not in session:
        return redirect(url_for('login'))

    users = load_users()
    current_user = users.get(session['username'])

    if not current_user:
        session.clear()
        return redirect(url_for('login'))

    return render_template('profile.html', user=current_user)


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

    # Обновляем username во всех сообщениях
    messages = load_messages()
    for dialog_key in list(messages.keys()):
        if session['username'] in dialog_key:
            usernames = dialog_key.split('_')
            if usernames[0] == session['username']:
                new_dialog_key = f"{new_username}_{usernames[1]}"
            else:
                new_dialog_key = f"{usernames[0]}_{new_username}"

            # Обновляем sender в сообщениях
            for message in messages[dialog_key]:
                if message['sender'] == session['username']:
                    message['sender'] = new_username
                if message['recipient'] == session['username']:
                    message['recipient'] = new_username

            messages[new_dialog_key] = messages.pop(dialog_key)

    save_messages(messages)

    # Обновляем пользователя
    users[new_username] = current_user
    users[new_username]['username'] = new_username
    users.pop(session['username'])
    save_users(users)

    # Обновляем сессию
    session['username'] = new_username

    return jsonify({'success': True, 'message': 'Юзернейм изменен', 'new_username': new_username})


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

    for username, user_data in users.items():
        if username == session['username']:
            continue

        if (query in username.lower() or
                query in user_data['name'].lower() or
                (user_data.get('description') and query in user_data['description'].lower())):
            results.append({
                'username': username,
                'name': user_data['name'],
                'description': user_data.get('description', ''),
                'avatar': user_data.get('avatar'),
                'avatar_color': user_data.get('avatar_color', '#4ECDC4')
            })

    return jsonify(results)


@app.route('/get_messages/<recipient>')
def get_messages(recipient):
    if 'username' not in session:
        return jsonify({'error': 'Not authorized'}), 401

    sender = session['username']
    dialog_key = '_'.join(sorted([sender, recipient]))

    messages = load_messages()
    dialog_messages = messages.get(dialog_key, [])

    return jsonify(dialog_messages)


@app.route('/get_online_status')
def get_online_status():
    if 'username' not in session:
        return jsonify({'error': 'Not authorized'}), 401

    online_users = load_online()
    return jsonify(online_users)


# WebSocket события
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

        print(f"✓ Пользователь подключился: {username}")


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

        print(f"✗ Пользователь отключился: {username}")


@socketio.on('typing')
def handle_typing(data):
    if 'username' in session:
        emit('user_typing', {
            'username': session['username'],
            'recipient': data.get('recipient'),
            'is_typing': data.get('is_typing', False)
        }, room=data.get('recipient'))


@socketio.on('send_message')
def handle_send_message(data):
    sender = session.get('username')
    if not sender:
        return

    recipient = data.get('recipient')
    message = data.get('message', '').strip()

    if not recipient or not message:
        return

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
        'timestamp': timestamp,
        'read': False
    }

    messages[dialog_key].append(message_obj)

    # Ограничиваем историю сообщений
    if len(messages[dialog_key]) > 1000:
        messages[dialog_key] = messages[dialog_key][-1000:]

    save_messages(messages)

    # Отправляем получателю
    emit('new_message', message_obj, room=recipient)

    # Подтверждение отправителю
    emit('message_sent', message_obj, room=sender)

    print(f"💬 Сообщение от {sender} → {recipient}: {message[:30]}...")


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))

    print("=" * 50)
    print("🚀 KILDEAR MESSENGER ЗАПУЩЕН")
    print("=" * 50)
    print(f"📡 Порт: {port}")
    print(f"   • Локально: http://localhost:{port}")
    print("=" * 50)
    print("🔒 Функции безопасности:")
    print("   • Хэширование паролей")
    print("   • Сессии пользователей")
    print("   • Валидация данных")
    print("=" * 50)
    print("⚠️  Нажмите Ctrl+C для остановки")
    print("=" * 50)

    socketio.run(app, debug=False, host='0.0.0.0', port=port)  # debug=False на продакшене!
