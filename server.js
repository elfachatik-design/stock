const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// مجلد رفع الملفات (الصور والفيديوهات)
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'))
});
const upload = multer({ storage });

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// قاعدة البيانات SQLite
const db = new sqlite3.Database(path.join(__dirname, 'stock.db'));

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT,
    name TEXT
  )`);

  db.get(`SELECT * FROM users WHERE username = 'admin'`, (err, row) => {
    if (!row) {
      db.run(`INSERT INTO users (username, password, role, name) VALUES ('admin', 'admin123', 'admin', 'المدير العام')`);
      db.run(`INSERT INTO users (username, password, role, name) VALUES ('employe', '123456', 'employe', 'الموظف')`);
    }
  });

  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE
  )`);
  db.run(`INSERT OR IGNORE INTO categories (name) VALUES ('Caméras & Sécurité'), ('Énergie Solaire'), ('Automobile & Éclairage'), ('Électronique & IoT')`);

  db.run(`CREATE TABLE IF NOT EXISTS catalog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    category TEXT,
    barcode TEXT,
    description TEXT,
    image_url TEXT,
    video_url TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS suppliers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, country TEXT, phone TEXT, city TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, category TEXT, barcode TEXT, description TEXT, purchase_price_unit REAL, stock_units INTEGER DEFAULT 0, status TEXT, supplier_id INTEGER)`);
  db.run(`CREATE TABLE IF NOT EXISTS clients (id INTEGER PRIMARY KEY AUTOINCREMENT, business_name TEXT, client_type TEXT, phone TEXT, city TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER, total_amount REAL, paid_amount REAL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS order_items (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER, product_id INTEGER, quantity INTEGER, unit_price REAL, total_price REAL)`);
  db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
});

// APIs الفئات (إضافة، جلب، تعديل، حذف)
app.get('/api/categories', (req, res) => {
  db.all(`SELECT * FROM categories ORDER BY name ASC`, [], (err, rows) => res.json(rows || []));
});

app.post('/api/categories', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Nom requis' });
  db.run(`INSERT OR IGNORE INTO categories (name) VALUES (?)`, [name.trim()], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, id: this.lastID, name: name.trim() });
  });
});

app.put('/api/categories/:id', (req, res) => {
  const { name } = req.body;
  db.run(`UPDATE categories SET name = ? WHERE id = ?`, [name.trim(), req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.delete('/api/categories/:id', (req, res) => {
  db.run(`DELETE FROM categories WHERE id = ?`, [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// APIs الكتالوج (إضافة، تعديل، حذف)
app.get('/api/catalog', (req, res) => {
  db.all(`SELECT * FROM catalog ORDER BY id DESC`, [], (err, rows) => res.json(rows || []));
});

app.post('/api/catalog', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'video', maxCount: 1 }]), (req, res) => {
  const { name, category, barcode, description } = req.body;
  const image_url = req.files && req.files['image'] ? '/uploads/' + req.files['image'][0].filename : '';
  const video_url = req.files && req.files['video'] ? '/uploads/' + req.files['video'][0].filename : '';

  db.run(
    `INSERT INTO catalog (name, category, barcode, description, image_url, video_url) VALUES (?, ?, ?, ?, ?, ?)`,
    [name, category, barcode, description, image_url, video_url],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, id: this.lastID });
    }
  );
});

app.put('/api/catalog/:id', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'video', maxCount: 1 }]), (req, res) => {
  const { name, category, barcode, description } = req.body;
  const id = req.params.id;

  db.get(`SELECT image_url, video_url FROM catalog WHERE id = ?`, [id], (err, row) => {
    let image_url = row ? row.image_url : '';
    let video_url = row ? row.video_url : '';

    if (req.files && req.files['image']) image_url = '/uploads/' + req.files['image'][0].filename;
    if (req.files && req.files['video']) video_url = '/uploads/' + req.files['video'][0].filename;

    db.run(
      `UPDATE catalog SET name = ?, category = ?, barcode = ?, description = ?, image_url = ?, video_url = ? WHERE id = ?`,
      [name, category, barcode, description, image_url, video_url, id],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
      }
    );
  });
});

app.delete('/api/catalog/:id', (req, res) => {
  db.run(`DELETE FROM catalog WHERE id = ?`, [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// الدخول وباقي المسارات
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  db.get(`SELECT * FROM users WHERE username = ? AND password = ?`, [username, password], (err, user) => {
    if (user) res.json({ success: true, user: { id: user.id, username: user.username, role: user.role, name: user.name } });
    else res.status(401).json({ success: false, error: 'Identifiants incorrects' });
  });
});

app.get('/api/suppliers', (req, res) => db.all(`SELECT * FROM suppliers`, [], (e, r) => res.json(r || [])));
app.post('/api/suppliers', (req, res) => {
  const { name, country, phone, city } = req.body;
  db.run(`INSERT INTO suppliers (name, country, phone, city) VALUES (?, ?, ?, ?)`, [name, country, phone, city], () => res.json({ success: true }));
});

app.get('/api/products', (req, res) => db.all(`SELECT * FROM products`, [], (e, r) => res.json(r || [])));
app.put('/api/products/:id', (req, res) => {
  db.run(`UPDATE products SET status = ? WHERE id = ?`, [req.body.status, req.params.id], () => res.json({ success: true }));
});
app.post('/api/purchases', (req, res) => {
  const { items, status, supplier_id } = req.body;
  const stmt = db.prepare(`INSERT INTO products (name, barcode, purchase_price_unit, stock_units, status, supplier_id) VALUES (?, ?, ?, ?, ?, ?)`);
  items.forEach(it => stmt.run(it.name, it.barcode, it.price, it.quantity, status, supplier_id));
  stmt.finalize(() => res.json({ success: true }));
});

app.post('/api/orders', (req, res) => {
  const { client_id, items, paid_amount } = req.body;
  let total = 0;
  items.forEach(i => total += i.total_price);

  db.run(`INSERT INTO orders (client_id, total_amount, paid_amount) VALUES (?, ?, ?)`, [client_id, total, paid_amount], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    const orderId = this.lastID;
    const stmtOrder = db.prepare(`INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price) VALUES (?, ?, ?, ?, ?)`);
    const stmtStock = db.prepare(`UPDATE products SET stock_units = stock_units - ? WHERE id = ?`);

    items.forEach(it => {
      stmtOrder.run(orderId, it.product_id, it.quantity, it.unit_price, it.total_price);
      stmtStock.run(it.quantity, it.product_id);
    });
    stmtOrder.finalize();
    stmtStock.finalize();
    res.json({ success: true, order_id: orderId });
  });
});

app.get('/api/clients', (req, res) => db.all(`SELECT * FROM clients`, [], (e, r) => res.json(r || [])));
app.post('/api/clients', (req, res) => {
  const { business_name, client_type, phone, city } = req.body;
  db.run(`INSERT INTO clients (business_name, client_type, phone, city) VALUES (?, ?, ?, ?)`, [business_name, client_type, phone, city], () => res.json({ success: true }));
});
app.post('/api/clients/import-batch', (req, res) => {
  const { contacts } = req.body;
  if (!contacts || !contacts.length) return res.json({ count: 0 });
  const stmt = db.prepare(`INSERT INTO clients (business_name, client_type, phone, city) VALUES (?, ?, ?, ?)`);
  contacts.forEach(c => stmt.run(c.name, c.client_type, c.phone, c.city || 'Maroc'));
  stmt.finalize(() => res.json({ count: contacts.length }));
});

app.get('/api/settings', (req, res) => {
  db.all(`SELECT * FROM settings`, [], (e, rows) => {
    const s = {}; (rows || []).forEach(r => s[r.key] = r.value); res.json(s);
  });
});
app.post('/api/settings', (req, res) => {
  const stmt = db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`);
  Object.keys(req.body).forEach(k => stmt.run(k, req.body[k]));
  stmt.finalize(() => res.json({ success: true }));
});

app.get('/api/users', (req, res) => db.all(`SELECT id, username, role, name FROM users`, [], (e, r) => res.json(r || [])));
app.post('/api/users', (req, res) => {
  const { username, password, role, name } = req.body;
  db.run(`INSERT INTO users (username, password, role, name) VALUES (?, ?, ?, ?)`, [username, password, role, name], (err) => {
    if (err) res.status(400).json({ error: 'Nom déjà utilisé' }); else res.json({ success: true });
  });
});
app.delete('/api/users/:id', (req, res) => {
  db.run(`DELETE FROM users WHERE id = ?`, [req.params.id], () => res.json({ success: true }));
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));