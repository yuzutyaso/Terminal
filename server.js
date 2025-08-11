const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// Renderの環境変数からSupabaseのURLとキーを読み込む
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // ここにService Role Keyを設定

// Supabaseクライアントを初期化
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ミドルウェア設定
app.use(cors());
app.use(bodyParser.json());

// 静的ファイルを配信
app.use(express.static('public'));

// 投稿用APIルート
app.post('/api/post-message', async (req, res) => {
    const { sender_id, content, my_id } = req.body;

    if (!sender_id || !content || !my_id) {
        return res.status(400).json({ error: 'sender_id, content, my_id is required' });
    }

    const { data, error } = await supabase
        .from('messages')
        .insert([{ sender_id, content, my_id }]);

    if (error) {
        console.error('Supabase insert error:', error);
        return res.status(500).json({ error: 'Failed to post message' });
    }

    res.status(200).json({ message: 'Message posted successfully' });
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
