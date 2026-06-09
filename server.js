const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(DB_PATH);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    store: new SQLiteStore({ db: 'sessions.sqlite', dir: __dirname }),
    secret: 'social-wave-secret-change-this',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
  })
);
app.use(express.static(path.join(__dirname, 'public')));

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

async function initDb() {
  await run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    bio TEXT DEFAULT 'New creator on Social Wave ✨',
    avatar TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    image_url TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(post_id) REFERENCES posts(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS likes (
    user_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, post_id)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS follows (
    follower_id INTEGER NOT NULL,
    following_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(follower_id, following_id)
  )`);

  const count = await get('SELECT COUNT(*) as total FROM users');
  if (count.total === 0) {
    const pass = await bcrypt.hash('123456', 10);
    const users = [
      ['Riyan Kumar', 'riyan', 'riyan@mail.com', pass, 'UI designer and coffee lover.'],
      ['Nisha Raj', 'nisha', 'nisha@mail.com', pass, 'Sharing ideas, code, and campus life.'],
      ['Kavin Dev', 'kavin', 'kavin@mail.com', pass, 'Full stack learner building cool apps.']
    ];
    for (const u of users) {
      await run('INSERT INTO users(name, username, email, password, bio) VALUES(?,?,?,?,?)', u);
    }
    await run('INSERT INTO posts(user_id, content) VALUES(?,?)', [1, 'Welcome to Social Wave! This is a premium mini social media platform.']);
    await run('INSERT INTO posts(user_id, content) VALUES(?,?)', [2, 'Today I started a new design challenge. Drop your ideas below!']);
    await run('INSERT INTO posts(user_id, content) VALUES(?,?)', [3, 'Express.js + SQLite is perfect for student full-stack projects.']);
    await run('INSERT INTO comments(post_id, user_id, content) VALUES(?,?,?)', [1, 2, 'Looks clean and premium!']);
    await run('INSERT INTO likes(user_id, post_id) VALUES(?,?)', [2, 1]);
    await run('INSERT INTO likes(user_id, post_id) VALUES(?,?)', [3, 1]);
    await run('INSERT INTO follows(follower_id, following_id) VALUES(?,?)', [2, 1]);
  }
}

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ message: 'Login required' });
  next();
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    email: row.email,
    bio: row.bio,
    avatar: row.avatar,
    created_at: row.created_at
  };
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.post('/api/register', async (req, res) => {
  try {
    const { name, username, email, password } = req.body;
    if (!name || !username || !email || !password) return res.status(400).json({ message: 'All fields required' });
    if (password.length < 6) return res.status(400).json({ message: 'Password must be minimum 6 characters' });
    const cleanUsername = username.toLowerCase().replace(/[^a-z0-9_]/g, '');
    const hashed = await bcrypt.hash(password, 10);
    const result = await run('INSERT INTO users(name, username, email, password) VALUES(?,?,?,?)', [name, cleanUsername, email.toLowerCase(), hashed]);
    req.session.userId = result.id;
    res.json({ message: 'Registered successfully', user: publicUser(await get('SELECT * FROM users WHERE id=?', [result.id])) });
  } catch (err) {
    res.status(400).json({ message: 'Username or email already exists' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await get('SELECT * FROM users WHERE email=? OR username=?', [email.toLowerCase(), email.toLowerCase()]);
    if (!user) return res.status(401).json({ message: 'Invalid login details' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ message: 'Invalid login details' });
    req.session.userId = user.id;
    res.json({ message: 'Login successful', user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ message: 'Login failed' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ message: 'Logged out' }));
});

app.get('/api/me', async (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = await get('SELECT * FROM users WHERE id=?', [req.session.userId]);
  res.json({ user: publicUser(user) });
});

app.put('/api/me', requireAuth, async (req, res) => {
  const { name, bio, avatar } = req.body;
  await run('UPDATE users SET name=?, bio=?, avatar=? WHERE id=?', [name || '', bio || '', avatar || '', req.session.userId]);
  res.json({ message: 'Profile updated', user: publicUser(await get('SELECT * FROM users WHERE id=?', [req.session.userId])) });
});

app.get('/api/posts', async (req, res) => {
  const currentUser = req.session.userId || 0;
  const posts = await all(`
    SELECT p.*, u.name, u.username, u.avatar,
      (SELECT COUNT(*) FROM likes WHERE post_id=p.id) as likes_count,
      (SELECT COUNT(*) FROM comments WHERE post_id=p.id) as comments_count,
      EXISTS(SELECT 1 FROM likes WHERE post_id=p.id AND user_id=?) as liked_by_me
    FROM posts p
    JOIN users u ON p.user_id = u.id
    ORDER BY p.created_at DESC
  `, [currentUser]);
  res.json({ posts });
});

app.post('/api/posts', requireAuth, async (req, res) => {
  const { content, image_url } = req.body;
  if (!content || content.trim().length < 2) return res.status(400).json({ message: 'Post content required' });
  const result = await run('INSERT INTO posts(user_id, content, image_url) VALUES(?,?,?)', [req.session.userId, content.trim(), image_url || '']);
  res.json({ message: 'Post created', id: result.id });
});

app.delete('/api/posts/:id', requireAuth, async (req, res) => {
  const post = await get('SELECT * FROM posts WHERE id=?', [req.params.id]);
  if (!post) return res.status(404).json({ message: 'Post not found' });
  if (post.user_id !== req.session.userId) return res.status(403).json({ message: 'Only owner can delete this post' });
  await run('DELETE FROM comments WHERE post_id=?', [req.params.id]);
  await run('DELETE FROM likes WHERE post_id=?', [req.params.id]);
  await run('DELETE FROM posts WHERE id=?', [req.params.id]);
  res.json({ message: 'Post deleted' });
});

app.post('/api/posts/:id/like', requireAuth, async (req, res) => {
  const existing = await get('SELECT * FROM likes WHERE user_id=? AND post_id=?', [req.session.userId, req.params.id]);
  if (existing) {
    await run('DELETE FROM likes WHERE user_id=? AND post_id=?', [req.session.userId, req.params.id]);
    return res.json({ message: 'Like removed' });
  }
  await run('INSERT INTO likes(user_id, post_id) VALUES(?,?)', [req.session.userId, req.params.id]);
  res.json({ message: 'Post liked' });
});

app.get('/api/posts/:id/comments', async (req, res) => {
  const comments = await all(`
    SELECT c.*, u.name, u.username, u.avatar
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.post_id=?
    ORDER BY c.created_at ASC
  `, [req.params.id]);
  res.json({ comments });
});

app.post('/api/posts/:id/comments', requireAuth, async (req, res) => {
  const { content } = req.body;
  if (!content || content.trim().length < 1) return res.status(400).json({ message: 'Comment required' });
  await run('INSERT INTO comments(post_id, user_id, content) VALUES(?,?,?)', [req.params.id, req.session.userId, content.trim()]);
  res.json({ message: 'Comment added' });
});

app.get('/api/users', async (req, res) => {
  const currentUser = req.session.userId || 0;
  const users = await all(`
    SELECT u.id, u.name, u.username, u.bio, u.avatar,
      (SELECT COUNT(*) FROM follows WHERE following_id=u.id) as followers_count,
      (SELECT COUNT(*) FROM follows WHERE follower_id=u.id) as following_count,
      EXISTS(SELECT 1 FROM follows WHERE follower_id=? AND following_id=u.id) as followed_by_me
    FROM users u
    ORDER BY u.created_at DESC
  `, [currentUser]);
  res.json({ users });
});

app.get('/api/users/:username', async (req, res) => {
  const currentUser = req.session.userId || 0;
  const user = await get(`
    SELECT u.id, u.name, u.username, u.bio, u.avatar, u.created_at,
      (SELECT COUNT(*) FROM follows WHERE following_id=u.id) as followers_count,
      (SELECT COUNT(*) FROM follows WHERE follower_id=u.id) as following_count,
      EXISTS(SELECT 1 FROM follows WHERE follower_id=? AND following_id=u.id) as followed_by_me
    FROM users u WHERE u.username=?
  `, [currentUser, req.params.username]);
  if (!user) return res.status(404).json({ message: 'User not found' });
  const posts = await all(`
    SELECT p.*, u.name, u.username, u.avatar,
      (SELECT COUNT(*) FROM likes WHERE post_id=p.id) as likes_count,
      (SELECT COUNT(*) FROM comments WHERE post_id=p.id) as comments_count,
      EXISTS(SELECT 1 FROM likes WHERE post_id=p.id AND user_id=?) as liked_by_me
    FROM posts p JOIN users u ON p.user_id=u.id
    WHERE u.username=? ORDER BY p.created_at DESC
  `, [currentUser, req.params.username]);
  res.json({ user, posts });
});

app.post('/api/users/:id/follow', requireAuth, async (req, res) => {
  const followingId = Number(req.params.id);
  if (followingId === req.session.userId) return res.status(400).json({ message: 'You cannot follow yourself' });
  const existing = await get('SELECT * FROM follows WHERE follower_id=? AND following_id=?', [req.session.userId, followingId]);
  if (existing) {
    await run('DELETE FROM follows WHERE follower_id=? AND following_id=?', [req.session.userId, followingId]);
    return res.json({ message: 'Unfollowed' });
  }
  await run('INSERT INTO follows(follower_id, following_id) VALUES(?,?)', [req.session.userId, followingId]);
  res.json({ message: 'Followed' });
});

app.get('/api/stats', async (req, res) => {
  const users = await get('SELECT COUNT(*) as total FROM users');
  const posts = await get('SELECT COUNT(*) as total FROM posts');
  const likes = await get('SELECT COUNT(*) as total FROM likes');
  const comments = await get('SELECT COUNT(*) as total FROM comments');
  res.json({ users: users.total, posts: posts.total, likes: likes.total, comments: comments.total });
});

initDb().then(() => {
  app.listen(PORT, () => console.log(`Social Wave running on http://localhost:${PORT}`));
});
