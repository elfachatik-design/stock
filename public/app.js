let products = [];
let clients = [];
let cart = [];

document.addEventListener('DOMContentLoaded', () => {
  loadProducts();
  loadClients();

  document.getElementById('productForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('name', document.getElementById('p_name').value);
    formData.append('barcode', document.getElementById('p_barcode').value);
    formData.append('units_per_box', document.getElementById('p_units_box').value);
    formData.append('stock_units', document.getElementById('p_stock').value);
    formData.append('cost_price_unit', document.getElementById('p_cost').value);
    formData.append('selling_price_unit', document.getElementById('p_price_unit').value);
    formData.append('selling_price_box', document.getElementById('p_price_box').value);
    const img = document.getElementById('p_image').files[0];
    if (img) formData.append('image', img);

    await fetch('/api/products', { method: 'POST', body: formData });
    document.getElementById('productForm').reset();
    loadProducts();
  });

  document.getElementById('clientForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      business_name: document.getElementById('c_name').value,
      phone: document.getElementById('c_phone').value,
      city: document.getElementById('c_city').value
    };
    await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    document.getElementById('clientForm').reset();
    loadClients();
  });
});

async function loadProducts() {
  const res = await fetch('/api/products');
  products = await res.json();
  const tbody = document.querySelector('#productsTable tbody');
  const broadcastSelect = document.getElementById('broadcastProduct');
  tbody.innerHTML = '';
  broadcastSelect.innerHTML = '<option value="">-- اختر منتجاً --</option>';

  products.forEach(p => {
    const boxes = (p.stock_units / p.units_per_box).toFixed(1);
    tbody.innerHTML += `
      <tr>
        <td>${p.image_url ? `<img src="${p.image_url}" width="40">` : '-'}</td>
        <td><strong>${p.name}</strong></td>
        <td><code>${p.barcode || '-'}</code></td>
        <td>${p.stock_units} حبة</td>
        <td>${boxes} كرتونة</td>
        <td>${p.selling_price_unit} د.م</td>
        <td>${p.selling_price_box} د.م</td>
      </tr>
    `;
    broadcastSelect.innerHTML += `<option value="${p.id}">${p.name} (متوفر: ${p.stock_units} حبة)</option>`;
  });
}

async function loadClients() {
  const res = await fetch('/api/clients');
  clients = await res.json();
  const tbody = document.querySelector('#clientsTable tbody');
  const posSelect = document.getElementById('posClientSelect');
  tbody.innerHTML = '';
  posSelect.innerHTML = '<option value="">-- زبون بدون تسجيل اسم (كاش مباشر) --</option>';

  clients.forEach(c => {
    const debtClass = Number(c.total_debt) > 0 ? 'text-danger font-bold' : '';
    tbody.innerHTML += `
      <tr>
        <td>${c.business_name}</td>
        <td>${c.city || '-'}</td>
        <td>${c.phone}</td>
        <td class="${debtClass}">${Number(c.total_debt).toFixed(2)} درهم</td>
        <td><button class="btn sm success" onclick="settleDebt(${c.id})">سداد دفعة</button></td>
        <td>
          <button class="btn sm secondary" onclick="sendWhatsappDebtReminder('${c.phone}', '${c.business_name}', ${c.total_debt})">
            واتساب 💬
          </button>
        </td>
      </tr>
    `;
    posSelect.innerHTML += `<option value="${c.id}">${c.business_name} (كريديت سابق: ${Number(c.total_debt).toFixed(2)} د.م)</option>`;
  });
}

function openProductSelector() {
  if (products.length === 0) return alert('أضف منتجات إلى المخزن أولاً');
  const p = products[0];
  cart.push({
    product_id: p.id,
    name: p.name,
    sale_type: 'box',
    units_per_box: p.units_per_box,
    quantity: 1,
    unit_price: Number(p.selling_price_box),
    total_price: Number(p.selling_price_box)
  });
  renderCart();
}

function renderCart() {
  const tbody = document.querySelector('#cartTable tbody');
  tbody.innerHTML = '';
  cart.forEach((item, index) => {
    tbody.innerHTML += `
      <tr>
        <td>
          <select onchange="updateCartProduct(${index}, this.value)">
            ${products.map(p => `<option value="${p.id}" ${p.id === item.product_id ? 'selected' : ''}>${p.name}</option>`).join('')}
          </select>
        </td>
        <td>
          <select onchange="updateCartType(${index}, this.value)">
            <option value="box" ${item.sale_type === 'box' ? 'selected' : ''}>بالكرتونة</option>
            <option value="unit" ${item.sale_type === 'unit' ? 'selected' : ''}>بالحبة</option>
          </select>
        </td>
        <td><input type="number" min="1" value="${item.quantity}" oninput="updateCartQty(${index}, this.value)"></td>
        <td><input type="number" step="0.5" value="${item.unit_price}" oninput="updateCartPrice(${index}, this.value)"></td>
        <td><strong>${item.total_price.toFixed(2)}</strong> د.م</td>
        <td><button class="btn sm danger" onclick="removeCart(${index})">X</button></td>
      </tr>
    `;
  });
  calculatePOS();
}

function updateCartProduct(i, pid) {
  const p = products.find(prod => prod.id == pid);
  cart[i].product_id = p.id;
  cart[i].name = p.name;
  cart[i].units_per_box = p.units_per_box;
  cart[i].unit_price = cart[i].sale_type === 'box' ? Number(p.selling_price_box) : Number(p.selling_price_unit);
  cart[i].total_price = cart[i].unit_price * cart[i].quantity;
  renderCart();
}

function updateCartType(i, type) {
  const p = products.find(prod => prod.id == cart[i].product_id);
  cart[i].sale_type = type;
  cart[i].unit_price = type === 'box' ? Number(p.selling_price_box) : Number(p.selling_price_unit);
  cart[i].total_price = cart[i].unit_price * cart[i].quantity;
  renderCart();
}

function updateCartQty(i, qty) {
  cart[i].quantity = Number(qty);
  cart[i].total_price = cart[i].unit_price * cart[i].quantity;
  renderCart();
}

function updateCartPrice(i, price) {
  cart[i].unit_price = Number(price);
  cart[i].total_price = cart[i].unit_price * cart[i].quantity;
  renderCart();
}

function removeCart(i) {
  cart.splice(i, 1);
  renderCart();
}

function calculatePOS() {
  const subtotal = cart.reduce((acc, curr) => acc + curr.total_price, 0);
  const discount = Number(document.getElementById('posDiscount').value) || 0;
  const paid = Number(document.getElementById('posPaid').value) || 0;
  const finalAmount = Math.max(0, subtotal - discount);
  const credit = Math.max(0, finalAmount - paid);

  document.getElementById('posSubtotal').innerText = subtotal.toFixed(2);
  document.getElementById('posFinal').innerText = finalAmount.toFixed(2);
  document.getElementById('posCredit').innerText = credit.toFixed(2) + ' درهم';
}

async function submitOrder() {
  if (cart.length === 0) return alert('السلة فارغة!');
  const clientId = document.getElementById('posClientSelect').value;
  const discount = Number(document.getElementById('posDiscount').value) || 0;
  const paid = Number(document.getElementById('posPaid').value) || 0;

  const payload = {
    client_id: clientId ? Number(clientId) : null,
    items: cart,
    discount: discount,
    paid_amount: paid
  };

  const res = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (res.ok) {
    alert('تم تسجيل العملية وتحديث المخزون بنجاح!');
    cart = [];
    renderCart();
    loadProducts();
    loadClients();
  }
}

async function settleDebt(clientId) {
  const amount = prompt('أدخل المبلغ المراد تسديده (درهم):');
  if (!amount || isNaN(amount)) return;
  await fetch(`/api/clients/${clientId}/pay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: Number(amount), payment_method: 'CASH' })
  });
  loadClients();
}

function sendWhatsappDebtReminder(phone, name, debt) {
  const text = encodeURIComponent(`السلام عليكم سي ${name}، نود تذكيركم بأن الرصيد المتبقي بذمتكم (الكريديت) هو ${debt} درهم. شكراً لتعاملكم.`);
  window.open(`https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${text}`, '_blank');
}

function generateOfferText() {
  const pid = document.getElementById('broadcastProduct').value;
  const promoPrice = document.getElementById('promoPriceBox').value;
  const p = products.find(item => item.id == pid);
  if (!p) return;

  const priceStr = promoPrice ? `${promoPrice} د.م للكرتونة عوض ${p.selling_price_box} د.م` : `${p.selling_price_box} د.م للكرتونة`;
  document.getElementById('offerMessage').value = 
`🔥 عرض خاص لتجار الجملة 🔥
منتج: ${p.name}
📦 الكرتونة تحتوي على: ${p.units_per_box} حبة
💰 السعر الخاص: ${priceStr}
⚡ الكمية محدودة متوفرة الآن في المستودع.
للطلب السريع تواصلوا معنا مباشرة.`;
}

function sendWhatsappToAll() {
  const msg = encodeURIComponent(document.getElementById('offerMessage').value);
  if (clients.length === 0) return alert('لا يوجد تجار مسجلين');
  window.open(`https://wa.me/?text=${msg}`, '_blank');
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(`tab-${tabId}`).classList.add('active');
  event.target.classList.add('active');
}
