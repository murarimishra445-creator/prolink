require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'prolink_secret_2024_change_in_production';

// Database setup
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Create tables on startup
db.query(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    headline TEXT DEFAULT '',
    location TEXT DEFAULT '',
    about TEXT DEFAULT '',
    avatar TEXT DEFAULT '',
    connections INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS posts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    image TEXT DEFAULT '',
    likes INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS likes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    post_id INTEGER,
    UNIQUE(user_id, post_id)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    post_id INTEGER NOT NULL REFERENCES posts(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS connections (
    id SERIAL PRIMARY KEY,
    requester_id INTEGER,
    receiver_id INTEGER,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(requester_id, receiver_id)
  );

  CREATE TABLE IF NOT EXISTS experiences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    duration TEXT DEFAULT '',
    description TEXT DEFAULT ''
  );
`).then(() => console.log('✅ Connected to PostgreSQL database.'))
  .catch(err => console.error('DB Error:', err.message));

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = './uploads';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// ─── AUTH MIDDLEWARE ───────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ─── OPTIONAL AUTH ─────────────────────────────────────────────
function optionalAuth(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (token) {
    try { req.user = jwt.verify(token, JWT_SECRET); } catch {}
  }
  next();
}

// ─── PUBLIC STATS ──────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT (SELECT COUNT(*) FROM users) as users, (SELECT COUNT(*) FROM posts) as posts`
    );
    res.json(result.rows[0]);
  } catch {
    res.json({ users: 0, posts: 0 });
  }
});

// ─── AUTH ROUTES ───────────────────────────────────────────────

app.post('/api/register', async (req, res) => {
  const { name, email, password, headline, location } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: 'All fields required' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await db.query(
      `INSERT INTO users (name, email, password, headline, location) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [name, email, hash, headline || '', location || '']
    );
    const userId = result.rows[0].id;
    const token = jwt.sign({ id: userId, email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, userId, name });
  } catch (e) {
    res.status(400).json({ error: 'Email already exists' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await db.query(`SELECT * FROM users WHERE email = $1`, [email]);
    const user = result.rows[0];
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, userId: user.id, name: user.name });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── USER ROUTES ───────────────────────────────────────────────

app.get('/api/users/me', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, email, headline, location, about, avatar, connections FROM users WHERE id = $1`,
      [req.user.id]
    );
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/users/:id', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, email, headline, location, about, avatar, connections FROM users WHERE id = $1`,
      [req.params.id]
    );
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/users', optionalAuth, async (req, res) => {
  const search = req.query.q ? `%${req.query.q}%` : '%';
  const excludeId = req.user ? req.user.id : -1;
  try {
    const result = await db.query(
      `SELECT id, name, headline, location, avatar, connections
       FROM users WHERE (name ILIKE $1 OR headline ILIKE $2) AND id != $3`,
      [search, search, excludeId]
    );
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'DB error' });
  }
});

app.put('/api/users/me', authMiddleware, async (req, res) => {
  const { name, headline, location, about } = req.body;
  try {
    await db.query(
      `UPDATE users SET name=$1, headline=$2, location=$3, about=$4 WHERE id=$5`,
      [name, headline, location, about, req.user.id]
    );
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Update failed' });
  }
});

app.post('/api/users/avatar', authMiddleware, upload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const avatarUrl = `/uploads/${req.file.filename}`;
  try {
    await db.query(`UPDATE users SET avatar=$1 WHERE id=$2`, [avatarUrl, req.user.id]);
    res.json({ avatar: avatarUrl });
  } catch {
    res.status(500).json({ error: 'Failed' });
  }
});

// ─── POST ROUTES ───────────────────────────────────────────────

app.get('/api/posts', optionalAuth, async (req, res) => {
  const userId = req.user ? req.user.id : -1;
  try {
    const result = await db.query(
      `SELECT p.*, u.name, u.avatar, u.headline,
       (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND user_id = $1)::int as liked
       FROM posts p JOIN users u ON p.user_id = u.id
       ORDER BY p.created_at DESC LIMIT 50`,
      [userId]
    );
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'DB error' });
  }
});

app.get('/api/posts/user/:id', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT p.*, u.name, u.avatar, u.headline
       FROM posts p JOIN users u ON p.user_id = u.id
       WHERE p.user_id = $1 ORDER BY p.created_at DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/api/posts', authMiddleware, upload.single('image'), async (req, res) => {
  const { content } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : '';
  if (!content) return res.status(400).json({ error: 'Content required' });
  try {
    const result = await db.query(
      `INSERT INTO posts (user_id, content, image) VALUES ($1, $2, $3) RETURNING id`,
      [req.user.id, content, image]
    );
    res.json({ id: result.rows[0].id, content, image, likes: 0 });
  } catch {
    res.status(500).json({ error: 'Post failed' });
  }
});

app.delete('/api/posts/:id', authMiddleware, async (req, res) => {
  try {
    await db.query(
      `DELETE FROM posts WHERE id=$1 AND user_id=$2`,
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Delete failed' });
  }
});

// ─── LIKE ROUTES ───────────────────────────────────────────────

app.post('/api/posts/:id/like', authMiddleware, async (req, res) => {
  try {
    const existing = await db.query(
      `SELECT * FROM likes WHERE user_id=$1 AND post_id=$2`,
      [req.user.id, req.params.id]
    );
    if (existing.rows.length > 0) {
      await db.query(`DELETE FROM likes WHERE user_id=$1 AND post_id=$2`, [req.user.id, req.params.id]);
      await db.query(`UPDATE posts SET likes=likes-1 WHERE id=$1`, [req.params.id]);
      res.json({ liked: false });
    } else {
      await db.query(`INSERT INTO likes (user_id, post_id) VALUES ($1,$2)`, [req.user.id, req.params.id]);
      await db.query(`UPDATE posts SET likes=likes+1 WHERE id=$1`, [req.params.id]);
      res.json({ liked: true });
    }
  } catch {
    res.status(500).json({ error: 'Like failed' });
  }
});

// ─── COMMENT ROUTES ────────────────────────────────────────────

app.get('/api/posts/:id/comments', optionalAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT c.*, u.name, u.avatar
       FROM comments c JOIN users u ON c.user_id = u.id
       WHERE c.post_id=$1 ORDER BY c.created_at ASC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/api/posts/:id/comments', authMiddleware, async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Content required' });
  try {
    const result = await db.query(
      `INSERT INTO comments (post_id, user_id, content) VALUES ($1,$2,$3) RETURNING id`,
      [req.params.id, req.user.id, content]
    );
    res.json({ id: result.rows[0].id, content });
  } catch {
    res.status(500).json({ error: 'Comment failed' });
  }
});

// ─── CONNECTION ROUTES ─────────────────────────────────────────

app.post('/api/connect/:id', authMiddleware, async (req, res) => {
  try {
    await db.query(
      `INSERT INTO connections (requester_id, receiver_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [req.user.id, req.params.id]
    );
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed' });
  }
});

app.get('/api/connections', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.id, u.name, u.headline, u.avatar, c.status
       FROM connections c
       JOIN users u ON (c.receiver_id = u.id OR c.requester_id = u.id)
       WHERE (c.requester_id = $1 OR c.receiver_id = $2) AND u.id != $3`,
      [req.user.id, req.user.id, req.user.id]
    );
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'DB error' });
  }
});

// ─── EXPERIENCE ROUTES ─────────────────────────────────────────

app.get('/api/experience/:userId', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM experiences WHERE user_id=$1`,
      [req.params.userId]
    );
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/api/experience', authMiddleware, async (req, res) => {
  const { title, company, duration, description } = req.body;
  try {
    const result = await db.query(
      `INSERT INTO experiences (user_id, title, company, duration, description) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [req.user.id, title, company, duration, description]
    );
    res.json({ id: result.rows[0].id });
  } catch {
    res.status(500).json({ error: 'Failed' });
  }
});

app.delete('/api/experience/:id', authMiddleware, async (req, res) => {
  try {
    await db.query(
      `DELETE FROM experiences WHERE id=$1 AND user_id=$2`,
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Delete failed' });
  }
});

// ─── SERVE FRONTEND ────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 ProLink server running at http://localhost:${PORT}`);
  });
}

module.exports = app;