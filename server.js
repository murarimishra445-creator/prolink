const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = 'prolink_secret_2024_change_in_production';

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

// Database setup
const db = new sqlite3.Database('./prolink.db', (err) => {
  if (err) console.error(err.message);
  else console.log('✅ Connected to SQLite database.');
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    headline TEXT DEFAULT '',
    location TEXT DEFAULT '',
    about TEXT DEFAULT '',
    avatar TEXT DEFAULT '',
    connections INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    image TEXT DEFAULT '',
    likes INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    post_id INTEGER,
    UNIQUE(user_id, post_id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(post_id) REFERENCES posts(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requester_id INTEGER,
    receiver_id INTEGER,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(requester_id, receiver_id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS experiences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    duration TEXT DEFAULT '',
    description TEXT DEFAULT '',
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);
});

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

// ─── OPTIONAL AUTH (works with or without token) ───────────────
function optionalAuth(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (token) {
    try { req.user = jwt.verify(token, JWT_SECRET); } catch {}
  }
  next();
}

// ─── PUBLIC STATS ──────────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  db.get(
    `SELECT (SELECT COUNT(*) FROM users) as users, (SELECT COUNT(*) FROM posts) as posts`,
    (err, row) => {
      if (err) return res.json({ users: 0, posts: 0 });
      res.json(row);
    }
  );
});

// ─── AUTH ROUTES ───────────────────────────────────────────────

app.post('/api/register', async (req, res) => {
  const { name, email, password, headline, location } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: 'All fields required' });
  try {
    const hash = await bcrypt.hash(password, 10);
    db.run(
      `INSERT INTO users (name, email, password, headline, location) VALUES (?, ?, ?, ?, ?)`,
      [name, email, hash, headline || '', location || ''],
      function (err) {
        if (err) return res.status(400).json({ error: 'Email already exists' });
        const token = jwt.sign({ id: this.lastID, email }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, userId: this.lastID, name });
      }
    );
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
    if (err || !user) return res.status(400).json({ error: 'Invalid credentials' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, userId: user.id, name: user.name });
  });
});

// ─── USER ROUTES ───────────────────────────────────────────────

app.get('/api/users/me', authMiddleware, (req, res) => {
  db.get(
    `SELECT id, name, email, headline, location, about, avatar, connections FROM users WHERE id = ?`,
    [req.user.id],
    (err, user) => {
      if (err || !user) return res.status(404).json({ error: 'User not found' });
      res.json(user);
    }
  );
});

app.get('/api/users/:id', authMiddleware, (req, res) => {
  db.get(
    `SELECT id, name, email, headline, location, about, avatar, connections FROM users WHERE id = ?`,
    [req.params.id],
    (err, user) => {
      if (err || !user) return res.status(404).json({ error: 'User not found' });
      res.json(user);
    }
  );
});

// Public — search all users
app.get('/api/users', optionalAuth, (req, res) => {
  const search = req.query.q ? `%${req.query.q}%` : '%';
  const excludeId = req.user ? req.user.id : -1;
  db.all(
    `SELECT id, name, headline, location, avatar, connections
     FROM users WHERE (name LIKE ? OR headline LIKE ?) AND id != ?`,
    [search, search, excludeId],
    (err, users) => {
      if (err) return res.status(500).json({ error: 'DB error' });
      res.json(users);
    }
  );
});

app.put('/api/users/me', authMiddleware, (req, res) => {
  const { name, headline, location, about } = req.body;
  db.run(
    `UPDATE users SET name=?, headline=?, location=?, about=? WHERE id=?`,
    [name, headline, location, about, req.user.id],
    (err) => {
      if (err) return res.status(500).json({ error: 'Update failed' });
      res.json({ success: true });
    }
  );
});

app.post('/api/users/avatar', authMiddleware, upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const avatarUrl = `/uploads/${req.file.filename}`;
  db.run(`UPDATE users SET avatar=? WHERE id=?`, [avatarUrl, req.user.id], (err) => {
    if (err) return res.status(500).json({ error: 'Failed' });
    res.json({ avatar: avatarUrl });
  });
});

// ─── POST ROUTES ───────────────────────────────────────────────

// Public — anyone can read posts
app.get('/api/posts', optionalAuth, (req, res) => {
  const userId = req.user ? req.user.id : -1;
  db.all(
    `SELECT p.*, u.name, u.avatar, u.headline,
     (SELECT COUNT(*) FROM likes WHERE post_id = p.id AND user_id = ?) as liked
     FROM posts p JOIN users u ON p.user_id = u.id
     ORDER BY p.created_at DESC LIMIT 50`,
    [userId],
    (err, posts) => {
      if (err) return res.status(500).json({ error: 'DB error' });
      res.json(posts);
    }
  );
});

app.get('/api/posts/user/:id', authMiddleware, (req, res) => {
  db.all(
    `SELECT p.*, u.name, u.avatar, u.headline
     FROM posts p JOIN users u ON p.user_id = u.id
     WHERE p.user_id = ? ORDER BY p.created_at DESC`,
    [req.params.id],
    (err, posts) => {
      if (err) return res.status(500).json({ error: 'DB error' });
      res.json(posts);
    }
  );
});

app.post('/api/posts', authMiddleware, upload.single('image'), (req, res) => {
  const { content } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : '';
  if (!content) return res.status(400).json({ error: 'Content required' });
  db.run(
    `INSERT INTO posts (user_id, content, image) VALUES (?, ?, ?)`,
    [req.user.id, content, image],
    function (err) {
      if (err) return res.status(500).json({ error: 'Post failed' });
      res.json({ id: this.lastID, content, image, likes: 0 });
    }
  );
});

app.delete('/api/posts/:id', authMiddleware, (req, res) => {
  db.run(
    `DELETE FROM posts WHERE id=? AND user_id=?`,
    [req.params.id, req.user.id],
    (err) => {
      if (err) return res.status(500).json({ error: 'Delete failed' });
      res.json({ success: true });
    }
  );
});

// ─── LIKE ROUTES ───────────────────────────────────────────────

app.post('/api/posts/:id/like', authMiddleware, (req, res) => {
  db.get(
    `SELECT * FROM likes WHERE user_id=? AND post_id=?`,
    [req.user.id, req.params.id],
    (err, like) => {
      if (like) {
        db.run(`DELETE FROM likes WHERE user_id=? AND post_id=?`, [req.user.id, req.params.id]);
        db.run(`UPDATE posts SET likes=likes-1 WHERE id=?`, [req.params.id]);
        res.json({ liked: false });
      } else {
        db.run(`INSERT INTO likes (user_id, post_id) VALUES (?,?)`, [req.user.id, req.params.id]);
        db.run(`UPDATE posts SET likes=likes+1 WHERE id=?`, [req.params.id]);
        res.json({ liked: true });
      }
    }
  );
});

// ─── COMMENT ROUTES ────────────────────────────────────────────

// Public — anyone can read comments
app.get('/api/posts/:id/comments', optionalAuth, (req, res) => {
  db.all(
    `SELECT c.*, u.name, u.avatar
     FROM comments c JOIN users u ON c.user_id = u.id
     WHERE c.post_id=? ORDER BY c.created_at ASC`,
    [req.params.id],
    (err, comments) => {
      if (err) return res.status(500).json({ error: 'DB error' });
      res.json(comments);
    }
  );
});

app.post('/api/posts/:id/comments', authMiddleware, (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Content required' });
  db.run(
    `INSERT INTO comments (post_id, user_id, content) VALUES (?,?,?)`,
    [req.params.id, req.user.id, content],
    function (err) {
      if (err) return res.status(500).json({ error: 'Comment failed' });
      res.json({ id: this.lastID, content });
    }
  );
});

// ─── CONNECTION ROUTES ─────────────────────────────────────────

app.post('/api/connect/:id', authMiddleware, (req, res) => {
  db.run(
    `INSERT OR IGNORE INTO connections (requester_id, receiver_id) VALUES (?,?)`,
    [req.user.id, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: 'Failed' });
      res.json({ success: true });
    }
  );
});

app.get('/api/connections', authMiddleware, (req, res) => {
  db.all(
    `SELECT u.id, u.name, u.headline, u.avatar, c.status
     FROM connections c
     JOIN users u ON (c.receiver_id = u.id OR c.requester_id = u.id)
     WHERE (c.requester_id = ? OR c.receiver_id = ?) AND u.id != ?`,
    [req.user.id, req.user.id, req.user.id],
    (err, conns) => {
      if (err) return res.status(500).json({ error: 'DB error' });
      res.json(conns);
    }
  );
});

// ─── EXPERIENCE ROUTES ─────────────────────────────────────────

app.get('/api/experience/:userId', authMiddleware, (req, res) => {
  db.all(
    `SELECT * FROM experiences WHERE user_id=?`,
    [req.params.userId],
    (err, exp) => {
      if (err) return res.status(500).json({ error: 'DB error' });
      res.json(exp);
    }
  );
});

app.post('/api/experience', authMiddleware, (req, res) => {
  const { title, company, duration, description } = req.body;
  db.run(
    `INSERT INTO experiences (user_id, title, company, duration, description) VALUES (?,?,?,?,?)`,
    [req.user.id, title, company, duration, description],
    function (err) {
      if (err) return res.status(500).json({ error: 'Failed' });
      res.json({ id: this.lastID });
    }
  );
});

app.delete('/api/experience/:id', authMiddleware, (req, res) => {
  db.run(
    `DELETE FROM experiences WHERE id=? AND user_id=?`,
    [req.params.id, req.user.id],
    (err) => {
      if (err) return res.status(500).json({ error: 'Delete failed' });
      res.json({ success: true });
    }
  );
});

// ─── SERVE FRONTEND ────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 ProLink server running at http://localhost:${PORT}`);
});
