#!/usr/bin/env python3
"""
CLI для управления Kildear Messenger
"""

import sys
import os

# Добавляем путь к проекту
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Загружаем функции из app.py
from app import (
    read_chat,
    read_user_chats,
    show_user_stats,
    show_all_chats,
    search_messages,
    export_chat
)


def main():
    if len(sys.argv) < 2:
        print("""
📱 KILDEAR MESSENGER CLI

Команды:
  read-chat <user1> <user2> [--limit N]      - Чтение чата
  read-user-chats <username>                 - Все чаты пользователя
  user-stats <username>                      - Статистика пользователя
  all-chats                                  - Все чаты в системе
  search-messages <query>                    - Поиск сообщений
  export-chat <user1> <user2> [--format txt] - Экспорт чата

Примеры:
  python cli.py read-chat alice bob
  python cli.py user-stats alice
  python cli.py all-chats
        """)
        return

    command = sys.argv[1]

    if command == 'read-chat':
        if len(sys.argv) < 4:
            print("Использование: python cli.py read-chat <user1> <user2> [--limit N]")
            return

        limit = 50
        if '--limit' in sys.argv:
            idx = sys.argv.index('--limit')
            if idx + 1 < len(sys.argv):
                limit = int(sys.argv[idx + 1])

        read_chat(sys.argv[2], sys.argv[3], limit)

    elif command == 'read-user-chats':
        if len(sys.argv) < 3:
            print("Использование: python cli.py read-user-chats <username>")
            return
        read_user_chats(sys.argv[2])

    elif command == 'user-stats':
        if len(sys.argv) < 3:
            print("Использование: python cli.py user-stats <username>")
            return
        show_user_stats(sys.argv[2])

    elif command == 'all-chats':
        show_all_chats()

    elif command == 'search-messages':
        if len(sys.argv) < 3:
            print("Использование: python cli.py search-messages <query>")
            return
        search_messages(sys.argv[2])

    elif command == 'export-chat':
        if len(sys.argv) < 4:
            print("Использование: python cli.py export-chat <user1> <user2> [--format json|txt]")
            return

        fmt = 'json'
        if '--format' in sys.argv:
            idx = sys.argv.index('--format')
            if idx + 1 < len(sys.argv):
                fmt = sys.argv[idx + 1]

        export_chat(sys.argv[2], sys.argv[3], fmt)

    else:
        print(f"Неизвестная команда: {command}")


if __name__ == '__main__':
    main()