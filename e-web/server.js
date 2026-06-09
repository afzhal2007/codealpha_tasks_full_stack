const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bcrypt = require('bcryptjs');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;
const db = new Database(path.join(__dirname, 'eweb.db'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    store: new SQLiteStore({ db: 'sessions.db', dir: __dirname }),
    secret: process.env.SESSION_SECRET || 'e-web-premium-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  })
);

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price INTEGER NOT NULL,
      image TEXT NOT NULL,
      short_desc TEXT NOT NULL,
      description TEXT NOT NULL,
      stock INTEGER DEFAULT 20,
      rating REAL DEFAULT 4.5,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cart_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(product_id) REFERENCES products(id),
      UNIQUE(user_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      total INTEGER NOT NULL,
      status TEXT DEFAULT 'Processing',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      price INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      FOREIGN KEY(order_id) REFERENCES orders(id),
      FOREIGN KEY(product_id) REFERENCES products(id)
    );
  `);

  const count = db.prepare('SELECT COUNT(*) AS total FROM products').get().total;
  if (count === 0) {
    const insert = db.prepare(`
      INSERT INTO products (name, category, price, image, short_desc, description, stock, rating)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const products = [
      ['AFXX Smart Watch Pro', 'Wearables', 2499, '⌚', 'Premium smart watch with fitness tracking.', 'A stylish smart watch for students and creators. Includes activity tracking, notifications, sleep insights, water reminder and long battery life.', 18, 4.8],
      ['AFXX Wireless Earbuds', 'Audio', 1799, '🎧', 'Noise-isolating earbuds with deep bass.', 'Compact wireless earbuds with premium bass, gaming mode, crystal clear mic and Type-C fast charging case.', 25, 4.6],
      ['AFXX Gaming Mouse', 'Accessories', 899, '🖱️', 'RGB gaming mouse with fast response.', 'Lightweight ergonomic gaming mouse with RGB glow, high DPI sensor and smooth click response for coding and gaming.', 40, 4.5],
      ['AFXX Laptop Backpack', 'Bags', 1199, '🎒', 'Water-resistant tech backpack.', 'A premium laptop backpack with multiple compartments, water-resistant material and comfortable shoulder padding.', 15, 4.7],
      ['AFXX Mini Keyboard', 'Accessories', 1499, '⌨️', 'Compact mechanical-style keyboard.', 'A compact keyboard with soft tactile keys, LED backlight and productivity-focused layout for developers.', 22, 4.4],
      ['AFXX Power Bank 20000mAh', 'Power', 1999, '🔋', 'Fast charging power bank.', 'High-capacity 20000mAh power bank with dual output, Type-C support and safety protection.', 30, 4.6],
      ['AFXX Premium Hoodie', 'Fashion', 999, '🧥', 'Soft cotton hoodie for creators.', 'Comfortable premium hoodie with minimal AFXX style for college, coding sessions and travel.', 20, 4.3],
      ['AFXX Desk Lamp', 'Workspace', 799, '💡', 'Eye-care study desk lamp.', 'Adjustable LED desk lamp with eye-care light, brightness modes and clean modern design.', 19, 4.5]
    ];

    products.forEach((p) => insert.run(...p));
  }
}

initDatabase();

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: 'Please login first' });
  }
  next();
}

function publicUser(user) {
  return user ? { id: user.id, name: user.name, email: user.email } : null;
}

app.get('/api/me', (req, res) => {
  res.json({ success: true, user: publicUser(req.session.user) });
});

app.post('/api/register', (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const info = db.prepare('INSERT INTO users (name, email, password) VALUES (?, ?, ?)').run(name.trim(), email.toLowerCase().trim(), hashedPassword);
    const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(info.lastInsertRowid);
    req.session.user = user;
    res.json({ success: true, message: 'Registration successful', user: publicUser(user) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Registration failed' });
  }
});

app.post('/api/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    req.session.user = { id: user.id, name: user.name, email: user.email };
    res.json({ success: true, message: 'Login successful', user: publicUser(req.session.user) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

app.get('/api/products', (req, res) => {
  const search = (req.query.search || '').trim();
  const category = (req.query.category || '').trim();

  let query = 'SELECT * FROM products WHERE 1=1';
  const params = [];

  if (search) {
    query += ' AND (name LIKE ? OR category LIKE ? OR short_desc LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (category && category !== 'All') {
    query += ' AND category = ?';
    params.push(category);
  }

  query += ' ORDER BY id DESC';
  const products = db.prepare(query).all(...params);
  res.json({ success: true, products });
});

app.get('/api/products/:id', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }
  res.json({ success: true, product });
});

app.get('/api/categories', (req, res) => {
  const rows = db.prepare('SELECT DISTINCT category FROM products ORDER BY category').all();
  res.json({ success: true, categories: ['All', ...rows.map((row) => row.category)] });
});

app.get('/api/cart', requireAuth, (req, res) => {
  const items = db.prepare(`
    SELECT cart_items.id, cart_items.quantity, products.id AS product_id, products.name, products.price,
           products.image, products.short_desc, products.stock
    FROM cart_items
    JOIN products ON products.id = cart_items.product_id
    WHERE cart_items.user_id = ?
    ORDER BY cart_items.id DESC
  `).all(req.session.user.id);

  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  res.json({ success: true, items, total, count: items.reduce((sum, item) => sum + item.quantity, 0) });
});

app.post('/api/cart', requireAuth, (req, res) => {
  const { product_id, quantity } = req.body;
  const qty = Math.max(1, parseInt(quantity || 1, 10));
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(product_id);

  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }

  const existing = db.prepare('SELECT * FROM cart_items WHERE user_id = ? AND product_id = ?').get(req.session.user.id, product_id);

  if (existing) {
    const newQty = Math.min(existing.quantity + qty, product.stock);
    db.prepare('UPDATE cart_items SET quantity = ? WHERE id = ?').run(newQty, existing.id);
  } else {
    db.prepare('INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)').run(req.session.user.id, product_id, Math.min(qty, product.stock));
  }

  res.json({ success: true, message: 'Added to cart' });
});

app.put('/api/cart/:id', requireAuth, (req, res) => {
  const quantity = Math.max(1, parseInt(req.body.quantity || 1, 10));
  const item = db.prepare(`
    SELECT cart_items.*, products.stock
    FROM cart_items
    JOIN products ON products.id = cart_items.product_id
    WHERE cart_items.id = ? AND cart_items.user_id = ?
  `).get(req.params.id, req.session.user.id);

  if (!item) {
    return res.status(404).json({ success: false, message: 'Cart item not found' });
  }

  db.prepare('UPDATE cart_items SET quantity = ? WHERE id = ?').run(Math.min(quantity, item.stock), req.params.id);
  res.json({ success: true, message: 'Cart updated' });
});

app.delete('/api/cart/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM cart_items WHERE id = ? AND user_id = ?').run(req.params.id, req.session.user.id);
  res.json({ success: true, message: 'Item removed' });
});

app.post('/api/orders', requireAuth, (req, res) => {
  const { customer_name, phone, address, payment_method } = req.body;
  if (!customer_name || !phone || !address || !payment_method) {
    return res.status(400).json({ success: false, message: 'Checkout details are required' });
  }

  const items = db.prepare(`
    SELECT cart_items.quantity, products.id AS product_id, products.name, products.price, products.stock
    FROM cart_items
    JOIN products ON products.id = cart_items.product_id
    WHERE cart_items.user_id = ?
  `).all(req.session.user.id);

  if (items.length === 0) {
    return res.status(400).json({ success: false, message: 'Your cart is empty' });
  }

  for (const item of items) {
    if (item.quantity > item.stock) {
      return res.status(400).json({ success: false, message: `${item.name} has only ${item.stock} stock left` });
    }
  }

  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const createOrder = db.transaction(() => {
    const orderInfo = db.prepare(`
      INSERT INTO orders (user_id, customer_name, phone, address, payment_method, total)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.session.user.id, customer_name, phone, address, payment_method, total);

    const orderId = orderInfo.lastInsertRowid;
    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id, product_id, product_name, price, quantity)
      VALUES (?, ?, ?, ?, ?)
    `);
    const updateStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');

    items.forEach((item) => {
      insertItem.run(orderId, item.product_id, item.name, item.price, item.quantity);
      updateStock.run(item.quantity, item.product_id);
    });

    db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(req.session.user.id);
    return orderId;
  });

  const orderId = createOrder();
  res.json({ success: true, message: 'Order placed successfully', order_id: orderId, total });
});

app.get('/api/orders', requireAuth, (req, res) => {
  const orders = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC').all(req.session.user.id);
  const itemStmt = db.prepare('SELECT * FROM order_items WHERE order_id = ?');

  const fullOrders = orders.map((order) => ({
    ...order,
    items: itemStmt.all(order.id)
  }));

  res.json({ success: true, orders: fullOrders });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`E Web running at http://localhost:${PORT}`);
});
