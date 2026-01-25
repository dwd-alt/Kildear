import sqlite3
import os
import json
import base64
import uuid
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
import logging

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class Database:
    def __init__(self, db_path='database/messenger.db'):
        self.db_path = db_path
        self.init_database()

    def get_connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def init_database(self):
        """Инициализация базы данных и создание таблиц"""
        os.makedirs('database', exist_ok=True)
        os.makedirs('static/uploads/avatars', exist_ok=True)
        os.makedirs('static/uploads/media/image', exist_ok=True)
        os.makedirs('static/uploads/media/video', exist_ok=True)
        os.makedirs('static/uploads/media/audio', exist_ok=True)
        os.makedirs('static/uploads/files', exist_ok=True)

        conn = self.get_connection()
        cursor = conn.cursor()

        # Таблица пользователей
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            password_hash TEXT NOT NULL,
            avatar_color TEXT DEFAULT '#4ECDC4',
            avatar TEXT,
            theme TEXT DEFAULT 'dark',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            blocked INTEGER DEFAULT 0,
            is_admin INTEGER DEFAULT 0
        )
        ''')

        # Таблица сообщений
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id TEXT UNIQUE NOT NULL,
            sender TEXT NOT NULL,
            recipient TEXT NOT NULL,
            message TEXT,
            type TEXT DEFAULT 'text',
            file_path TEXT,
            file_name TEXT,
            file_size INTEGER,
            file_type TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            read INTEGER DEFAULT 0,
            edited INTEGER DEFAULT 0,
            edited_at TIMESTAMP,
            deleted INTEGER DEFAULT 0,
            deleted_by TEXT,
            deleted_at TIMESTAMP,
            permanent INTEGER DEFAULT 0,
            FOREIGN KEY (sender) REFERENCES users(username),
            FOREIGN KEY (recipient) REFERENCES users(username)
        )
        ''')

        # Индексы для быстрого поиска сообщений
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_messages_dialog ON messages(sender, recipient, timestamp)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_messages_read ON messages(read)')

        # Таблица онлайн статусов
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS online_status (
            username TEXT PRIMARY KEY,
            online INTEGER DEFAULT 0,
            last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (username) REFERENCES users(username)
        )
        ''')

        # Таблица блокировок
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS blocks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            blocker TEXT NOT NULL,
            blocked_user TEXT NOT NULL,
            blocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(blocker, blocked_user),
            FOREIGN KEY (blocker) REFERENCES users(username),
            FOREIGN KEY (blocked_user) REFERENCES users(username)
        )
        ''')

        # Таблица закрепленных сообщений
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS pinned_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            message_id TEXT NOT NULL,
            pinned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(username, message_id),
            FOREIGN KEY (username) REFERENCES users(username),
            FOREIGN KEY (message_id) REFERENCES messages(message_id)
        )
        ''')

        # Таблица звонков
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS calls (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            call_id TEXT UNIQUE NOT NULL,
            caller TEXT NOT NULL,
            callee TEXT NOT NULL,
            call_type TEXT NOT NULL,
            status TEXT NOT NULL,
            started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            ended_at TIMESTAMP,
            duration INTEGER,
            ended_by TEXT,
            FOREIGN KEY (caller) REFERENCES users(username),
            FOREIGN KEY (callee) REFERENCES users(username)
        )
        ''')

        # Таблица сохраненных чатов
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS saved_chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            chat_with TEXT NOT NULL,
            last_opened TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(username, chat_with),
            FOREIGN KEY (username) REFERENCES users(username),
            FOREIGN KEY (chat_with) REFERENCES users(username)
        )
        ''')

        # Таблица стикеров (если понадобится)
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS stickers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT NOT NULL,
            emoji TEXT NOT NULL,
            added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        ''')

        conn.commit()
        conn.close()
        logger.info("✅ База данных SQLite инициализирована")

    # ============ ПОЛЬЗОВАТЕЛИ ============

    def create_user(self, username, name, password_hash, description=None, avatar_color=None):
        """Создание нового пользователя"""
        conn = self.get_connection()
        cursor = conn.cursor()

        try:
            cursor.execute('''
            INSERT INTO users (username, name, description, password_hash, avatar_color, created_at, last_seen)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (
                username,
                name,
                description,
                password_hash,
                avatar_color or self.generate_color(username),
                datetime.now().isoformat(),
                datetime.now().isoformat()
            ))

            # Создаем запись онлайн статуса
            cursor.execute('''
            INSERT OR REPLACE INTO online_status (username, online, last_seen)
            VALUES (?, 1, ?)
            ''', (username, datetime.now().isoformat()))

            conn.commit()
            logger.info(f"✅ Создан пользователь: {username}")
            return True
        except sqlite3.IntegrityError as e:
            logger.error(f"❌ Ошибка создания пользователя {username}: {e}")
            return False
        finally:
            conn.close()

    def get_user(self, username):
        """Получение пользователя по username"""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute('SELECT * FROM users WHERE username = ?', (username,))
        user = cursor.fetchone()
        conn.close()

        if user:
            return dict(user)
        return None

    def get_all_users(self):
        """Получение всех пользователей"""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute('SELECT * FROM users ORDER BY name')
        users = [dict(row) for row in cursor.fetchall()]
        conn.close()

        return users

    def update_user(self, username, **kwargs):
        """Обновление данных пользователя"""
        conn = self.get_connection()
        cursor = conn.cursor()

        updates = []
        values = []
        for key, value in kwargs.items():
            if value is not None:
                updates.append(f"{key} = ?")
                values.append(value)

        if not updates:
            conn.close()
            return False

        values.append(username)
        query = f"UPDATE users SET {', '.join(updates)} WHERE username = ?"

        try:
            cursor.execute(query, values)
            conn.commit()
            success = cursor.rowcount > 0
            if success:
                logger.info(f"✅ Обновлен пользователь: {username}")
            return success
        except Exception as e:
            logger.error(f"❌ Ошибка обновления пользователя {username}: {e}")
            return False
        finally:
            conn.close()

    def update_last_seen(self, username):
        """Обновление времени последнего посещения"""
        return self.update_user(username, last_seen=datetime.now().isoformat())

    def search_users(self, query, exclude_username=None):
        """Поиск пользователей"""
        conn = self.get_connection()
        cursor = conn.cursor()

        search_term = f"%{query}%"

        if exclude_username:
            cursor.execute('''
            SELECT u.*, os.online 
            FROM users u
            LEFT JOIN online_status os ON u.username = os.username
            WHERE (u.username LIKE ? OR u.name LIKE ? OR u.description LIKE ?) 
            AND u.username != ?
            ORDER BY u.name
            ''', (search_term, search_term, search_term, exclude_username))
        else:
            cursor.execute('''
            SELECT u.*, os.online 
            FROM users u
            LEFT JOIN online_status os ON u.username = os.username
            WHERE u.username LIKE ? OR u.name LIKE ? OR u.description LIKE ?
            ORDER BY u.name
            ''', (search_term, search_term, search_term))

        users = [dict(row) for row in cursor.fetchall()]
        conn.close()

        return users

    # ============ СООБЩЕНИЯ ============

    def add_message(self, message_id, sender, recipient, message, message_type='text',
                    file_path=None, file_name=None, file_size=None, file_type=None):
        """Добавление нового сообщения"""
        conn = self.get_connection()
        cursor = conn.cursor()

        try:
            cursor.execute('''
            INSERT INTO messages 
            (message_id, sender, recipient, message, type, file_path, file_name, file_size, file_type, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                message_id, sender, recipient, message, message_type,
                file_path, file_name, file_size, file_type, datetime.now().isoformat()
            ))

            conn.commit()
            logger.info(f"💬 Сообщение от {sender} → {recipient}")
            return True
        except Exception as e:
            logger.error(f"❌ Ошибка добавления сообщения: {e}")
            return False
        finally:
            conn.close()

    def get_messages(self, user1, user2, limit=1000, offset=0):
        """Получение сообщений между двумя пользователями"""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute('''
        SELECT * FROM messages 
        WHERE ((sender = ? AND recipient = ?) OR (sender = ? AND recipient = ?))
        AND permanent = 0
        AND (deleted = 0 OR deleted_by = ?)
        ORDER BY timestamp ASC
        LIMIT ? OFFSET ?
        ''', (user1, user2, user2, user1, user1, limit, offset))

        messages = [dict(row) for row in cursor.fetchall()]
        conn.close()

        return messages

    def get_message_by_id(self, message_id):
        """Получение сообщения по ID"""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute('SELECT * FROM messages WHERE message_id = ?', (message_id,))
        message = cursor.fetchone()
        conn.close()

        if message:
            return dict(message)
        return None

    def get_last_message(self, user1, user2):
        """Получение последнего сообщения в диалоге"""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute('''
        SELECT * FROM messages 
        WHERE ((sender = ? AND recipient = ?) OR (sender = ? AND recipient = ?))
        AND permanent = 0
        AND (deleted = 0 OR deleted_by = ?)
        ORDER BY timestamp DESC
        LIMIT 1
        ''', (user1, user2, user2, user1, user1))

        message = cursor.fetchone()
        conn.close()

        if message:
            return dict(message)
        return None

    def delete_message(self, message_id, deleted_by, permanent=False):
        """Удаление сообщения"""
        conn = self.get_connection()
        cursor = conn.cursor()

        if permanent:
            cursor.execute('DELETE FROM messages WHERE message_id = ?', (message_id,))
        else:
            cursor.execute('''
            UPDATE messages 
            SET deleted = 1, deleted_by = ?, deleted_at = ?
            WHERE message_id = ?
            ''', (deleted_by, datetime.now().isoformat(), message_id))

        conn.commit()
        success = cursor.rowcount > 0
        conn.close()

        if success:
            logger.info(f"🗑️ Сообщение {message_id} удалено пользователем {deleted_by}")
        return success

    def edit_message(self, message_id, new_text):
        """Редактирование сообщения"""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute('''
        UPDATE messages 
        SET message = ?, edited = 1, edited_at = ?
        WHERE message_id = ?
        ''', (new_text, datetime.now().isoformat(), message_id))

        conn.commit()
        success = cursor.rowcount > 0
        conn.close()

        if success:
            logger.info(f"✏️ Сообщение {message_id} отредактировано")
        return success

    def mark_as_read(self, sender, recipient):
        """Пометка сообщений как прочитанные"""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute('''
        UPDATE messages 
        SET read = 1
        WHERE sender = ? AND recipient = ? AND read = 0
        ''', (sender, recipient))

        count = cursor.rowcount
        conn.commit()
        conn.close()

        if count > 0:
            logger.info(f"👁️ {count} сообщений от {sender} помечены как прочитанные для {recipient}")
        return count

    def get_unread_count(self, recipient):
        """Получение количества непрочитанных сообщений"""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute('''
        SELECT COUNT(*) as count FROM messages 
        WHERE recipient = ? AND read = 0 AND deleted = 0 AND permanent = 0
        ''', (recipient,))

        result = cursor.fetchone()
        conn.close()

        return result['count'] if result else 0

    # ============ ЧАТЫ И КОНТАКТЫ ============

    def get_user_chats(self, username):
        """Получение списка чатов пользователя"""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute('''
        SELECT DISTINCT 
            CASE 
                WHEN sender = ? THEN recipient 
                ELSE sender 
            END as other_user
        FROM messages 
        WHERE (sender = ? OR recipient = ?)
        AND permanent = 0
        AND (deleted = 0 OR deleted_by = ?)
        ''', (username, username, username, username))

        other_users = [row['other_user'] for row in cursor.fetchall()]

        chats = []
        for other_user in other_users:
            # Получаем данные пользователя
            cursor.execute('SELECT * FROM users WHERE username = ?', (other_user,))
            user_data = cursor.fetchone()

            if not user_data:
                continue

            # Получаем онлайн статус
            cursor.execute('SELECT online FROM online_status WHERE username = ?', (other_user,))
            online_result = cursor.fetchone()
            is_online = online_result['online'] if online_result else False

            # Получаем последнее сообщение
            last_message = self.get_last_message(username, other_user)

            # Получаем количество непрочитанных
            cursor.execute('''
            SELECT COUNT(*) as unread_count FROM messages 
            WHERE sender = ? AND recipient = ? AND read = 0 AND deleted = 0 AND permanent = 0
            ''', (other_user, username))

            unread_result = cursor.fetchone()
            unread_count = unread_result['unread_count'] if unread_result else 0

            chats.append({
                'username': other_user,
                'name': user_data['name'],
                'description': user_data['description'],
                'avatar': user_data['avatar'],
                'avatar_color': user_data['avatar_color'],
                'last_message': {
                    'message': last_message['message'] if last_message else '',
                    'type': last_message['type'] if last_message else 'text',
                    'timestamp': last_message['timestamp'] if last_message else None
                } if last_message else None,
                'is_online': bool(is_online),
                'unread_count': unread_count
            })

        # Сортируем по времени последнего сообщения
        chats.sort(key=lambda x: x['last_message']['timestamp'] if x['last_message'] else '', reverse=True)

        conn.close()
        return chats

    def save_current_chat(self, username, chat_with):
        """Сохранение текущего открытого чата"""
        conn = self.get_connection()
        cursor = conn.cursor()

        try:
            cursor.execute('''
            INSERT OR REPLACE INTO saved_chats (username, chat_with, last_opened)
            VALUES (?, ?, ?)
            ''', (username, chat_with, datetime.now().isoformat()))

            conn.commit()
            return True
        except Exception as e:
            logger.error(f"❌ Ошибка сохранения чата: {e}")
            return False
        finally:
            conn.close()

    def get_saved_chat(self, username):
        """Получение последнего сохраненного чата"""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute('''
        SELECT chat_with FROM saved_chats 
        WHERE username = ? 
        ORDER BY last_opened DESC 
        LIMIT 1
        ''', (username,))

        result = cursor.fetchone()
        conn.close()

        return result['chat_with'] if result else None

    # ============ ОНЛАЙН СТАТУС ============

    def update_online_status(self, username, is_online):
        """Обновление онлайн статуса"""
        conn = self.get_connection()
        cursor = conn.cursor()

        try:
            cursor.execute('''
            INSERT OR REPLACE INTO online_status (username, online, last_seen)
            VALUES (?, ?, ?)
            ''', (username, 1 if is_online else 0, datetime.now().isoformat()))

            conn.commit()
            logger.info(f"🌐 Пользователь {username} {'онлайн' if is_online else 'офлайн'}")
            return True
        except Exception as e:
            logger.error(f"❌ Ошибка обновления онлайн статуса: {e}")
            return False
        finally:
            conn.close()

    def get_online_users(self):
        """Получение списка онлайн пользователей"""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute('''
        SELECT u.username, u.name, u.avatar, u.avatar_color, os.last_seen
        FROM online_status os
        JOIN users u ON os.username = u.username
        WHERE os.online = 1
        ORDER BY os.last_seen DESC
        ''')

        online_users = [dict(row) for row in cursor.fetchall()]
        conn.close()

        return online_users

    def get_user_online_status(self, username):
        """Получение онлайн статуса пользователя"""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute('SELECT * FROM online_status WHERE username = ?', (username,))
        result = cursor.fetchone()
        conn.close()

        return dict(result) if result else None

    # ============ БЛОКИРОВКИ ============

    def block_user(self, blocker, user_to_block):
        """Блокировка пользователя"""
        conn = self.get_connection()
        cursor = conn.cursor()

        try:
            cursor.execute('''
            INSERT OR REPLACE INTO blocks (blocker, blocked_user, blocked_at)
            VALUES (?, ?, ?)
            ''', (blocker, user_to_block, datetime.now().isoformat()))

            conn.commit()
            logger.info(f"🚫 {blocker} заблокировал {user_to_block}")
            return True
        except Exception as e:
            logger.error(f"❌ Ошибка блокировки пользователя: {e}")
            return False
        finally:
            conn.close()

    def unblock_user(self, blocker, user_to_unblock):
        """Разблокировка пользователя"""
        conn = self.get_connection()
        cursor = conn.cursor()

        try:
            cursor.execute('''
            DELETE FROM blocks 
            WHERE blocker = ? AND blocked_user = ?
            ''', (blocker, user_to_unblock))

            conn.commit()
            success = cursor.rowcount > 0
            if success:
                logger.info(f"✅ {blocker} разблокировал {user_to_unblock}")
            return success
        except Exception as e:
            logger.error(f"❌ Ошибка разблокировки пользователя: {e}")
            return False
        finally:
            conn.close()

    def is_user_blocked(self, blocker, blocked_user):
        """Проверка, заблокирован ли пользователь"""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute('''
        SELECT 1 FROM blocks 
        WHERE blocker = ? AND blocked_user = ?
        ''', (blocker, blocked_user))

        result = cursor.fetchone() is not None
        conn.close()

        return result

    def get_blocked_users(self, username):
        """Получение списка заблокированных пользователей"""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute('''
        SELECT blocked_user FROM blocks 
        WHERE blocker = ?
        ''', (username,))

        blocked_users = [row['blocked_user'] for row in cursor.fetchall()]
        conn.close()

        return blocked_users

    # ============ ЗАКРЕПЛЕННЫЕ СООБЩЕНИЯ ============

    def pin_message(self, username, message_id):
        """Закрепление сообщения"""
        conn = self.get_connection()
        cursor = conn.cursor()

        try:
            cursor.execute('''
            INSERT OR REPLACE INTO pinned_messages (username, message_id, pinned_at)
            VALUES (?, ?, ?)
            ''', (username, message_id, datetime.now().isoformat()))

            conn.commit()
            logger.info(f"📌 Сообщение {message_id} закреплено пользователем {username}")
            return True
        except Exception as e:
            logger.error(f"❌ Ошибка закрепления сообщения: {e}")
            return False
        finally:
            conn.close()

    def unpin_message(self, username, message_id):
        """Открепление сообщения"""
        conn = self.get_connection()
        cursor = conn.cursor()

        try:
            cursor.execute('''
            DELETE FROM pinned_messages 
            WHERE username = ? AND message_id = ?
            ''', (username, message_id))

            conn.commit()
            success = cursor.rowcount > 0
            if success:
                logger.info(f"📌 Сообщение {message_id} откреплено пользователем {username}")
            return success
        except Exception as e:
            logger.error(f"❌ Ошибка открепления сообщения: {e}")
            return False
        finally:
            conn.close()

    def get_pinned_messages(self, username):
        """Получение закрепленных сообщений пользователя"""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute('''
        SELECT m.* 
        FROM pinned_messages pm
        JOIN messages m ON pm.message_id = m.message_id
        WHERE pm.username = ?
        ORDER BY pm.pinned_at DESC
        ''', (username,))

        messages = [dict(row) for row in cursor.fetchall()]
        conn.close()

        return messages

    # ============ ЗВОНКИ ============

    def save_call(self, call_id, caller, callee, call_type, status='ringing'):
        """Сохранение информации о звонке"""
        conn = self.get_connection()
        cursor = conn.cursor()

        try:
            cursor.execute('''
            INSERT OR REPLACE INTO calls (call_id, caller, callee, call_type, status, started_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ''', (call_id, caller, callee, call_type, status, datetime.now().isoformat()))

            conn.commit()
            logger.info(f"📞 Звонок {call_id} сохранен: {caller} → {callee}")
            return True
        except Exception as e:
            logger.error(f"❌ Ошибка сохранения звонка: {e}")
            return False
        finally:
            conn.close()

    def update_call_status(self, call_id, status, ended_by=None, duration=None):
        """Обновление статуса звонка"""
        conn = self.get_connection()
        cursor = conn.cursor()

        try:
            if status == 'ended':
                cursor.execute('''
                UPDATE calls 
                SET status = ?, ended_at = ?, ended_by = ?, duration = ?
                WHERE call_id = ?
                ''', (status, datetime.now().isoformat(), ended_by, duration, call_id))
            else:
                cursor.execute('''
                UPDATE calls 
                SET status = ?
                WHERE call_id = ?
                ''', (status, call_id))

            conn.commit()
            success = cursor.rowcount > 0
            if success:
                logger.info(f"📞 Звонок {call_id} обновлен: статус {status}")
            return success
        except Exception as e:
            logger.error(f"❌ Ошибка обновления звонка: {e}")
            return False
        finally:
            conn.close()

    def get_call_history(self, username, limit=50):
        """Получение истории звонков"""
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute('''
        SELECT * FROM calls 
        WHERE caller = ? OR callee = ?
        ORDER BY started_at DESC
        LIMIT ?
        ''', (username, username, limit))

        calls = [dict(row) for row in cursor.fetchall()]
        conn.close()

        return calls

    # ============ ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ============

    @staticmethod
    def generate_color(username):
        """Генерация цвета на основе username"""
        colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
                  '#DDA0DD', '#98D8C8', '#F78DA7', '#AB47BC', '#FFA726']
        hash_value = sum(ord(char) for char in username)
        return colors[hash_value % len(colors)]

    def get_user_stats(self, username):
        """Получение статистики пользователя"""
        conn = self.get_connection()
        cursor = conn.cursor()

        # Общее количество сообщений
        cursor.execute('''
        SELECT COUNT(*) as total_messages 
        FROM messages 
        WHERE (sender = ? OR recipient = ?) 
        AND permanent = 0
        ''', (username, username))
        total_messages = cursor.fetchone()['total_messages']

        # Непрочитанные сообщения
        cursor.execute('''
        SELECT COUNT(*) as unread_messages 
        FROM messages 
        WHERE recipient = ? AND read = 0 
        AND deleted = 0 AND permanent = 0
        ''', (username,))
        unread_messages = cursor.fetchone()['unread_messages']

        # Количество чатов
        cursor.execute('''
        SELECT COUNT(DISTINCT 
            CASE 
                WHEN sender = ? THEN recipient 
                ELSE sender 
            END
        ) as chat_count
        FROM messages 
        WHERE (sender = ? OR recipient = ?)
        AND permanent = 0
        ''', (username, username, username))
        chat_count = cursor.fetchone()['chat_count']

        conn.close()

        return {
            'total_messages': total_messages,
            'unread_messages': unread_messages,
            'chat_count': chat_count,
            'created_at': self.get_user(username)['created_at'] if self.get_user(username) else None
        }

    def backup_database(self, backup_path=None):
        """Создание резервной копии базы данных"""
        import shutil

        if not backup_path:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            backup_path = f'database/backups/messenger_backup_{timestamp}.db'

        os.makedirs(os.path.dirname(backup_path), exist_ok=True)

        try:
            shutil.copy2(self.db_path, backup_path)
            logger.info(f"💾 Резервная копия создана: {backup_path}")
            return backup_path
        except Exception as e:
            logger.error(f"❌ Ошибка создания резервной копии: {e}")
            return None

    def cleanup_old_messages(self, days=30):
        """Очистка старых удаленных сообщений"""
        conn = self.get_connection()
        cursor = conn.cursor()

        cutoff_date = (datetime.now() - timedelta(days=days)).isoformat()

        cursor.execute('''
        DELETE FROM messages 
        WHERE deleted = 1 AND permanent = 1 
        AND deleted_at < ?
        ''', (cutoff_date,))

        deleted_count = cursor.rowcount
        conn.commit()
        conn.close()

        if deleted_count > 0:
            logger.info(f"🧹 Удалено {deleted_count} старых сообщений")

        return deleted_count


# Создаем глобальный экземпляр базы данных
db = Database()