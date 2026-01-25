# database/db_models.py
import json
import os
from datetime import datetime
import uuid


class DatabaseManager:
    def __init__(self):
        self.base_dir = 'database'
        self.ensure_directories()

    def ensure_directories(self):
        """Создает необходимые директории"""
        directories = [
            self.base_dir,
            'static/uploads/groups',
            'static/uploads/channels'
        ]

        for directory in directories:
            os.makedirs(directory, exist_ok=True)

    def load_file(self, filename, default=None):
        """Загружает данные из JSON файла"""
        if default is None:
            default = {}

        filepath = os.path.join(self.base_dir, filename)

        try:
            if os.path.exists(filepath) and os.path.getsize(filepath) > 0:
                with open(filepath, 'r', encoding='utf-8') as f:
                    return json.load(f)
        except Exception as e:
            print(f"Error loading {filepath}: {e}")

        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(default, f, ensure_ascii=False, indent=2)
        return default

    def save_file(self, filename, data):
        """Сохраняет данные в JSON файл"""
        filepath = os.path.join(self.base_dir, filename)

        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            return True
        except Exception as e:
            print(f"Error saving {filepath}: {e}")
            return False


class GroupManager(DatabaseManager):
    def __init__(self):
        super().__init__()
        self.groups_file = 'groups.json'
        self.group_members_file = 'group_members.json'
        self.group_messages_file = 'group_messages.json'

    def create_group(self, name, description, creator, avatar_color=None, is_private=False):
        """Создает новую группу"""
        groups = self.load_file(self.groups_file)

        group_id = str(uuid.uuid4())

        groups[group_id] = {
            'id': group_id,
            'name': name,
            'description': description,
            'creator': creator,
            'created_at': datetime.now().isoformat(),
            'avatar': None,
            'avatar_color': avatar_color or self.generate_color(name),
            'is_private': is_private,
            'invite_link': f"group_{group_id}_{uuid.uuid4().hex[:8]}",
            'settings': {
                'send_messages': 'all',  # all, admins_only
                'add_members': 'all',  # all, admins_only
                'pin_messages': 'admins_only',
                'change_info': 'admins_only',
                'delete_messages': 'admins_only'
            }
        }

        # Добавляем создателя как администратора
        self.add_group_member(group_id, creator, 'admin')

        self.save_file(self.groups_file, groups)
        return group_id

    def update_group(self, group_id, updates):
        """Обновляет информацию о группе"""
        groups = self.load_file(self.groups_file)

        if group_id in groups:
            groups[group_id].update(updates)
            self.save_file(self.groups_file, groups)
            return True
        return False

    def delete_group(self, group_id):
        """Удаляет группу"""
        groups = self.load_file(self.groups_file)

        if group_id in groups:
            del groups[group_id]
            self.save_file(self.groups_file, groups)
            return True
        return False

    def get_group(self, group_id):
        """Получает информацию о группе"""
        groups = self.load_file(self.groups_file)
        return groups.get(group_id)

    def get_user_groups(self, username):
        """Получает все группы пользователя"""
        group_members = self.load_file(self.group_members_file)
        groups = self.load_file(self.groups_file)

        user_groups = []
        for group_id, members in group_members.items():
            if username in members:
                group_info = groups.get(group_id)
                if group_info:
                    group_info['role'] = members[username]
                    user_groups.append(group_info)

        return user_groups

    def add_group_member(self, group_id, username, role='member'):
        """Добавляет участника в группу"""
        group_members = self.load_file(self.group_members_file)

        if group_id not in group_members:
            group_members[group_id] = {}

        group_members[group_id][username] = role
        self.save_file(self.group_members_file, group_members)
        return True

    def remove_group_member(self, group_id, username):
        """Удаляет участника из группы"""
        group_members = self.load_file(self.group_members_file)

        if group_id in group_members and username in group_members[group_id]:
            del group_members[group_id][username]
            self.save_file(self.group_members_file, group_members)
            return True
        return False

    def get_group_members(self, group_id):
        """Получает всех участников группы"""
        group_members = self.load_file(self.group_members_file)
        return group_members.get(group_id, {})

    def save_group_message(self, group_id, sender, message, message_type='text', file_data=None):
        """Сохраняет сообщение в группе"""
        group_messages = self.load_file(self.group_messages_file)

        if group_id not in group_messages:
            group_messages[group_id] = []

        message_id = str(uuid.uuid4())

        message_obj = {
            'id': message_id,
            'group_id': group_id,
            'sender': sender,
            'message': message,
            'type': message_type,
            'timestamp': datetime.now().isoformat(),
            'read_by': [sender]
        }

        if file_data:
            message_obj.update(file_data)

        group_messages[group_id].append(message_obj)

        # Ограничиваем историю сообщений
        if len(group_messages[group_id]) > 1000:
            group_messages[group_id] = group_messages[group_id][-1000:]

        self.save_file(self.group_messages_file, group_messages)
        return message_obj

    def get_group_messages(self, group_id, limit=100):
        """Получает сообщения группы"""
        group_messages = self.load_file(self.group_messages_file)
        messages = group_messages.get(group_id, [])
        return messages[-limit:] if limit else messages

    def generate_color(self, text):
        """Генерирует цвет на основе текста"""
        colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8']
        hash_value = sum(ord(char) for char in text)
        return colors[hash_value % len(colors)]


class ChannelManager(DatabaseManager):
    def __init__(self):
        super().__init__()
        self.channels_file = 'channels.json'
        self.channel_subscribers_file = 'channel_subscribers.json'
        self.channel_messages_file = 'channel_messages.json'

    def create_channel(self, name, description, creator, avatar_color=None, is_private=False):
        """Создает новый канал"""
        channels = self.load_file(self.channels_file)

        channel_id = str(uuid.uuid4())

        channels[channel_id] = {
            'id': channel_id,
            'name': name,
            'description': description,
            'creator': creator,
            'created_at': datetime.now().isoformat(),
            'avatar': None,
            'avatar_color': avatar_color or self.generate_color(name),
            'is_private': is_private,
            'invite_link': f"channel_{channel_id}_{uuid.uuid4().hex[:8]}",
            'settings': {
                'send_messages': 'admins_only',  # admins_only
                'add_subscribers': 'admins_only',
                'pin_messages': 'admins_only',
                'change_info': 'admins_only',
                'delete_messages': 'admins_only',
                'show_subscribers': True,
                'show_admins': True
            }
        }

        # Добавляем создателя как администратора
        self.add_channel_subscriber(channel_id, creator, 'admin')

        self.save_file(self.channels_file, channels)
        return channel_id

    def get_user_channels(self, username):
        """Получает все каналы пользователя"""
        channel_subscribers = self.load_file(self.channel_subscribers_file)
        channels = self.load_file(self.channels_file)

        user_channels = []
        for channel_id, subscribers in channel_subscribers.items():
            if username in subscribers:
                channel_info = channels.get(channel_id)
                if channel_info:
                    channel_info['role'] = subscribers[username]
                    user_channels.append(channel_info)

        return user_channels

    def add_channel_subscriber(self, channel_id, username, role='subscriber'):
        """Добавляет подписчика в канал"""
        channel_subscribers = self.load_file(self.channel_subscribers_file)

        if channel_id not in channel_subscribers:
            channel_subscribers[channel_id] = {}

        channel_subscribers[channel_id][username] = role
        self.save_file(self.channel_subscribers_file, channel_subscribers)
        return True

    def save_channel_message(self, channel_id, sender, message, message_type='text', file_data=None):
        """Сохраняет сообщение в канале"""
        channel_messages = self.load_file(self.channel_messages_file)

        if channel_id not in channel_messages:
            channel_messages[channel_id] = []

        message_id = str(uuid.uuid4())

        message_obj = {
            'id': message_id,
            'channel_id': channel_id,
            'sender': sender,
            'message': message,
            'type': message_type,
            'timestamp': datetime.now().isoformat()
        }

        if file_data:
            message_obj.update(file_data)

        channel_messages[channel_id].append(message_obj)

        # Ограничиваем историю сообщений
        if len(channel_messages[channel_id]) > 1000:
            channel_messages[channel_id] = channel_messages[channel_id][-1000:]

        self.save_file(self.channel_messages_file, channel_messages)
        return message_obj

    def generate_color(self, text):
        """Генерирует цвет на основе текста"""
        colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8']
        hash_value = sum(ord(char) for char in text)
        return colors[hash_value % len(colors)]


# Инициализация менеджеров
group_manager = GroupManager()
channel_manager = ChannelManager()