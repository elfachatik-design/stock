const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

if (!fs.existsSync('./uploads')) {
  fs.mkdirSync('./uploads');
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, './uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const initDb = async () => {
  try {
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    await pool.query(schema);
  } catch (err) {
    console.error('Error initializing schema:', err);
  }
};
initDb();

app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products', upload.single('image'), async (req, res) => {
  try {
    const { name, barcode, units_per_box, stock_units, cost_price_unit, selling_price_unit, selling_price_box } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
    const query = `
      INSERT INTO products (name, barcode, image_url, units_per_box, stock_units, cost_price_unit, selling_price_unit, selling_price_box)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
    `;
    const values = [name, barcode, imageUrl, units_per_box || 1, stock_units || 0, cost_price_unit || 0, selling_price_unit || 0, selling_price_box || 0];
    const result = await pool.query(query, values);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/clients', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clients ORDER BY total_debt DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/clients', async (req, res) => {
  try {
    const { business_name, phone, telegram_id, city } = req.body;
    const result = await pool.query(
      'INSERT INTO clients (business_name, phone, telegram_id, city) VALUES ($1, $2, $3, $4) RETURNING *',
      [business_name, phone, telegram_id, city]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/clients/:id/pay', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const { amount, payment_method, notes } = req.body;

    await client.query(
      'INSERT INTO client_payments (client_id, amount, payment_method, notes) VALUES ($1, $2, $3, $4)',
      [id, amount, payment_method || 'CASH', notes]
    );

    const updateRes = await client.query(
      'UPDATE clients SET total_debt = GREATEST(0, total_debt - $1) WHERE id = $2 RETURNING *',
      [amount, id]
    );

    await client.query('COMMIT');
    res.json(updateRes.rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

app.post('/api/orders', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { client_id, items, discount = 0, paid_amount = 0 } = req.body;

    let subtotal = 0;
    for (const item of items) {
      subtotal += Number(item.total_price);
    }
    const finalAmount = Math.max(0, subtotal - Number(discount));
    const remainingBalance = Math.max(0, finalAmount - Number(paid_amount));

    const orderRes = await client.query(
      'INSERT INTO orders (client_id, total_amount, discount, paid_amount, remaining_balance) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [client_id, finalAmount, discount, paid_amount, remainingBalance]
    );
    const orderId = orderRes.rows[0].id;

    for (const item of items) {
      const unitsToDeduct = item.sale_type === 'box' ? item.quantity * item.units_per_box : item.quantity;
      await client.query(
        'INSERT INTO order_items (order_id, product_id, sale_type, quantity, unit_price, total_price) VALUES ($1, $2, $3, $4, $5, $6)',
        [orderId, item.product_id, item.sale_type, item.quantity, item.unit_price, item.total_price]
      );
      await client.query(
        'UPDATE products SET stock_units = stock_units - $1 WHERE id = $2',
        [unitsToDeduct, item.product_id]
      );
    }

    if (client_id && remainingBalance > 0) {
      await client.query(
        'UPDATE clients SET total_debt = total_debt + $1 WHERE id = $2',
        [remainingBalance, client_id]
      );
    }

    await client.query('COMMIT');
    res.json({ success: true, orderId, remainingBalance });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
