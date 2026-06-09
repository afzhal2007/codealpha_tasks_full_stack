const state = {
  user: null,
  products: [],
  categories: [],
  selectedProductId: null
};

const pages = {
  home: document.getElementById('homePage'),
  products: document.getElementById('productsPage'),
  details: document.getElementById('productDetailsPage'),
  cart: document.getElementById('cartPage'),
  orders: document.getElementById('ordersPage')
};

const productsGrid = document.getElementById('productsGrid');
const productDetails = document.getElementById('productDetails');
const searchInput = document.getElementById('searchInput');
const categorySelect = document.getElementById('categorySelect');
const cartBadge = document.getElementById('cartBadge');
const cartItems = document.getElementById('cartItems');
const cartSubtotal = document.getElementById('cartSubtotal');
const cartTotal = document.getElementById('cartTotal');
const ordersList = document.getElementById('ordersList');
const authModal = document.getElementById('authModal');
const checkoutModal = document.getElementById('checkoutModal');
const userPill = document.getElementById('userPill');
const loginOpenBtn = document.getElementById('loginOpenBtn');
const logoutBtn = document.getElementById('logoutBtn');
const navLinks = document.querySelector('.nav-links');
const menuBtn = document.getElementById('menuBtn');
const toast = document.getElementById('toast');

function money(value) {
  return `₹${Number(value).toLocaleString('en-IN')}`;
}

function showToast(message, type = 'info') {
  toast.textContent = message;
  toast.style.borderColor = type === 'error' ? 'rgba(255,77,109,0.6)' : 'rgba(0,231,255,0.35)';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2600);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Something went wrong');
  }
  return data;
}

function showPage(pageName) {
  Object.values(pages).forEach((page) => page.classList.remove('active-page'));
  pages[pageName].classList.add('active-page');

  document.querySelectorAll('.nav-links a').forEach((link) => {
    link.classList.toggle('active', link.dataset.page === pageName);
  });

  navLinks.classList.remove('open');

  if (pageName === 'products') loadProducts();
  if (pageName === 'cart') loadCart();
  if (pageName === 'orders') loadOrders();
}

function requireLogin() {
  if (!state.user) {
    openAuth('login');
    showToast('Please login first', 'error');
    return false;
  }
  return true;
}

function updateAuthUI() {
  if (state.user) {
    userPill.textContent = `Hi, ${state.user.name}`;
    userPill.classList.remove('hidden');
    loginOpenBtn.classList.add('hidden');
    logoutBtn.classList.remove('hidden');
  } else {
    userPill.classList.add('hidden');
    loginOpenBtn.classList.remove('hidden');
    logoutBtn.classList.add('hidden');
    cartBadge.textContent = '0';
  }
}

async function loadMe() {
  const data = await api('/api/me');
  state.user = data.user;
  updateAuthUI();
  if (state.user) loadCartBadge();
}

async function loadCartBadge() {
  if (!state.user) return;
  try {
    const data = await api('/api/cart');
    cartBadge.textContent = data.count;
  } catch {
    cartBadge.textContent = '0';
  }
}

async function loadCategories() {
  const data = await api('/api/categories');
  state.categories = data.categories;
  categorySelect.innerHTML = data.categories.map((cat) => `<option value="${cat}">${cat}</option>`).join('');
}

async function loadProducts() {
  const params = new URLSearchParams();
  if (searchInput.value.trim()) params.set('search', searchInput.value.trim());
  if (categorySelect.value) params.set('category', categorySelect.value);

  productsGrid.innerHTML = '<div class="empty-card"><h3>Loading products...</h3><p>Please wait.</p></div>';
  const data = await api(`/api/products?${params.toString()}`);
  state.products = data.products;
  renderProducts();
}

function renderProducts() {
  if (state.products.length === 0) {
    productsGrid.innerHTML = '<div class="empty-card"><h3>No products found</h3><p>Try another search or category.</p></div>';
    return;
  }

  productsGrid.innerHTML = state.products.map((product) => `
    <article class="product-card">
      <div class="product-img">${product.image}</div>
      <div class="product-meta">
        <span class="chip">${product.category}</span>
        <span class="rating">★ ${product.rating}</span>
      </div>
      <h3>${product.name}</h3>
      <p>${product.short_desc}</p>
      <div class="card-bottom">
        <span class="price">${money(product.price)}</span>
        <div>
          <button class="btn ghost" onclick="openProduct(${product.id})">View</button>
          <button class="icon-btn" onclick="addToCart(${product.id})">+</button>
        </div>
      </div>
    </article>
  `).join('');
}

async function openProduct(id) {
  state.selectedProductId = id;
  showPage('details');
  productDetails.innerHTML = '<div class="empty-card"><h3>Loading details...</h3></div>';
  const data = await api(`/api/products/${id}`);
  const product = data.product;

  productDetails.innerHTML = `
    <div class="details-image">${product.image}</div>
    <div class="details-content">
      <span class="chip">${product.category}</span>
      <h2>${product.name}</h2>
      <p>${product.description}</p>
      <div class="details-info">
        <span class="chip">★ ${product.rating} Rating</span>
        <span class="chip">${product.stock} Stock Left</span>
        <span class="chip">Free Delivery</span>
      </div>
      <div class="summary-total">
        <span>Price</span>
        <strong>${money(product.price)}</strong>
      </div>
      <button class="btn primary full" onclick="addToCart(${product.id})">Add to Cart</button>
    </div>
  `;
}

async function addToCart(productId) {
  if (!requireLogin()) return;
  try {
    const data = await api('/api/cart', {
      method: 'POST',
      body: JSON.stringify({ product_id: productId, quantity: 1 })
    });
    showToast(data.message);
    loadCartBadge();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function loadCart() {
  if (!requireLogin()) return showPage('home');
  const data = await api('/api/cart');
  renderCart(data.items, data.total);
  cartBadge.textContent = data.count;
}

function renderCart(items, total) {
  cartSubtotal.textContent = money(total);
  cartTotal.textContent = money(total);

  if (items.length === 0) {
    cartItems.innerHTML = '<div class="empty-card"><h3>Your cart is empty</h3><p>Add products and come back to checkout.</p></div>';
    return;
  }

  cartItems.innerHTML = items.map((item) => `
    <article class="cart-item">
      <div class="cart-icon">${item.image}</div>
      <div>
        <h3>${item.name}</h3>
        <p>${item.short_desc}</p>
        <strong>${money(item.price)} × ${item.quantity} = ${money(item.price * item.quantity)}</strong>
      </div>
      <div class="cart-actions">
        <div class="qty-box">
          <button onclick="updateCartItem(${item.id}, ${item.quantity - 1})">−</button>
          <strong>${item.quantity}</strong>
          <button onclick="updateCartItem(${item.id}, ${item.quantity + 1})">+</button>
        </div>
        <button class="remove-btn" onclick="removeCartItem(${item.id})">Remove</button>
      </div>
    </article>
  `).join('');
}

async function updateCartItem(id, quantity) {
  if (quantity < 1) return removeCartItem(id);
  try {
    await api(`/api/cart/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ quantity })
    });
    loadCart();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function removeCartItem(id) {
  try {
    await api(`/api/cart/${id}`, { method: 'DELETE' });
    showToast('Item removed');
    loadCart();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function loadOrders() {
  if (!requireLogin()) return showPage('home');
  const data = await api('/api/orders');

  if (data.orders.length === 0) {
    ordersList.innerHTML = '<div class="empty-card"><h3>No orders yet</h3><p>Place your first E Web order.</p></div>';
    return;
  }

  ordersList.innerHTML = data.orders.map((order) => `
    <article class="order-card">
      <div class="order-head">
        <div>
          <h3>Order #${order.id}</h3>
          <p>${new Date(order.created_at).toLocaleString()}</p>
        </div>
        <span class="order-status">${order.status}</span>
      </div>
      <p><strong>Name:</strong> ${order.customer_name}</p>
      <p><strong>Phone:</strong> ${order.phone}</p>
      <p><strong>Address:</strong> ${order.address}</p>
      <p><strong>Payment:</strong> ${order.payment_method}</p>
      <div class="order-products">
        ${order.items.map((item) => `
          <div class="order-line">
            <span>${item.product_name} × ${item.quantity}</span>
            <strong>${money(item.price * item.quantity)}</strong>
          </div>
        `).join('')}
      </div>
      <div class="summary-total"><span>Total</span><strong>${money(order.total)}</strong></div>
    </article>
  `).join('');
}

function openAuth(type = 'login') {
  authModal.classList.remove('hidden');
  switchAuth(type);
}

function closeAuth() {
  authModal.classList.add('hidden');
}

function switchAuth(type) {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const loginTab = document.getElementById('loginTab');
  const registerTab = document.getElementById('registerTab');

  const isLogin = type === 'login';
  loginForm.classList.toggle('hidden', !isLogin);
  registerForm.classList.toggle('hidden', isLogin);
  loginTab.classList.toggle('active', isLogin);
  registerTab.classList.toggle('active', !isLogin);
}

function openCheckout() {
  if (!requireLogin()) return;
  checkoutModal.classList.remove('hidden');
  if (state.user) document.getElementById('customerName').value = state.user.name;
}

function closeCheckout() {
  checkoutModal.classList.add('hidden');
}

document.querySelectorAll('[data-page]').forEach((element) => {
  element.addEventListener('click', (event) => {
    event.preventDefault();
    const page = element.dataset.page;
    if (page === 'cart' && !state.user) return requireLogin();
    if (page === 'orders' && !state.user) return requireLogin();
    showPage(page);
  });
});

menuBtn.addEventListener('click', () => navLinks.classList.toggle('open'));
loginOpenBtn.addEventListener('click', () => openAuth('login'));
document.getElementById('heroLoginBtn').addEventListener('click', () => openAuth('register'));
document.getElementById('authCloseBtn').addEventListener('click', closeAuth);
document.getElementById('loginTab').addEventListener('click', () => switchAuth('login'));
document.getElementById('registerTab').addEventListener('click', () => switchAuth('register'));
document.getElementById('checkoutBtn').addEventListener('click', openCheckout);
document.getElementById('checkoutCloseBtn').addEventListener('click', closeCheckout);

searchInput.addEventListener('input', () => loadProducts());
categorySelect.addEventListener('change', () => loadProducts());

logoutBtn.addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  state.user = null;
  updateAuthUI();
  showToast('Logged out successfully');
  showPage('home');
});

document.getElementById('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const data = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({
        email: document.getElementById('loginEmail').value,
        password: document.getElementById('loginPassword').value
      })
    });
    state.user = data.user;
    updateAuthUI();
    closeAuth();
    showToast(data.message);
    loadCartBadge();
  } catch (error) {
    showToast(error.message, 'error');
  }
});

document.getElementById('registerForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const data = await api('/api/register', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('registerName').value,
        email: document.getElementById('registerEmail').value,
        password: document.getElementById('registerPassword').value
      })
    });
    state.user = data.user;
    updateAuthUI();
    closeAuth();
    showToast(data.message);
    loadCartBadge();
  } catch (error) {
    showToast(error.message, 'error');
  }
});

document.getElementById('checkoutForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const data = await api('/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        customer_name: document.getElementById('customerName').value,
        phone: document.getElementById('customerPhone').value,
        address: document.getElementById('customerAddress').value,
        payment_method: document.getElementById('paymentMethod').value
      })
    });
    closeCheckout();
    showToast(`Order #${data.order_id} placed successfully`);
    event.target.reset();
    loadCartBadge();
    showPage('orders');
  } catch (error) {
    showToast(error.message, 'error');
  }
});

authModal.addEventListener('click', (event) => {
  if (event.target === authModal) closeAuth();
});

checkoutModal.addEventListener('click', (event) => {
  if (event.target === checkoutModal) closeCheckout();
});

window.openProduct = openProduct;
window.addToCart = addToCart;
window.updateCartItem = updateCartItem;
window.removeCartItem = removeCartItem;

async function init() {
  try {
    await loadMe();
    await loadCategories();
    await loadProducts();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

init();
