# coding: utf-8
import os
import sqlite3
import hashlib
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, g, send_from_directory
from werkzeug.utils import secure_filename

# Flaskアプリの初期化
app = Flask(__name__, static_folder='public', static_url_path='')

# データベースファイルのパス
DATABASE = 'messages.db'

# メッセージクリア用の管理者パスワードを設定してください
ADMIN_PASSWORD = "your_secret_password"

# データベース接続のヘルパー関数
def get_db():
    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = sqlite3.connect(DATABASE)
        db.row_factory = sqlite3.Row  # 辞書形式で結果を取得
    return db

# アプリケーションの終了時にデータベース接続を閉じる
@app.teardown_appcontext
def close_connection(exception):
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()

# データベースを初期化する関数
def init_db():
    with app.app_context():
        db = get_db()
        cursor = db.cursor()
        
        # messagesテーブル: 掲示板の投稿
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sender_id TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        ''')
        
        # banned_usersテーブル: 投稿を禁止されたユーザーID
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS banned_users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL UNIQUE,
                banned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        ''')

        # inappropriate_wordsテーブル: 不適切なワードリスト
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS inappropriate_words (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                word TEXT NOT NULL UNIQUE
            );
        ''')
        
        # filesテーブル: アップロードされたファイル情報
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        ''')

        # topicテーブル: 現在の話題
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS topic (
                id INTEGER PRIMARY KEY,
                content TEXT NOT NULL
            );
        ''')
        
        # topicテーブルが空の場合、デフォルトのトピックを挿入
        cursor.execute('SELECT COUNT(*) FROM topic')
        if cursor.fetchone()[0] == 0:
            cursor.execute('INSERT INTO topic (id, content) VALUES (?, ?)', (1, 'まだ話題が設定されていません'))
        
        db.commit()

# アプリケーション起動時にデータベースを初期化
init_db()

# 不適切なワードリスト
# データベースから取得するよう修正
def fetch_inappropriate_words():
    db = get_db()
    cursor = db.cursor()
    cursor.execute('SELECT word FROM inappropriate_words')
    return [row['word'] for row in cursor.fetchall()]

def contains_inappropriate_words(text):
    if not text:
        return False
    words = fetch_inappropriate_words()
    return any(word.lower() in text.lower() for word in words)

# ファイルのクリーンアップ関数
def cleanup_files():
    db = get_db()
    cursor = db.cursor()
    # 24時間以上前のファイルを削除
    threshold = datetime.now() - timedelta(hours=24)
    cursor.execute('SELECT filename FROM files WHERE uploaded_at < ?', (threshold,))
    old_files = cursor.fetchall()
    
    for file in old_files:
        filepath = os.path.join(app.static_folder, file['filename'])
        if os.path.exists(filepath):
            try:
                os.remove(filepath)
                print(f"古いファイルを削除しました: {filepath}")
            except OSError as e:
                print(f"ファイルの削除に失敗しました {filepath}: {e}")
    
    cursor.execute('DELETE FROM files WHERE uploaded_at < ?', (threshold,))
    db.commit()

# ルートURL (/) にアクセスがあったときに public/index.html を返す
@app.route('/')
def serve_index():
    return send_from_directory('public', 'index.html')

# メッセージを投稿するAPI
@app.route('/api/post-message', methods=['POST'])
def post_message():
    data = request.json
    sender_id = data.get('sender_id')
    content = data.get('content')

    if not sender_id or not content:
        return jsonify({'error': 'sender_id と content は必須です。'}), 400

    db = get_db()
    cursor = db.cursor()

    # BANユーザーチェック
    cursor.execute('SELECT user_id FROM banned_users WHERE user_id = ?', (sender_id,))
    if cursor.fetchone():
        return jsonify({'error': 'あなたは投稿を禁止されています。'}), 403

    # 不適切なワードチェック
    if contains_inappropriate_words(content):
        # 不適切なワードを検知した場合、即座にBANリストに登録
        try:
            cursor.execute('INSERT INTO banned_users (user_id) VALUES (?)', (sender_id,))
            db.commit()
            print(f"不適切なワードを投稿したため、ユーザーID {sender_id} をBANしました。")
        except sqlite3.IntegrityError:
            pass  # すでにBANされている場合は無視
        return jsonify({'error': '不適切なワードを検知しました。IDをBANします。'}), 403

    # メッセージをデータベースに挿入
    cursor.execute('INSERT INTO messages (sender_id, content) VALUES (?, ?)', (sender_id, content))
    db.commit()
    return jsonify({'message': 'Message posted successfully', 'id': cursor.lastrowid})

# すべてのメッセージを取得するAPI
@app.route('/api/get-all-messages', methods=['GET'])
def get_all_messages():
    db = get_db()
    cursor = db.cursor()
    cursor.execute('SELECT * FROM messages ORDER BY created_at ASC')
    messages = cursor.fetchall()
    data = [dict(row) for row in messages]
    return jsonify({'data': data})

# 新しいメッセージを取得するAPI
@app.route('/api/get-new-messages', methods=['GET'])
def get_new_messages():
    last_message_id = request.args.get('lastMessageId', 0, type=int)
    db = get_db()
    cursor = db.cursor()
    cursor.execute('SELECT * FROM messages WHERE id > ? ORDER BY created_at ASC', (last_message_id,))
    messages = cursor.fetchall()
    data = [dict(row) for row in messages]
    return jsonify({'data': data})

# BOTが時間を投稿するAPI
@app.route('/api/get-time', methods=['POST'])
def get_time():
    db = get_db()
    cursor = db.cursor()
    now = datetime.now()
    jst_now = now + timedelta(hours=9)
    formatted_time = jst_now.strftime("%Y/%m/%d %H:%M:%S")
    content = f'現在の日本時間は {formatted_time} です。'
    cursor.execute('INSERT INTO messages (sender_id, content) VALUES (?, ?)', ('BOT', content))
    db.commit()
    return jsonify({'message': 'Time message posted successfully'})

# ユーザー名を変更するAPI
@app.route('/api/check-name', methods=['POST'])
def check_name():
    data = request.json
    name = data.get('name')
    if not name or len(name) > 15:
        return jsonify({'error': '名前は15文字以内で入力してください。'}), 400
    
    if contains_inappropriate_words(name):
        return jsonify({'error': '不適切なワードが含まれています。'}), 403

    db = get_db()
    cursor = db.cursor()
    cursor.execute('SELECT sender_id FROM messages WHERE sender_id = ?', (name,))
    exists = cursor.fetchone() is not None
    return jsonify({'exists': exists})

# メッセージを全削除するAPI
@app.route('/api/clear-messages', methods=['POST'])
def clear_messages():
    data = request.json
    password = data.get('password')
    
    # ハッシュ化されたパスワードとADMIN_PASSWORDを比較する
    # 実際のアプリケーションでは、パスワードはハッシュ化して保存し、比較します
    if password != ADMIN_PASSWORD:
        return jsonify({'error': 'パスワードが違います'}), 401
    
    db = get_db()
    cursor = db.cursor()
    cursor.execute('DELETE FROM messages')
    db.commit()
    return jsonify({'message': 'メッセージをすべて削除しました'})

# ユーザーをBANするAPI
@app.route('/api/ban-user', methods=['POST'])
def ban_user():
    data = request.json
    user_id_to_ban = data.get('userIdToBan')
    if not user_id_to_ban:
        return jsonify({'error': 'BANするユーザーIDを指定してください。'}), 400
    
    db = get_db()
    cursor = db.cursor()
    try:
        cursor.execute('INSERT INTO banned_users (user_id) VALUES (?)', (user_id_to_ban,))
        db.commit()
        return jsonify({'message': f'ユーザーID {user_id_to_ban} をBANしました。'})
    except sqlite3.IntegrityError:
        return jsonify({'error': 'このユーザーはすでにBANされています。'}), 409

# ファイルアップロードAPI
@app.route('/api/upload-file', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'ファイルがありません。'}), 400

    file = request.files['file']
    sender_id = request.form.get('senderId')
    sender_name = request.form.get('senderName')
    
    if not file.filename:
        return jsonify({'error': 'ファイル名がありません。'}), 400

    if contains_inappropriate_words(sender_name or sender_id):
        return jsonify({'error': '不適切なワードが含まれています。IDをBANします。'}), 403

    db = get_db()
    cursor = db.cursor()
    # BANユーザーチェック
    cursor.execute('SELECT user_id FROM banned_users WHERE user_id = ?', (sender_id,))
    if cursor.fetchone():
        return jsonify({'error': 'あなたは投稿を禁止されています。'}), 403

    # ファイルを保存し、データベースに記録
    filename = secure_filename(file.filename)
    filepath = os.path.join(app.static_folder, filename)
    file.save(filepath)
    
    cursor.execute('INSERT INTO files (filename) VALUES (?)', (filename,))
    db.commit()

    # メッセージとして投稿
    display_name = sender_name or sender_id
    content = f'ファイルがアップロードされました: <a href="/{filename}" target="_blank" class="uploaded-file">{file.filename}</a>'
    cursor.execute('INSERT INTO messages (sender_id, content) VALUES (?, ?)', (display_name, content))
    db.commit()

    return jsonify({'message': 'ファイルが正常にアップロードされました。', 'id': cursor.lastrowid})

# トピックを設定するAPI
@app.route('/api/set-topic', methods=['POST'])
def set_topic():
    data = request.json
    password = data.get('password')
    new_topic = data.get('topic')

    # パスワード認証 (ここでは簡単な例として固定パスワードを使用)
    if password != ADMIN_PASSWORD:
        return jsonify({'error': '管理者パスワードが違います。'}), 401
    
    db = get_db()
    cursor = db.cursor()
    cursor.execute('UPDATE topic SET content = ? WHERE id = ?', (new_topic, 1))
    db.commit()
    
    return jsonify({'message': 'トピックが正常に更新されました。'})

# 現在のトピックを取得するAPI
@app.route('/api/get-topic', methods=['GET'])
def get_topic():
    db = get_db()
    cursor = db.cursor()
    cursor.execute('SELECT content FROM topic WHERE id = ?', (1,))
    topic_content = cursor.fetchone()
    
    if topic_content:
        return jsonify({'topic': topic_content['content']})
    else:
        return jsonify({'topic': 'トピックは設定されていません。'})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)

