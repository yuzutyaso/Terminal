const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// --- ここにご自身のSupabaseの情報を直接記述してください ---
const SUPABASE_URL = 'https://zlbfsyixwncpictplcvk.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsYmZzeWl4d25jcGljdHBsY3ZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4MDkwOTcsImV4cCI6MjA3MDM4NTA5N30.AGoC-NxJTJPKnyU1pb2ICONGYd4b5EzdW6nkcOyXdao';
// --------------------------------------------------------

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

app.use(cors());
app.use(bodyParser.json());

app.use(express.static('public'));

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

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
