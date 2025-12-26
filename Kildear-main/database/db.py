import json
import os
from datetime import datetime
import uuid


class Database:
    def __init__(self):
        self.data_dir = 'database'
        self.messages_file = os.path.join(self.data_dir, 'messages.json')
        self.users_file = os.path.join(self.data_dir, 'users.json')
        self._init_files()

    def _init_files(self):
        os.makedirs(self.data_dir, exist_ok=True)

        if not os.path.exists(self.messages_file):
            with open(self.messages_file, 'w', encoding='utf-8') as f:
                json.dump([], f)

        if not os.path.exists(self.users_file):
            with open(self.users_file, 'w', encoding='utf-8') as f:
                json.dump([], f)

    # Сообщения
    def save_message(self, sender, recipient, message, message_id=None):
        messages = self.load_messages()

        if message_id:  # Редактирование
            for msg in messages:
                if msg.get('id') == message_id and msg['sender'] == sender:
                    msg['text'] = message
                    msg['edited'] = True
                    msg['edited_at'] = datetime.now().isoformat()
                    break
        else:  # Новое сообщение
            new_message = {
                'id': str(uuid.uuid4()),
                'sender': sender,
                'recipient': recipient,
                'text': message,
                'timestamp': datetime.now().isoformat(),
                'edited': False,
                'deleted': False
            }
            messages.append(new_message)

        with open(self.messages_file, 'w', encoding='utf-8') as f:
            json.dump(messages, f, indent=2, ensure_ascii=False)

        return new_message if not message_id else None

    def delete_message(self, message_id, username):
        messages = self.load_messages()
        for msg in messages:
            if msg['id'] == message_id and msg['sender'] == username:
                msg['deleted'] = True
                msg['text'] = 'Сообщение удалено'
                break

        with open(self.messages_file, 'w', encoding='utf-8') as f:
            json.dump(messages, f, indent=2, ensure_ascii=False)

    def load_messages(self, user1=None, user2=None):
        try:
            with open(self.messages_file, 'r', encoding='utf-8') as f:
                messages = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            messages = []

        if user1 and user2:
            filtered = []
            for msg in messages:
                if not msg.get('deleted'):
                    if (msg['sender'] == user1 and msg['recipient'] == user2) or \
                            (msg['sender'] == user2 and msg['recipient'] == user1):
                        filtered.append(msg)
            return filtered

        return messages

    # Пользователи
    def save_user(self, username, password_hash, name, description=""):
        users = self.load_users()

        # Проверяем, существует ли пользователь
        for user in users:
            if user['username'] == username:
                return False

        user = {
            'username': username,
            'password': password_hash,
            'name': name,
            'description': description,
            'created_at': datetime.now().isoformat()
        }
        users.append(user)

        with open(self.users_file, 'w', encoding='utf-8') as f:
            json.dump(users, f, indent=2, ensure_ascii=False)

        return True

    def load_users(self):
        try:
            with open(self.users_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            return []

    def find_user(self, username):
        users = self.load_users()
        for user in users:
            if user['username'] == username:
                return user
        return None

    def get_all_users_except(self, exclude_username):
        users = self.load_users()
        return [user for user in users if user['username'] != exclude_username]


# Глобальный экземпляр
db = Database()