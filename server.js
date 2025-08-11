const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs/promises');

const app = express();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_KEY) {
    console.error('環境変数が設定されていません。VercelのダッシュボードでSUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEYを設定してください。');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

app.use(cors());
app.use(bodyParser.json());

app.use(express.static('public'));

const UPLOAD_DIR = '/tmp/uploads/';
const upload = multer({ dest: UPLOAD_DIR });

fs.mkdir(UPLOAD_DIR, { recursive: true }).catch(err => {
    if (err.code !== 'EEXIST') {
        console.error('Failed to create upload directory:', err);
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 投稿用API
app.post('/api/post-message', async (req, res) => {
    try {
        const { sender_id, content } = req.body;
        if (!sender_id || !content) {
            return res.status(400).json({ error: 'sender_id and content are required' });
        }
        if (content.length > 100) {
            return res.status(400).json({ error: 'メッセージは100文字以内で入力してください。' });
        }
        if (sender_id.length > 15) {
            return res.status(400).json({ error: '名前は15文字以内で入力してください。' });
        }

        const { error } = await supabase.from('messages').insert([{ sender_id, content }]);
        if (error) {
            console.error('Supabase DB insert error:', error);
            return res.status(500).json({ error: 'Failed to post message to database.' });
        }
        res.status(200).json({ message: 'Message posted successfully' });
    } catch (err) {
        console.error('Server error in /api/post-message:', err);
        res.status(500).json({ error: 'サーバーエラー' });
    }
});

// 全メッセージ取得用API
app.get('/api/get-all-messages', async (req, res) => {
    try {
        const { data, error } = await supabase.from('messages').select('*').order('created_at', { ascending: true });
        if (error) {
            console.error('Supabase DB fetch error:', error);
            return res.status(500).json({ error: 'Failed to fetch messages from database.' });
        }
        res.status(200).json({ data });
    } catch (err) {
        console.error('Server error in /api/get-all-messages:', err);
        res.status(500).json({ error: 'サーバーエラー' });
    }
});

// 新しいメッセージ取得用API
app.get('/api/get-new-messages', async (req, res) => {
    try {
        const lastMessageId = parseInt(req.query.lastMessageId);
        if (isNaN(lastMessageId)) {
            return res.status(400).json({ error: 'Invalid lastMessageId' });
        }
        const { data, error } = await supabase.from('messages').select('*').gt('id', lastMessageId).order('created_at', { ascending: true });
        if (error) {
            console.error('Supabase DB fetch error:', error);
            return res.status(500).json({ error: 'Failed to fetch new messages from database.' });
        }
        res.status(200).json({ data });
    } catch (err) {
        console.error('Server error in /api/get-new-messages:', err);
        res.status(500).json({ error: 'サーバーエラー' });
    }
});

// 名前重複チェック用API
app.post('/api/check-name', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name || name.length > 15) {
            return res.status(400).json({ error: '名前は15文字以内で入力してください。' });
        }
        const { data, error } = await supabase.from('messages').select('sender_id').eq('sender_id', name).limit(1);
        if (error) {
            console.error('Supabase DB check-name error:', error);
            return res.status(500).json({ error: 'Failed to check name in database.' });
        }
        res.status(200).json({ exists: data.length > 0 });
    } catch (err) {
        console.error('Server error in /api/check-name:', err);
        res.status(500).json({ error: 'サーバーエラー' });
    }
});

// メッセージクリア用API
app.post('/api/clear-messages', async (req, res) => {
    try {
        const { password } = req.body;
        const { data, error } = await supabaseAdmin.from('passwords').select('value').eq('id', 'clear_password').single();
        if (error || !data || data.value !== password) {
            return res.status(401).json({ error: 'パスワードが違います' });
        }
        const { error: deleteError } = await supabaseAdmin.from('messages').delete().gt('id', 0);
        if (deleteError) {
            console.error('Supabase DB clear-messages error:', deleteError);
            return res.status(500).json({ error: 'メッセージの削除に失敗しました' });
        }
        res.status(200).json({ message: 'メッセージをすべて削除しました' });
    } catch (err) {
        console.error('Server error in /api/clear-messages:', err);
        res.status(500).json({ error: 'サーバーエラー' });
    }
});

// cleanup-files API
app.post('/api/cleanup-files', async (req, res) => {
    try {
        const { data: files, error } = await supabaseAdmin.storage.from('uploads').list();
        if (error) {
            console.error('Supabase Storage list error:', error);
            return res.status(500).json({ error: 'ファイルリストの取得に失敗しました' });
        }
        
        const now = new Date();
        const toDelete = [];
        const MAX_FILES = 25;

        if (files.length > MAX_FILES) {
            files.forEach(file => {
                if (file.name !== '.emptyFolderPlaceholder') {
                    toDelete.push(file.name);
                }
            });
        } else {
            const EXPIRATION_TIME = 24 * 60 * 60 * 1000;
            files.forEach(file => {
                const fileTime = new Date(file.created_at);
                if ((now - fileTime) > EXPIRATION_TIME && file.name !== '.emptyFolderPlaceholder') {
                    toDelete.push(file.name);
                }
            });
        }

        if (toDelete.length > 0) {
            const { error: deleteError } = await supabaseAdmin.storage.from('uploads').remove(toDelete);
            if (deleteError) {
                console.error('Supabase Storage cleanup error:', deleteError);
                return res.status(500).json({ error: 'ファイルの削除に失敗しました' });
            }
        }
        res.status(200).json({ message: '古いファイルを削除しました' });
    } catch (err) {
        console.error('Server error in /api/cleanup-files:', err);
        res.status(500).json({ error: 'サーバーエラー' });
    }
});


// ファイルアップロード用のAPI
app.post('/api/upload-file', upload.single('file'), async (req, res) => {
    try {
        const { senderId, senderName } = req.body;
        const file = req.file;

        if (!file || !senderId) {
            if (file) {
                await fs.unlink(file.path).catch(err => console.error('Failed to unlink file:', err));
            }
            return res.status(400).json({ error: 'File and sender ID are required.' });
        }

        const displayName = senderName || senderId;
        if (displayName.length > 15) {
             await fs.unlink(file.path).catch(err => console.error('Failed to unlink file:', err));
             return res.status(400).json({ error: '名前は15文字以内で入力してください。' });
        }

        const fileExtension = path.extname(file.originalname);
        const fileName = `${Date.now()}-${displayName}${fileExtension}`;

        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
            .from('uploads')
            .upload(fileName, await fs.readFile(file.path), {
                contentType: file.mimetype,
            });

        await fs.unlink(file.path).catch(err => console.error('Failed to unlink file:', err));

        if (uploadError) {
            console.error('Supabase Storage upload error:', uploadError);
            return res.status(500).json({ error: 'Failed to upload file to storage.' });
        }

        const { data: publicUrlData } = supabase
            .storage
            .from('uploads')
            .getPublicUrl(fileName);

        const publicUrl = publicUrlData.publicUrl;
        const finalContent = `ファイルがアップロードされました: <a href="${publicUrl}" target="_blank" class="uploaded-file">${file.originalname}</a>`;

        const { error: insertError } = await supabase.from('messages').insert({ sender_id: displayName, content: finalContent });

        if (insertError) {
            console.error('Supabase DB insert error:', insertError);
            await supabaseAdmin.storage.from('uploads').remove([fileName]).catch(err => console.error('Failed to remove uploaded file:', err));
            return res.status(500).json({ error: 'Failed to post message to database.' });
        }

        res.status(200).json({ message: 'File uploaded and message posted successfully.' });
    } catch (err) {
        console.error('Server error during file upload:', err);
        res.status(500).json({ error: 'Server error during file upload.' });
    }
});

module.exports = app;
