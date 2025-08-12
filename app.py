from flask import Flask, request, jsonify
import sqlite3
from datetime import datetime

app = Flask(__name__)

# インメモリデータベースの設定
def get_db_connection():
    # check_same_thread=False は、マルチスレッド環境での問題を避けるため
    conn = sqlite3.connect(':memory:', check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

# データベースの初期化
def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

# サーバー起動時にデータベースを初期化
init_db()

@app.route('/api/post-message', methods=['POST'])
def post_message():
    data = request.json
    sender_id = data.get('sender_id')
    content = data.get('content')
    
    if not sender_id or not content:
        return jsonify({"error": "Sender ID and content are required"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO messages (sender_id, content) VALUES (?, ?)", (sender_id, content))
    conn.commit()
    message_id = cursor.lastrowid
    conn.close()

    return jsonify({"message": "Message posted successfully", "id": message_id}), 201

@app.route('/api/get-all-messages', methods=['GET'])
def get_all_messages():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM messages ORDER BY id ASC")
    messages = cursor.fetchall()
    conn.close()
    
    messages_list = [dict(row) for row in messages]
    return jsonify({"data": messages_list})

@app.route('/api/get-new-messages', methods=['GET'])
def get_new_messages():
    last_message_id = request.args.get('lastMessageId', 0)
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM messages WHERE id > ? ORDER BY id ASC", (last_message_id,))
    messages = cursor.fetchall()
    conn.close()
    
    messages_list = [dict(row) for row in messages]
    return jsonify({"data": messages_list})

if __name__ == '__main__':
    app.run(debug=True)
