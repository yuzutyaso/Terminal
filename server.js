const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path'); // pathモジュールを追加

const app = express();

// --- ここにご自身のSupabaseの情報を直接記述してください ---
const SUPABASE_URL = 'https://zlbfsyixwncpictplcvk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsYmZzeWl4d25jcGljdHBsY3ZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4MDkwOTcsImV4cCI6MjA3MDM4NTA5N30.AGoC-NxJTJPKnyU1pb2ICONGYd4b5EzdW6nkcOyXdao';
// --------------------------------------------------------

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

app.use(cors());
app.use(bodyParser.json());

// 静的ファイル（publicフォルダ内のCSS, JSなど）を配信
app.use(express.static('public'));

// ホーム画面のルートを追加
// '/'へのGETリクエストが来たときに、public/index.htmlを返す
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 投稿用APIルート
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

module.exports = app;
