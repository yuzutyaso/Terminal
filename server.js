const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();

// --- 環境変数からSupabaseの情報を読み込む ---
// Vercelのダッシュボードで設定してください
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
// ------------------------------------------

// クライアントでファイルアップロード機能を使う場合、service_roleキーが必要になる可能性あり
// Vercelの環境変数に設定してください
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY); // 管理者権限が必要な操作用

app.use(cors());
app.use(bodyParser.json());

app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- APIエンドポイントの定義 ---

// 投稿用API
app.post('/api/post-message', async (req, res) => {
    const { sender_id, content } = req.body;

    if (!sender_id || !content) {
        return res.status(400).json({ error: 'sender_id and content are required' });
    }

    const { error } = await supabase
        .from('messages')
        .insert([{ sender_id, content }]);

    if (error) {
        console.error('Supabase insert error:', error);
        return res.status(500).json({ error: 'Failed to post message' });
    }

    res.status(200).json({ message: 'Message posted successfully' });
});

// 全メッセージ取得用API
app.get('/api/get-all-messages', async (req, res) => {
    const { data, error } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true });

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    res.status(200).json({ data });
});

// 新しいメッセージ取得用API
app.get('/api/get-new-messages', async (req, res) => {
    const lastMessageId = parseInt(req.query.lastMessageId);

    const { data, error } = await supabase
        .from('messages')
        .select('*')
        .gt('id', lastMessageId)
        .order('created_at', { ascending: true });
    
    if (error) {
        return res.status(500).json({ error: error.message });
    }

    res.status(200).json({ data });
});

// 名前重複チェック用API
app.post('/api/check-name', async (req, res) => {
    const { name } = req.body;

    const { data, error } = await supabase
        .from('messages')
        .select('sender_id')
        .eq('sender_id', name)
        .limit(1);

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    res.status(200).json({ exists: data.length > 0 });
});

// メッセージクリア用API（管理者権限が必要）
app.post('/api/clear-messages', async (req, res) => {
    const { password } = req.body;

    try {
        const { data, error } = await supabaseAdmin
            .from('passwords')
            .select('value')
            .eq('id', 'clear_password')
            .single();

        if (error || data.value !== password) {
            return res.status(401).json({ error: 'パスワードが違います' });
        }

        const { error: deleteError } = await supabaseAdmin
            .from('messages')
            .delete()
            .gt('id', 0);
        
        if (deleteError) {
            return res.status(500).json({ error: 'メッセージの削除に失敗しました' });
        }

        // IDカウンターのリセット
        await supabaseAdmin.rpc('clear_messages_and_reset_id');

        res.status(200).json({ message: 'メッセージをすべて削除しました' });
    } catch (error) {
        res.status(500).json({ error: 'サーバーエラー' });
    }
});

// 古いファイルのクリーンアップAPI
app.post('/api/cleanup-files', async (req, res) => {
    const { data: files, error } = await supabaseAdmin.storage.from('uploads').list();
    if (error) {
        return res.status(500).json({ error: 'ファイルリストの取得に失敗しました' });
    }

    const now = new Date();
    const toDelete = [];

    files.forEach(file => {
        const fileTime = new Date(file.created_at);
        if ((now - fileTime) > 24 * 60 * 60 * 1000 && file.name !== '.emptyFolderPlaceholder') {
            toDelete.push(file.name);
        }
    });

    if (toDelete.length > 0) {
        const { error: deleteError } = await supabaseAdmin.storage.from('uploads').remove(toDelete);
        if (deleteError) {
            return res.status(500).json({ error: 'ファイルの削除に失敗しました' });
        }
    }

    res.status(200).json({ message: '古いファイルを削除しました' });
});

// ファイルアップロード用API
app.post('/api/upload-file', async (req, res) => {
    // この実装は複雑なため、簡略化しています
    // multerなどのライブラリを使い、multipart/form-dataを解析する必要があります
    // ここでは、ファイルアップロードの処理はクライアントサイドに任せることを推奨
    return res.status(400).json({ error: 'このエンドポイントは実装されていません' });
});

module.exports = app;
