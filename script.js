// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAG3xjX_n_Bx0p8WOGYMqZz9wiL9yWSZSc",
    authDomain: "sbjr-agriculture-shop.firebaseapp.com",
    projectId: "sbjr-agriculture-shop",
    storageBucket: "sbjr-agriculture-shop.appspot.com",
    messagingSenderId: "364119868491",
    appId: "1:364119868491:web:bf66589b710e4f5d7f79ce",
    measurementId: "G-RSJHB63PX9"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Firebase services
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Constants
const COLLECTION_NAMES = {
    USERS: 'users',
    PRODUCTS: 'products',
    COUPONS: 'coupons',
    CARTS: 'carts',
    ORDERS: 'orders'
};

const ITEMS_PER_PAGE = 10;

// Global state
let currentUser = null;
let cart = [];
let wishlist = [];
let lastVisibleProduct = null;

// Utility Functions
function sanitizeInput(input) {
    return input.replace(/[<>&"']/g, '');
}

function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function showMessage(type, message, retryCallback = null) {
    const messageContainer = document.getElementById('message-container');
    const messageElement = document.createElement('div');
    messageElement.className = `${type} message`;
    messageElement.innerHTML = `${message}${retryCallback ? ' <button onclick="retryCallback()">Retry</button>' : ''}`;
    messageContainer.appendChild(messageElement);
    setTimeout(() => messageElement.remove(), 5000);
}

function showError(message, retryCallback = null) {
    console.error("Error:", message);
    showMessage('error', message, retryCallback);
}

function showSuccess(message) {
    console.log("Success:", message);
    showMessage('success', message);
}

function showNotification(message) {
    const container = document.getElementById('notification-container');
    container.style.display = 'block';
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    container.appendChild(notification);
    setTimeout(() => notification.remove(), 5000);
}

// Theme Management
function toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
}

function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
}

// Authentication
auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        document.getElementById('login-container').style.display = 'none';
        document.getElementById('home-container').style.display = 'block'; // Ensure visible
        checkAdminStatus(user.uid);
        checkOwnerStatus(user.uid);
        loadCartFromFirestore();
        db.collection(COLLECTION_NAMES.USERS).doc(user.uid).get().then(doc => {
            wishlist = doc.data().wishlist || [];
        });
        initializeNotifications();
        showHome();
    } else {
        currentUser = null;
        cart = [];
        wishlist = [];
        document.getElementById('login-container').style.display = 'block';
        document.getElementById('home-container').style.display = 'none';
        document.querySelector('.admin-only').style.display = 'none';
        document.querySelector('.owner-only').style.display = 'none';
        updateCartCount();
    }
});

function checkAdminStatus(uid) {
    db.collection(COLLECTION_NAMES.USERS).doc(uid).get().then(doc => {
        if (doc.exists && doc.data().isAdmin) {
            document.querySelector('.admin-only').style.display = 'inline-block';
        }
    }).catch(error => showError('Error checking admin status: ' + error.message));
}

function checkOwnerStatus(uid) {
    db.collection(COLLECTION_NAMES.USERS).doc(uid).get().then(doc => {
        if (doc.exists && doc.data().isOwner) {
            document.querySelector('.nav-link.owner-only').style.display = 'inline-block';
        }
    }).catch(error => showError('Error checking owner status: ' + error.message));
}

function toggleAuthForm() {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const forgotPasswordForm = document.getElementById('forgot-password-form');
    const authToggle = document.getElementById('auth-toggle');

    if (loginForm.style.display !== 'none') {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
        forgotPasswordForm.style.display = 'none';
        authToggle.innerHTML = 'Already have an account? <a href="#" onclick="toggleAuthForm()">Login here</a>';
    } else {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
        forgotPasswordForm.style.display = 'none';
        authToggle.innerHTML = 'New user? <a href="#" onclick="toggleAuthForm()">Create Account</a>';
    }
}

function login() {
    const email = sanitizeInput(document.getElementById('login-email').value.trim());
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
        showError('Please enter both email and password');
        return;
    }
    if (!validateEmail(email)) {
        showError('Please enter a valid email address');
        return;
    }

    auth.signInWithEmailAndPassword(email, password)
        .then(userCredential => {
            return db.collection(COLLECTION_NAMES.USERS).doc(userCredential.user.uid).get();
        })
        .then(doc => {
            if (doc.exists) {
                showSuccess(`Welcome back, ${doc.data().name || doc.data().email}!`);
                showHome();
            } else {
                auth.signOut();
                throw new Error('User account not found');
            }
        })
        .catch(error => {
            const retry = () => login();
            switch (error.code) {
                case 'auth/invalid-login-credentials':
                case 'auth/user-not-found':
                case 'auth/wrong-password':
                    showError('Invalid email or password', retry);
                    break;
                case 'auth/too-many-requests':
                    showError('Too many attempts. Please try later');
                    break;
                default:
                    showError('Login failed: ' + error.message, retry);
            }
        });
}

function loginWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider)
        .then(result => checkUserExists(result.user.email))
        .then(userExists => {
            if (userExists) {
                showSuccess('Logged in with Google');
                showHome();
            } else {
                auth.signOut();
                showError('No account found. Please register first');
            }
        })
        .catch(error => showError('Google sign-in failed: ' + error.message));
}

function register() {
    const name = sanitizeInput(document.getElementById('register-name').value.trim());
    const email = sanitizeInput(document.getElementById('register-email').value.trim());
    const password = document.getElementById('register-password').value;
    const imageFile = document.getElementById('register-image').files[0];

    if (!name || !email || !password) {
        showError('Please fill in all fields');
        return;
    }
    if (!validateEmail(email)) {
        showError('Please enter a valid email address');
        return;
    }

    let createdUser;
    auth.createUserWithEmailAndPassword(email, password)
        .then(userCredential => {
            createdUser = userCredential.user;
            return createUserProfile(createdUser, name);
        })
        .then(() => imageFile ? uploadProfileImage(createdUser, imageFile) : createdUser)
        .then(user => {
            showSuccess('Registration successful!');
            showHome();
        })
        .catch(error => {
            if (createdUser) createdUser.delete();
            showError('Registration failed: ' + error.message);
        });
}

function registerWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider)
        .then(result => checkUserExists(result.user.email))
        .then(userExists => {
            if (userExists) {
                auth.signOut();
                throw new Error('Account exists. Please login');
            }
            return db.collection(COLLECTION_NAMES.USERS).doc(auth.currentUser.uid).set({
                name: auth.currentUser.displayName,
                email: auth.currentUser.email,
                photoURL: auth.currentUser.photoURL,
                isAdmin: false,
                isOwner: false,
                wishlist: [],
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        })
        .then(() => {
            showSuccess('Registered with Google');
            showHome();
        })
        .catch(error => showError(error.message));
}

function checkUserExists(email) {
    return db.collection(COLLECTION_NAMES.USERS)
        .where('email', '==', email)
        .get()
        .then(querySnapshot => !querySnapshot.empty);
}

function createUserProfile(user, name) {
    return db.collection(COLLECTION_NAMES.USERS).doc(user.uid).set({
        name,
        email: user.email,
        isAdmin: false,
        isOwner: false,
        wishlist: [],
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
}

function uploadProfileImage(user, imageFile) {
    const storageRef = storage.ref(`profile_images/${user.uid}/${imageFile.name}`);
    return storageRef.put(imageFile)
        .then(() => storageRef.getDownloadURL())
        .then(url => Promise.all([
            user.updateProfile({ photoURL: url }),
            db.collection(COLLECTION_NAMES.USERS).doc(user.uid).update({ photoURL: url })
        ]))
        .then(() => user);
}

function logout() {
    saveCartToFirestore();
    auth.signOut()
        .then(() => showSuccess('Logged out successfully'))
        .catch(error => showError('Logout failed: ' + error.message));
}

// Navigation Functions
function showHome() {
    document.getElementById('content').innerHTML = '<h2>Loading...</h2>';
    db.collection(COLLECTION_NAMES.USERS).doc(currentUser.uid).get().then(doc => {
        const userData = doc.data();
        db.collection(COLLECTION_NAMES.PRODUCTS).limit(3).get().then(querySnapshot => {
            let featuredProducts = querySnapshot.docs.map(doc => `
                <div class="featured-product">
                    <img src="${doc.data().image}" alt="${doc.data().name}" class="featured-product-image">
                    <h3>${doc.data().name}</h3>
                    <p>₹${doc.data().price}</p>
                    <button onclick="showProductDetails('${doc.id}')" class="glow-button">View Details</button>
                </div>
            `).join('');
            document.getElementById('content').innerHTML = `
                <div class="home-content">
                    <div class="welcome-section">
                        <h2>Welcome, ${userData.name}!</h2>
                        <p>Discover top agricultural products.</p>
                    </div>
                    <div class="featured-products">
                        <h2>Featured Products</h2>
                        <div class="featured-products-grid">${featuredProducts}</div>
                    </div>
                    <div class="cta-section">
                        <button onclick="showShop()" class="glow-button">Shop Now</button>
                    </div>
                </div>
            `;
        });
    }).catch(error => showError('Error loading home: ' + error.message));
}

function updateSeasonDisplay() {
    const seasonDisplay = document.getElementById('season-display');
    const month = new Date().getMonth();
    let currentSeason = '';
    let seasonFilter = '';

    if (month >= 5 && month <= 8) {
        currentSeason = 'Kharif Season';
        seasonFilter = 'kharif';
    } else if (month >= 9 && month <= 11) {
        currentSeason = 'Rabi Sowing Season';
        seasonFilter = 'rabi';
    } else if (month === 0 || month === 1) {
        currentSeason = 'Rabi Growing Season';
        seasonFilter = '';
    } else if (month >= 2 && month <= 4) {
        currentSeason = 'Zaid Season';
        seasonFilter = 'zaid';
    } else {
        currentSeason = 'Kharif Preparation Season';
        seasonFilter = '';
    }

    db.collection(COLLECTION_NAMES.PRODUCTS)
        .where('season', '==', seasonFilter)
        .get()
        .then(snapshot => {
            const availableCrops = snapshot.docs
                .map(doc => {
                    const product = doc.data();
                    return `
                        <li style="--item-index: ${snapshot.docs.indexOf(doc)}">
                            ${product.name} - ₹${product.price}
                            <button onclick="showProductDetails('${doc.id}')" class="glow-button">View</button>
                        </li>
                    `;
                })
                .join('');

            seasonDisplay.innerHTML = `
                <h3>Current Season: ${currentSeason}</h3>
                <div class="scrolling-text-container">
                    <div class="scrolling-text">${currentSeason} - Sow these crops now!</div>
                </div>
                ${availableCrops.length > 0 ? `
                    <h4>Crops Available for Sowing:</h4>
                    <ul>${availableCrops}</ul>
                ` : '<p>No crops currently available for sowing.</p>'}
            `;
        })
        .catch(error => {
            console.error('Error fetching crops:', error);
            seasonDisplay.innerHTML = `
                <h3>Current Season: ${currentSeason}</h3>
                <p>Error loading available crops.</p>
            `;
        });
}

function showShop() {
    document.getElementById('content').innerHTML = `
        <h2>Shop</h2>
        <div id="search-bar" class="glass-panel">
            <input type="text" id="search-input" placeholder="Search products..." oninput="liveSearch()">
        </div>
        <div id="product-list" class="product-grid"></div>
        <button id="load-more" class="glow-button" style="display: none;">Load More</button>
    `;
    loadProducts();
}

function loadProducts(startAfter = null) {
    document.getElementById('product-list').innerHTML = '<p>Loading...</p>';
    let query = db.collection(COLLECTION_NAMES.PRODUCTS).orderBy('name').limit(ITEMS_PER_PAGE);
    if (startAfter) query = query.startAfter(startAfter);

    query.get().then(snapshot => {
        lastVisibleProduct = snapshot.docs[snapshot.docs.length - 1];
        const productsHtml = snapshot.docs.map(doc => createProductCard(doc.id, doc.data())).join('');
        document.getElementById('product-list').innerHTML = productsHtml || '<p>No products found</p>';
        const loadMoreBtn = document.getElementById('load-more');
        loadMoreBtn.style.display = snapshot.size === ITEMS_PER_PAGE ? 'block' : 'none';
        loadMoreBtn.onclick = () => loadProducts(lastVisibleProduct);

        // Event delegation for View Details
        document.getElementById('product-list').addEventListener('click', (e) => {
            const viewDetailsBtn = e.target.closest('.view-details');
            if (viewDetailsBtn) {
                const productId = viewDetailsBtn.getAttribute('data-product-id');
                showProductDetails(productId);
            }
        });
    }).catch(error => showError('Error loading products: ' + error.message));
}

function createProductCard(id, product) {
    return `
        <div class="product-card">
            <a href="#" onclick="showProductDetails('${id}'); return false;">
                <img src="${product.image}" alt="${product.name}" class="product-image">
                <div class="product-title">${product.name}</div>
                <div class="product-price">₹${product.price}</div>
                <div class="product-description">${product.description.substring(0, 50)}...</div>
                <p>Stock: ${product.stock > 0 ? product.stock : 'Out of Stock'}</p>
            </a>
            <div class="actions">
                <button onclick="addToCart('${id}')" class="add-to-cart" ${product.stock <= 0 ? 'disabled' : ''}>Add to Cart</button>
                ${wishlist.includes(id) ? `
                    <button onclick="removeFromWishlist('${id}')" class="remove-from-wishlist"><span>Remove</span></button>
                ` : `
                    <button onclick="addToWishlist('${id}')" class="add-to-wishlist"><i class="fas fa-heart"></i></button>
                `}
                <button class="view-details glow-button" data-product-id="${id}">View Details</button>
            </div>
        </div>
    `;
}

let searchTimeout;
function liveSearch() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        const searchTerm = document.getElementById('search-input').value.toLowerCase().trim();
        if (!searchTerm) {
            loadProducts();
            return;
        }
        db.collection(COLLECTION_NAMES.PRODUCTS)
            .where('searchTerms', 'array-contains', searchTerm)
            .limit(ITEMS_PER_PAGE)
            .get()
            .then(snapshot => {
                const productsHtml = snapshot.docs.map(doc => createProductCard(doc.id, doc.data())).join('');
                document.getElementById('product-list').innerHTML = productsHtml || '<p>No products found</p>';
            })
            .catch(error => showError('Error searching: ' + error.message));
    }, 300);
}

function showProductDetails(productId) {
    console.log('showProductDetails called with ID:', productId);
    const contentElement = document.getElementById('content');
    if (!contentElement) {
        console.error('Content element not found!');
        showError('Content area not found');
        return;
    }
    contentElement.innerHTML = '<h2>Loading...</h2>';
    console.log('Set loading state');
    db.collection(COLLECTION_NAMES.PRODUCTS).doc(productId).get().then(doc => {
        console.log('Product fetch result:', doc.exists ? doc.data() : 'Not found');
        if (doc.exists) {
            const product = doc.data();
            const reviewsRef = db.collection(COLLECTION_NAMES.PRODUCTS).doc(productId).collection('reviews');
            reviewsRef.get().then(snapshot => {
                console.log('Reviews fetched, count:', snapshot.size);
                const avgRating = snapshot.empty ? 0 : (snapshot.docs.reduce((sum, doc) => sum + doc.data().rating, 0) / snapshot.size).toFixed(1);
                const reviewsHtml = snapshot.docs.map(doc => `
                    <div class="review">
                        <p><strong>${doc.data().userName}</strong> (${doc.data().rating}/5)</p>
                        <p>${doc.data().comment}</p>
                    </div>
                `).join('');
                contentElement.innerHTML = `
                    <div class="product-details">
                        <div class="product-details-container">
                            <div class="product-image-container">
                                <img src="${product.image}" alt="${product.name}" class="product-detail-image">
                            </div>
                            <div class="product-info">
                                <h2>${product.name} (${avgRating}/5)</h2>
                                <p class="product-description">${product.description}</p>
                                <p class="product-price">₹${product.price}</p>
                                <p>Stock: ${product.stock > 0 ? product.stock : 'Out of Stock'}</p>
                                <div class="product-actions">
                                    <button onclick="addToCart('${doc.id}')" class="add-to-cart glow-button" ${product.stock <= 0 ? 'disabled' : ''}>Add to Cart</button>
                                    <button onclick="addToWishlist('${doc.id}')" class="add-to-wishlist glow-button"><i class="fas fa-heart"></i> Wishlist</button>
                                    <button onclick="showShop()" class="glow-button">Back to Shop</button>
                                </div>
                            </div>
                        </div>
                        <div class="product-reviews">
                            <h3>Reviews (${snapshot.size})</h3>
                            ${reviewsHtml || '<p>No reviews yet</p>'}
                            ${currentUser ? `
                                <div class="review-form">
                                    <h4>Add Review</h4>
                                    <select id="rating">
                                        <option value="5">5</option>
                                        <option value="4">4</option>
                                        <option value="3">3</option>
                                        <option value="2">2</option>
                                        <option value="1">1</option>
                                    </select>
                                    <textarea id="review-text" placeholder="Your review"></textarea>
                                    <button onclick="submitReview('${productId}')" class="glow-button">Submit</button>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;
                console.log('Product details rendered');
            }).catch(error => {
                console.error('Error fetching reviews:', error);
                showError('Error loading reviews: ' + error.message);
            });
        } else {
            showError('Product not found');
        }
    }).catch(error => {
        console.error('Error fetching product:', error);
        showError('Error loading product: ' + error.message);
    });
}


function submitReview(productId) {
    const rating = parseInt(document.getElementById('rating').value);
    const comment = sanitizeInput(document.getElementById('review-text').value.trim());
    if (!comment) return showError('Please enter a review');
    db.collection(COLLECTION_NAMES.USERS).doc(currentUser.uid).get().then(doc => {
        const userName = doc.data().name || 'Anonymous';
        db.collection(COLLECTION_NAMES.PRODUCTS).doc(productId).collection('reviews').add({
            userId: currentUser.uid,
            userName,
            rating,
            comment,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        })
        .then(() => {
            showSuccess('Review submitted');
            showProductDetails(productId);
        })
        .catch(error => showError('Error submitting review: ' + error.message));
    });
}

// Cart Functions
function addToCart(productId) {
    if (!currentUser) return showError('Please log in');
    db.collection(COLLECTION_NAMES.PRODUCTS).doc(productId).get().then(doc => {
        if (doc.exists) {
            const product = doc.data();
            if (product.stock <= 0) return showError('Out of stock');
            const existingIndex = cart.findIndex(item => item.id === doc.id);
            if (existingIndex !== -1 && cart[existingIndex].quantity >= product.stock) {
                return showError('Not enough stock available');
            }
            if (existingIndex !== -1) {
                cart[existingIndex].quantity += 1;
            } else {
                cart.push({ id: doc.id, ...product, quantity: 1 });
            }
            db.collection(COLLECTION_NAMES.PRODUCTS).doc(productId).update({ stock: product.stock - 1 });
            updateCartCount();
            saveCartToFirestore();
            showSuccess('Added to cart');
        } else {
            showError('Product not found');
        }
    }).catch(error => showError('Error adding to cart: ' + error.message));
}

function updateCartCount() {
    document.getElementById('cart-count').textContent = cart.reduce((sum, item) => sum + item.quantity, 0);
}

function saveCartToFirestore() {
    if (currentUser) {
        db.collection(COLLECTION_NAMES.CARTS).doc(currentUser.uid).set({ items: cart })
            .catch(error => console.error('Error saving cart:', error));
    }
}

function loadCartFromFirestore() {
    if (currentUser) {
        db.collection(COLLECTION_NAMES.CARTS).doc(currentUser.uid).get()
            .then(doc => {
                if (doc.exists) {
                    cart = doc.data().items || [];
                    updateCartCount();
                }
            })
            .catch(error => console.error('Error loading cart:', error));
    }
}

function showCart() {
    document.getElementById('content').innerHTML = `
        <h2>Shopping Cart</h2>
        ${cart.length === 0 ? '<p>Your cart is empty</p>' : `
            <div class="cart-items">
                ${cart.map((item, index) => `
                    <div class="cart-item">
                        <img src="${item.image}" alt="${item.name}" class="cart-item-image">
                        <div class="cart-item-details">
                            <h3>${item.name}</h3>
                            <p>Price: ₹${item.price}</p>
                            <div class="quantity-control">
                                <button onclick="updateCartItemQuantity(${index}, -1)" class="quantity-btn">-</button>
                                <span class="quantity">${item.quantity}</span>
                                <button onclick="updateCartItemQuantity(${index}, 1)" class="quantity-btn">+</button>
                            </div>
                            <p>Total: ₹${(item.price * item.quantity).toFixed(2)}</p>
                            <button onclick="removeFromCart(${index})" class="remove-btn">Remove</button>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div class="cart-summary">
                <h3>Total: ₹${cart.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2)}</h3>
                <button onclick="checkout()" class="glow-button">Checkout</button>
            </div>
        `}
    `;
}

function updateCartItemQuantity(index, change) {
    const productId = cart[index].id;
    db.collection(COLLECTION_NAMES.PRODUCTS).doc(productId).get().then(doc => {
        const stock = doc.data().stock;
        if (change > 0 && cart[index].quantity + change > stock) return showError('Not enough stock');
        cart[index].quantity += change;
        if (cart[index].quantity < 1) cart.splice(index, 1);
        db.collection(COLLECTION_NAMES.PRODUCTS).doc(productId).update({ stock: stock - change });
        updateCartCount();
        saveCartToFirestore();
        showCart();
    });
}

function removeFromCart(index) {
    const productId = cart[index].id;
    const quantity = cart[index].quantity;
    db.collection(COLLECTION_NAMES.PRODUCTS).doc(productId).get().then(doc => {
        const stock = doc.data().stock;
        db.collection(COLLECTION_NAMES.PRODUCTS).doc(productId).update({ stock: stock + quantity });
        cart.splice(index, 1);
        updateCartCount();
        saveCartToFirestore();
        showCart();
    });
}

function checkout() {
    if (cart.length === 0) return showError('Your cart is empty');
    if (!confirm('Confirm checkout?')) return;
    const couponCode = generateCouponCode();
    const totalAmount = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    Promise.all([
        saveCouponToFirebase(couponCode, totalAmount),
        db.collection(COLLECTION_NAMES.ORDERS).add({
            userEmail: currentUser.email,
            items: cart.map(item => ({ id: item.id, name: item.name, price: item.price, quantity: item.quantity })),
            total: totalAmount,
            status: 'Processing', // Change to "Processing" or "Completed"
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(docRef => {
            console.log('Order saved with ID:', docRef.id);
            return docRef;
        })
    ])
    .then(() => {
        setTimeout(() => {
            displayCouponCode(couponCode, totalAmount);
            showNotification(`Order placed! Coupon: ${couponCode}`);
            cart = [];
            updateCartCount();
            saveCartToFirestore();
        }, 100);
    })
    .catch(error => {
        console.error('Checkout error:', error);
        showError('Checkout failed: ' + error.message);
    });
}

function generateCouponCode() {
    return 'SBJR-' + Math.random().toString(36).substring(2, 10).toUpperCase();
}

function saveCouponToFirebase(couponCode, amount) {
    return db.collection(COLLECTION_NAMES.COUPONS).add({
        code: couponCode,
        amount,
        userEmail: currentUser.email,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        expiresAt: firebase.firestore.Timestamp.fromDate(new Date(Date.now() + 48 * 60 * 60 * 1000)),
        used: false,
        cartItems: cart.map(item => ({
            id: item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity
        }))
    });
}

function displayCouponCode(couponCode, amount) {
    let contentElement = document.getElementById('content');
    if (!contentElement) {
        console.warn('Content element not found, creating fallback');
        contentElement = document.createElement('div');
        contentElement.id = 'content';
        contentElement.className = 'glass-panel';
        document.getElementById('home-container').appendChild(contentElement);
    }
    contentElement.innerHTML = `
        <h2>Checkout Complete</h2>
        <p>Total: ₹${amount.toFixed(2)}</p>
        <h3>Coupon Code:</h3>
        <div class="coupon-code">${couponCode}</div>
        <button onclick="copyCouponCode('${couponCode}')" class="glow-button">Copy Code</button>
        <p>Use this code to redeem your discount!</p>
    `;
}

function copyCouponCode(couponCode) {
    navigator.clipboard.writeText(couponCode)
        .then(() => {
            showSuccess('Coupon copied! Cart cleared.');
            cart = [];
            updateCartCount();
            saveCartToFirestore();
            showHome();
        })
        .catch(error => showError('Failed to copy coupon: ' + error.message));
}

function redeemCoupon(couponCode) {
    db.collection(COLLECTION_NAMES.COUPONS)
        .where('code', '==', couponCode)
        .where('userEmail', '==', currentUser.email)
        .where('used', '==', false)
        .get()
        .then(snapshot => {
            if (!snapshot.empty) {
                const couponDoc = snapshot.docs[0];
                return couponDoc.ref.update({ used: true });
            }
            throw new Error('Invalid or used coupon');
        })
        .then(() => {
            showSuccess('Coupon redeemed successfully');
            showProfile();
        })
        .catch(error => showError(error.message));
}

// Wishlist Functions
function addToWishlist(productId) {
    if (!currentUser) return showError('Please log in');
    if (wishlist.includes(productId)) return showError('Already in wishlist');
    wishlist.push(productId);
    db.collection(COLLECTION_NAMES.USERS).doc(currentUser.uid).update({ wishlist: wishlist })
        .then(() => showSuccess('Added to wishlist'))
        .catch(error => showError('Error adding to wishlist: ' + error.message));
}

function showWishlist() {
    if (!currentUser) return showError('Please log in');
    db.collection(COLLECTION_NAMES.USERS).doc(currentUser.uid).get().then(doc => {
        wishlist = doc.data().wishlist || [];
        if (wishlist.length === 0) {
            document.getElementById('content').innerHTML = '<h2>Wishlist</h2><p>Your wishlist is empty</p>';
            return;
        }
        Promise.all(wishlist.map(id => db.collection(COLLECTION_NAMES.PRODUCTS).doc(id).get()))
            .then(docs => {
                const wishlistHtml = docs.map(doc => doc.exists ? createProductCard(doc.id, doc.data()) : '').join('');
                document.getElementById('content').innerHTML = `
                    <h2>Wishlist</h2>
                    <div class="wishlist-items">${wishlistHtml}</div>
                `;
            });
    }).catch(error => showError('Error loading wishlist: ' + error.message));
}

// Update createProductCard to include remove button for wishlist
function createProductCard(id, product) {
    return `
        <div class="product-card">
            <a href="#" onclick="showProductDetails('${id}'); return false;">
                <img src="${product.image}" alt="${product.name}" class="product-image">
                <div class="product-title">${product.name}</div>
                <div class="product-price">₹${product.price}</div>
                <div class="product-description">${product.description.substring(0, 50)}...</div>
                <p>Stock: ${product.stock > 0 ? product.stock : 'Out of Stock'}</p>
            </a>
            <div class="actions">
                <button onclick="addToCart('${id}')" class="add-to-cart" ${product.stock <= 0 ? 'disabled' : ''}>Add to Cart</button>
                ${wishlist.includes(id) ? `
                    <button onclick="removeFromWishlist('${id}')" class="remove-from-wishlist"><span>Remove</span></button>
                ` : `
                    <button onclick="addToWishlist('${id}')" class="add-to-wishlist"><i class="fas fa-heart"></i></button>
                `}
                <button onclick="showProductDetails('${id}')" class="view-details glow-button">View Details</button>
            </div>
        </div>
    `;
}

// Add removeFromWishlist function
function removeFromWishlist(productId) {
    if (!currentUser) return showError('Please log in');
    const index = wishlist.indexOf(productId);
    if (index === -1) return showError('Item not in wishlist');
    
    wishlist.splice(index, 1);
    db.collection(COLLECTION_NAMES.USERS).doc(currentUser.uid).update({ wishlist: wishlist })
        .then(() => {
            showSuccess('Removed from wishlist');
            showWishlist(); // Refresh wishlist display
        })
        .catch(error => showError('Error removing from wishlist: ' + error.message));
}

// Update showWishlist to ensure wishlist state is current
function showWishlist() {
    if (!currentUser) return showError('Please log in');
    db.collection(COLLECTION_NAMES.USERS).doc(currentUser.uid).get().then(doc => {
        wishlist = doc.data().wishlist || [];
        if (wishlist.length === 0) {
            document.getElementById('content').innerHTML = '<h2>Wishlist</h2><p>Your wishlist is empty</p>';
            return;
        }
        Promise.all(wishlist.map(id => db.collection(COLLECTION_NAMES.PRODUCTS).doc(id).get()))
            .then(docs => {
                const wishlistHtml = docs.map(doc => doc.exists ? createProductCard(doc.id, doc.data()) : '').join('');
                document.getElementById('content').innerHTML = `
                    <h2>Wishlist</h2>
                    <div class="wishlist-items">${wishlistHtml}</div>
                `;
            });
    }).catch(error => showError('Error loading wishlist: ' + error.message));
}

// Order History
function showOrderHistory() {
    if (!currentUser) return showError('Please log in');
    console.log('Fetching orders for:', currentUser.email);
    document.getElementById('content').innerHTML = '<h2>Loading Orders...</h2>';

    db.collection(COLLECTION_NAMES.ORDERS)
        .where('userEmail', '==', currentUser.email)
        .orderBy('createdAt', 'desc')
        .get()
        .then(snapshot => {
            console.log('Orders found:', snapshot.size);
            if (snapshot.empty) {
                document.getElementById('content').innerHTML = `
                    <div class="order-history">
                        <h2>Your Orders</h2>
                        <p>No orders yet</p>
                    </div>
                `;
                return;
            }

            // Split orders into current and cancelled
            const currentOrders = [];
            const cancelledOrders = [];
            
            const orderPromises = snapshot.docs.map(doc => {
                const order = doc.data();
                const productNames = order.items.map(item => item.name).join(', ');
                return db.collection(COLLECTION_NAMES.PRODUCTS).doc(order.items[0].id).get()
                    .then(productDoc => {
                        const productImage = productDoc.exists ? productDoc.data().image : 'https://via.placeholder.com/80';
                        const orderHtml = `
                            <div class="order-item">
                                <div class="order-image-container">
                                    <img src="${productImage}" alt="${order.items[0].name}" class="order-item-image">
                                </div>
                                <div class="order-details">
                                    <h3>${productNames}</h3>
                                    <p>Order ID: ${doc.id}</p>
                                    <p>Total: ₹${order.total.toFixed(2)}</p>
                                    <p>Date: ${order.createdAt.toDate().toLocaleString()}</p>
                                    <p>Items: ${order.items.map(item => `${item.name} (x${item.quantity})`).join(', ')}</p>
                                </div>
                                <div>
                                    <span class="order-status">${order.status}</span>
                                    <button onclick="viewOrderDetails('${doc.id}')">View Details</button>
                                </div>
                            </div>
                        `;
                        if (order.status === 'Cancelled') {
                            cancelledOrders.push(orderHtml);
                        } else {
                            currentOrders.push(orderHtml);
                        }
                    });
            });

            Promise.all(orderPromises).then(() => {
                document.getElementById('content').innerHTML = `
                    <div class="order-history">
                        <h2>Your Orders</h2>
                        <div class="order-category">
                            <h3 class="category-title">Current Orders</h3>
                            <div class="order-list">
                                ${currentOrders.length > 0 ? currentOrders.join('') : '<p>No current orders</p>'}
                            </div>
                        </div>
                        <div class="order-category">
                            <h3 class="category-title">Cancelled Orders</h3>
                            <div class="order-list">
                                ${cancelledOrders.length > 0 ? cancelledOrders.join('') : '<p>No cancelled orders</p>'}
                            </div>
                        </div>
                    </div>
                `;
            });
        })
        .catch(error => showError('Error loading orders: ' + error.message));
}

function viewOrderDetails(orderId) {
    db.collection(COLLECTION_NAMES.ORDERS).doc(orderId).get().then(doc => {
        if (doc.exists) {
            const order = doc.data();
            const productNames = order.items.map(item => item.name).join(', ');

            // Fetch the first product's image
            return db.collection(COLLECTION_NAMES.PRODUCTS).doc(order.items[0].id).get()
                .then(productDoc => {
                    const productImage = productDoc.exists ? productDoc.data().image : 'https://via.placeholder.com/80';
                    document.getElementById('content').innerHTML = `
                        <div class="order-history">
                            <h2>Order Details</h2>
                            <div class="order-item">
                                <div class="order-image-container">
                                    <img src="${productImage}" alt="${order.items[0].name}" class="order-item-image">
                                </div>
                                <div class="order-details">
                                    <h3>${productNames}</h3>
                                    <p>Order ID: ${doc.id}</p>
                                    <p>Total: ₹${order.total.toFixed(2)}</p>
                                    <p>Date: ${order.createdAt.toDate().toLocaleString()}</p>
                                    <p>Items:</p>
                                    <ul>
                                        ${order.items.map(item => `<li>${item.name} - ₹${item.price} x ${item.quantity}</li>`).join('')}
                                    </ul>
                                    <p>Status: <span class="order-status">${order.status}</span></p>
                                </div>
                                ${order.status === 'Pending' ? `<button onclick="cancelOrder('${doc.id}')" class="delete-btn">Cancel Order</button>` : ''}
                            </div>
                            <button onclick="showOrderHistory()">Back to Orders</button>
                        </div>
                    `;
                });
        }
    }).catch(error => showError('Error loading order details: ' + error.message));
}

function cancelOrder(orderId) {
    if (confirm('Cancel this order?')) {
        db.collection(COLLECTION_NAMES.ORDERS).doc(orderId).update({ status: 'Cancelled' })
            .then(() => {
                // Restock items
                db.collection(COLLECTION_NAMES.ORDERS).doc(orderId).get().then(doc => {
                    const order = doc.data();
                    order.items.forEach(item => {
                        db.collection(COLLECTION_NAMES.PRODUCTS).doc(item.id).get().then(productDoc => {
                            const currentStock = productDoc.data().stock;
                            db.collection(COLLECTION_NAMES.PRODUCTS).doc(item.id).update({
                                stock: currentStock + item.quantity
                            });
                        });
                    });
                });
                showSuccess('Order cancelled');
                showOrderHistory();
            })
            .catch(error => showError('Error cancelling order: ' + error.message));
    }
}

// Profile Functions
function showProfile() {
    if (!currentUser) {
        showError('Please log in');
        return;
    }
    document.getElementById('content').innerHTML = '<h2>Loading...</h2>';
    db.collection(COLLECTION_NAMES.USERS).doc(currentUser.uid).get()
        .then(doc => {
            if (doc.exists) {
                const userData = doc.data();
                document.getElementById('content').innerHTML = `
                    <div class="profile-container">
                        <div class="profile-header">
                            <div class="profile-image-container">
                                <img id="profile-image" src="${userData.photoURL || 'https://via.placeholder.com/150'}" alt="Profile">
                                <input type="file" id="profile-image-input" accept="image/*" style="display: none;">
                                <button onclick="document.getElementById('profile-image-input').click()" class="change-image-btn">Change</button>
                            </div>
                            <div class="profile-name-email">
                                <h2>${userData.name}</h2>
                                <p>${userData.email}</p>
                            </div>
                        </div>
                        <div class="profile-details">
                            <div class="profile-field">
                                <span class="field-label">Name:</span>
                                <span class="field-value">${userData.name}</span>
                                <button onclick="editProfile('name')" class="edit-btn">Edit</button>
                            </div>
                            <div class="profile-field">
                                <span class="field-label">Email:</span>
                                <span class="field-value">${userData.email}</span>
                            </div>
                            <div class="profile-field">
                                <span class="field-label">Password:</span>
                                <span class="field-value">********</span>
                                <button onclick="editProfile('password')" class="edit-btn">Change</button>
                            </div>
                        </div>
                        <div class="profile-coupons">
                            <h3>Your Coupons</h3>
                            <div id="user-coupons"></div>
                        </div>
                    </div>
                `;
                document.getElementById('profile-image-input').addEventListener('change', handleProfileImageChange);
                loadUserCoupons(); // Ensure this is present
            } else {
                throw new Error('User not found');
            }
        })
        .catch(error => {
            document.getElementById('content').innerHTML = `
                <h2>Error</h2>
                <p>Could not load profile: ${error.message}</p>
                <button onclick="logout()" class="glow-button">Logout</button>
            `;
        });
}

function handleProfileImageChange(event) {
    const file = event.target.files[0];
    if (file) updateProfileImage(file);
}

function updateProfileImage(file) {
    const storageRef = storage.ref(`profile_images/${currentUser.uid}/${file.name}`);
    storageRef.put(file)
        .then(() => storageRef.getDownloadURL())
        .then(url => Promise.all([
            currentUser.updateProfile({ photoURL: url }),
            db.collection(COLLECTION_NAMES.USERS).doc(currentUser.uid).update({ photoURL: url })
        ]))
        .then(() => {
            showSuccess('Profile image updated');
            document.getElementById('profile-image').src = currentUser.photoURL;
        })
        .catch(error => showError('Error updating image: ' + error.message));
}

function editProfile(field) {
    const fieldElements = document.querySelectorAll('.profile-field');
    let targetField;
    fieldElements.forEach(el => {
        if (el.querySelector('.field-label').textContent.includes(field.charAt(0).toUpperCase() + field.slice(1))) {
            targetField = el;
        }
    });
    if (!targetField) return showError('Field not found');

    const fieldValue = targetField.querySelector('.field-value');
    const currentValue = fieldValue.textContent;

    if (field === 'password') {
        showReauthenticationForm();
    } else {
        fieldValue.style.display = 'none';
        const editButton = targetField.querySelector('.edit-btn');
        if (editButton) editButton.style.display = 'none';

        const form = document.createElement('form');
        form.className = 'edit-form';
        form.innerHTML = `
            <input type="text" id="edit-${field}" value="${currentValue}" required>
            <button type="submit" class="glow-button">Save</button>
            <button type="button" class="glow-button" onclick="showProfile()">Cancel</button>
        `;
        targetField.appendChild(form);

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const newValue = sanitizeInput(document.getElementById(`edit-${field}`).value.trim());
            if (!newValue) {
                showError(`Please enter a new ${field}`);
                return;
            }
            updateProfile({ [field]: newValue });
            form.remove();
            fieldValue.style.display = 'block';
            if (editButton) editButton.style.display = 'block';
        });
    }
}

// Re-authentication Form for Password
function showReauthenticationForm() {
    document.getElementById('content').innerHTML = `
        <div class="reauthentication-form glass-panel">
            <h3>Re-enter Password</h3>
            <input type="password" id="reauthentication-password" placeholder="Current Password" required>
            <button onclick="reauthenticateUser()" class="glow-button">Confirm</button>
            <button onclick="showProfile()" class="glow-button">Cancel</button>
        </div>
    `;
}

// Re-authenticate User
function reauthenticateUser() {
    const password = document.getElementById('reauthentication-password').value;
    if (!password) {
        showError('Please enter your current password');
        return;
    }
    const credential = firebase.auth.EmailAuthProvider.credential(currentUser.email, password);
    currentUser.reauthenticateWithCredential(credential)
        .then(() => showPasswordChangeForm())
        .catch(error => showError('Re-authentication failed: ' + error.message));
}

// Password Change Form
function showPasswordChangeForm() {
    document.getElementById('content').innerHTML = `
        <div class="password-change-form glass-panel">
            <h3>Change Password</h3>
            <input type="password" id="new-password" placeholder="New Password" required>
            <input type="password" id="confirm-new-password" placeholder="Confirm New Password" required>
            <button onclick="changePassword()" class="glow-button">Change</button>
            <button onclick="showProfile()" class="glow-button">Cancel</button>
        </div>
    `;
}

// Change Password
function changePassword() {
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-new-password').value;
    if (!newPassword || !confirmPassword) {
        showError('Please fill in both fields');
        return;
    }
    if (newPassword !== confirmPassword) {
        showError('Passwords do not match');
        return;
    }
    currentUser.updatePassword(newPassword)
        .then(() => {
            showSuccess('Password updated successfully');
            showProfile();
        })
        .catch(error => showError('Error updating password: ' + error.message));
}

// Update Profile
function updateProfile(updates) {
    const userRef = db.collection(COLLECTION_NAMES.USERS).doc(currentUser.uid);
    currentUser.updateProfile(updates)
        .then(() => userRef.update(updates))
        .then(() => {
            showSuccess('Profile updated successfully');
            showProfile();
        })
        .catch(error => showError('Error updating profile: ' + error.message));
}

function loadUserCoupons() {
    console.log('Loading user coupons for:', currentUser.email); // Debug: Check if function is called
    
    const couponsContainer = document.getElementById('user-coupons');
    if (!couponsContainer) {
        console.error('Coupons container #user-coupons not found in DOM');
        showError('Coupons section not found');
        return;
    }

    couponsContainer.innerHTML = '<p>Loading coupons...</p>'; // Placeholder while fetching

    db.collection(COLLECTION_NAMES.COUPONS)
        .where('userEmail', '==', currentUser.email)
        .get()
        .then(snapshot => {
            console.log('Coupons snapshot size:', snapshot.size); // Debug: Check number of coupons
            
            if (snapshot.empty) {
                couponsContainer.innerHTML = '<p>No coupons available</p>';
                console.log('No coupons found for user');
                return;
            }

            let couponsHtml = '<ul class="coupon-list">';
            snapshot.forEach(doc => {
                const coupon = doc.data();
                const couponId = doc.id;
                console.log('Processing coupon:', coupon); // Debug: Log each coupon
                
                const createdAt = coupon.createdAt instanceof firebase.firestore.Timestamp ? coupon.createdAt.toDate() : new Date(coupon.createdAt);
                const expiresAt = coupon.expiresAt instanceof firebase.firestore.Timestamp ? coupon.expiresAt.toDate() : new Date(coupon.expiresAt);
                const isExpired = new Date() > expiresAt || coupon.used;
                const timeLeft = isExpired ? 'Expired' : getTimeLeft(expiresAt);
                const discount = Math.floor(Math.random() * 15) + 1; // Random discount for demo

                couponsHtml += `
                    <li id="coupon-${couponId}" class="coupon-item ${isExpired ? 'expired' : ''}">
                        <span class="coupon-code">${coupon.code}</span>
                        <span class="coupon-discount">${discount}% OFF</span>
                        <span class="coupon-status">${isExpired ? 'Expired' : 'Available'}</span>
                        <span class="coupon-expiry">${timeLeft}</span>
                        ${isExpired ? `<button onclick="deleteCoupon('${couponId}')" class="delete-btn">Delete</button>` : `<button onclick="redeemCoupon('${coupon.code}')" class="glow-button">Redeem</button>`}
                    </li>
                `;
            });
            couponsHtml += '</ul>';
            couponsContainer.innerHTML = couponsHtml;

            console.log('Coupons rendered'); // Debug: Confirm rendering
            
            // Start timer updates if coupons exist
            if (!snapshot.empty) {
                setInterval(() => updateCouponTimers(snapshot), 1000);
            }
        })
        .catch(error => {
            console.error('Error loading coupons:', error.message); // Debug: Log error
            couponsContainer.innerHTML = '<p>Error loading coupons: ' + error.message + '</p>';
            showError('Failed to load coupons');
        });
}

// Update Coupon Timers
function updateCouponTimers(snapshot) {
    snapshot.forEach(doc => {
        const coupon = doc.data();
        const couponId = doc.id;
        const expiresAt = coupon.expiresAt instanceof firebase.firestore.Timestamp ? coupon.expiresAt.toDate() : new Date(coupon.expiresAt);
        const isExpired = new Date() > expiresAt || coupon.used;
        const couponElement = document.getElementById(`coupon-${couponId}`);
        if (couponElement && !isExpired) {
            couponElement.querySelector('.coupon-expiry').textContent = getTimeLeft(expiresAt);
        }
    });
}

// Get Time Left
function getTimeLeft(expirationTime) {
    const timeLeft = expirationTime - new Date();
    if (timeLeft <= 0) return 'Expired';
    const hours = Math.floor(timeLeft / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
    return `${hours}h ${minutes}m ${seconds}s`;
}

function deleteCoupon(couponId) {
    if (confirm('Delete this coupon?')) {
        db.collection(COLLECTION_NAMES.COUPONS).doc(couponId).delete()
            .then(() => {
                showSuccess('Coupon deleted');
                loadUserCoupons();
            })
            .catch(error => showError('Error deleting coupon: ' + error.message));
    }
}

function redeemCoupon(couponCode) {
    db.collection(COLLECTION_NAMES.COUPONS)
        .where('code', '==', couponCode)
        .where('userEmail', '==', currentUser.email)
        .where('used', '==', false)
        .get()
        .then(snapshot => {
            if (!snapshot.empty) {
                const couponDoc = snapshot.docs[0];
                return couponDoc.ref.update({ used: true });
            }
            throw new Error('Invalid or used coupon');
        })
        .then(() => {
            showSuccess('Coupon redeemed successfully');
            showProfile();
        })
        .catch(error => showError(error.message));
}

// Admin Functions
function showAdminPanel() {
    if (!currentUser) {
        showError('Please log in');
        return;
    }
    db.collection(COLLECTION_NAMES.USERS).doc(currentUser.uid).get().then(doc => {
        if (doc.exists && doc.data().isAdmin) {
            document.getElementById('content').innerHTML = `
                <h2>Admin Panel</h2>
                <div class="admin-actions">
                    <button onclick="showAllUsers()" class="glow-button">Show Users</button>
                    <button onclick="showAllOrders()" class="glow-button">Manage Orders</button>
                </div>
                <div id="product-form-container">
                    <h3 id="form-title">Add Product</h3>
                    <form id="add-product-form">
                        <input type="hidden" id="product-id">
                        <input type="text" id="product-name" placeholder="Name" required>
                        <textarea id="product-description" placeholder="Description" required></textarea>
                        <input type="number" id="product-price" placeholder="Price" step="0.01" required>
                        <input type="number" id="product-stock" placeholder="Stock" required>
                        <select id="product-season" required>
                            <option value="" disabled selected>Select Season</option>
                            <option value="kharif">Kharif</option>
                            <option value="rabi">Rabi</option>
                            <option value="zaid">Zaid</option>
                        </select>
                        <input type="file" id="product-image" accept="image/*">
                        <div id="current-image-container" style="display: none;">
                            <img id="current-image" style="max-width: 200px;">
                        </div>
                        <button type="submit" class="glow-button" id="form-submit-btn">Add</button>
                        <button type="button" class="glow-button" id="cancel-edit-btn" style="display: none;" onclick="cancelEdit()">Cancel</button>
                    </form>
                </div>
                <div id="product-list">
                    <h3>Products</h3>
                    <ul id="admin-product-list"></ul>
                </div>
            `;
            document.getElementById('add-product-form').addEventListener('submit', e => {
                e.preventDefault();
                const productId = document.getElementById('product-id').value;
                productId ? updateProduct(productId) : addProduct();
            });
            updateAdminProductList();
        } else {
            showError('Admin access required');
        }
    }).catch(error => showError('Error accessing admin panel: ' + error.message));
}

function showAllOrders() {
    db.collection(COLLECTION_NAMES.ORDERS).orderBy('createdAt', 'desc').get().then(snapshot => {
        const ordersHtml = snapshot.docs.map(doc => {
            const order = doc.data();
            return `
                <div class="order-item">
                    <div class="order-details">
                        <h3>Order #${doc.id}</h3>
                        <p>User: ${order.userEmail}</p>
                        <p>Total: ₹${order.total.toFixed(2)}</p>
                        <p>Date: ${order.createdAt.toDate().toLocaleString()}</p>
                        <p>Items: ${order.items.map(item => `${item.name} (x${item.quantity})`).join(', ')}</p>
                    </div>
                    <select onchange="updateOrderStatus('${doc.id}', this.value)">
                        <option value="Pending" ${order.status === 'Pending' ? 'selected' : ''}>Pending</option>
                        <option value="Processing" ${order.status === 'Processing' ? 'selected' : ''}>Processing</option>
                        <option value="Shipped" ${order.status === 'Shipped' ? 'selected' : ''}>Shipped</option>
                        <option value="Delivered" ${order.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
                        <option value="Cancelled" ${order.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
                    </select>
                </div>
            `;
        }).join('');
        document.getElementById('content').innerHTML = `
            <div class="order-history">
                <h2>All Orders</h2>
                ${ordersHtml || '<p>No orders</p>'}
                <button onclick="showAdminPanel()" class="glow-button">Back to Admin Panel</button>
            </div>
        `;
    }).catch(error => showError('Error loading orders: ' + error.message));
}

function updateOrderStatus(orderId, status) {
    db.collection(COLLECTION_NAMES.ORDERS).doc(orderId).update({ status })
        .then(() => {
            showSuccess(`Order status updated to ${status}`);
            showAllOrders(); // Refresh the list
        })
        .catch(error => showError('Error updating status: ' + error.message));
}

function addProduct() {
    const name = sanitizeInput(document.getElementById('product-name').value.trim());
    const description = sanitizeInput(document.getElementById('product-description').value.trim());
    const price = document.getElementById('product-price').value;
    const stock = parseInt(document.getElementById('product-stock').value);
    const season = document.getElementById('product-season').value; // New season field
    const imageFile = document.getElementById('product-image').files[0];

    if (!name || !description || !price || !imageFile || isNaN(stock) || !season) {
        showError('All fields required');
        return;
    }
    if (isNaN(price) || price <= 0) {
        showError('Invalid price');
        return;
    }
    if (stock < 0) {
        showError('Stock cannot be negative');
        return;
    }

    const storageRef = storage.ref(`product-images/${Date.now()}_${imageFile.name}`);
    storageRef.put(imageFile)
        .then(() => storageRef.getDownloadURL())
        .then(url => db.collection(COLLECTION_NAMES.PRODUCTS).add({
            name,
            description,
            price: parseFloat(price).toFixed(2),
            stock,
            image: url,
            season, // Save the season to Firestore
            searchTerms: name.toLowerCase().split(' ').concat(description.toLowerCase().split(' '))
        }))
        .then(() => {
            showSuccess('Product added');
            document.getElementById('add-product-form').reset();
            updateAdminProductList();
        })
        .catch(error => showError('Error adding product: ' + error.message));
}

function updateAdminProductList() {
    const list = document.getElementById('admin-product-list');
    list.innerHTML = '<p>Loading...</p>';
    db.collection(COLLECTION_NAMES.PRODUCTS).get().then(snapshot => {
        list.innerHTML = snapshot.docs.map(doc => `
            <li>
                <img src="${doc.data().image}" alt="${doc.data().name}" style="width: 50px;">
                <div class="product-info">
                    <strong>${doc.data().name}</strong> - ₹${doc.data().price}
                    <p>${doc.data().description}</p>
                    <p>Stock: ${doc.data().stock}</p>
                </div>
                <div class="product-actions">
                    <button onclick="editProduct('${doc.id}')" class="edit-btn">Edit</button>
                    <button onclick="deleteProduct('${doc.id}')" class="delete-btn">Delete</button>
                </div>
            </li>
        `).join('');
    }).catch(error => showError('Error loading products: ' + error.message));
}

function editProduct(productId) {
    db.collection(COLLECTION_NAMES.PRODUCTS).doc(productId).get().then(doc => {
        if (doc.exists) {
            const product = doc.data();
            document.getElementById('form-title').textContent = 'Edit Product';
            document.getElementById('form-submit-btn').textContent = 'Update';
            document.getElementById('product-id').value = productId;
            document.getElementById('product-name').value = product.name;
            document.getElementById('product-description').value = product.description;
            document.getElementById('product-price').value = product.price;
            document.getElementById('product-stock').value = product.stock;
            document.getElementById('current-image-container').style.display = 'block';
            document.getElementById('current-image').src = product.image;
            document.getElementById('product-image').removeAttribute('required');
            document.getElementById('cancel-edit-btn').style.display = 'inline-block';
        }
    }).catch(error => showError('Error loading product: ' + error.message));
}

function updateProduct(productId) {
    const name = sanitizeInput(document.getElementById('product-name').value.trim());
    const description = sanitizeInput(document.getElementById('product-description').value.trim());
    const price = document.getElementById('product-price').value;
    const stock = parseInt(document.getElementById('product-stock').value);
    const imageFile = document.getElementById('product-image').files[0];

    if (!name || !description || !price || isNaN(stock)) {
        showError('All fields required');
        return;
    }
    if (isNaN(price) || price <= 0) {
        showError('Invalid price');
        return;
    }
    if (stock < 0) {
        showError('Stock cannot be negative');
        return;
    }

    const updateData = {
        name,
        description,
        price: parseFloat(price).toFixed(2),
        stock,
        searchTerms: name.toLowerCase().split(' ').concat(description.toLowerCase().split(' '))
    };

    const updatePromise = imageFile ?
        storage.ref(`product-images/${Date.now()}_${imageFile.name}`).put(imageFile)
            .then(() => storage.ref(`product-images/${Date.now()}_${imageFile.name}`).getDownloadURL())
            .then(url => {
                updateData.image = url;
                return db.collection(COLLECTION_NAMES.PRODUCTS).doc(productId).update(updateData);
            }) :
        db.collection(COLLECTION_NAMES.PRODUCTS).doc(productId).update(updateData);

    updatePromise.then(() => {
        showSuccess('Product updated');
        cancelEdit();
        updateAdminProductList();
    }).catch(error => showError('Error updating product: ' + error.message));
}

function cancelEdit() {
    document.getElementById('form-title').textContent = 'Add Product';
    document.getElementById('form-submit-btn').textContent = 'Add';
    document.getElementById('add-product-form').reset();
    document.getElementById('product-id').value = '';
    document.getElementById('current-image-container').style.display = 'none';
    document.getElementById('cancel-edit-btn').style.display = 'none';
    document.getElementById('product-image').setAttribute('required', 'required');
}

function deleteProduct(productId) {
    if (confirm('Delete this product?')) {
        db.collection(COLLECTION_NAMES.PRODUCTS).doc(productId).delete()
            .then(() => {
                showSuccess('Product deleted');
                updateAdminProductList();
            })
            .catch(error => showError('Error deleting product: ' + error.message));
    }
}

function showAllUsers() {
    document.getElementById('content').innerHTML = '<h2>Loading Users...</h2>';
    db.collection(COLLECTION_NAMES.USERS).get().then(snapshot => {
        document.getElementById('content').innerHTML = `
            <h2>All Users</h2>
            <table class="users-table">
                <thead>
                    <tr>
                        <th>Photo</th>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${snapshot.docs.map(doc => {
                        const user = doc.data();
                        return `
                            <tr>
                                <td><img src="${user.photoURL || 'https://via.placeholder.com/50'}" class="user-profile-picture"></td>
                                <td>${user.name || 'N/A'}</td>
                                <td>${user.email}</td>
                                <td>${user.isAdmin ? 'Admin' : 'Customer'}</td>
                                <td>
                                    <button onclick="viewUserDetails('${doc.id}')" class="view-btn">View</button>
                                    ${!user.isAdmin ? `<button onclick="deleteUser('${doc.id}')" class="delete-btn">Delete</button>` : ''}
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
            <button onclick="showAdminPanel()" class="glow-button">Back</button>
        `;
    }).catch(error => showError('Error loading users: ' + error.message));
}

function viewUserDetails(userId) {
    db.collection(COLLECTION_NAMES.USERS).doc(userId).get().then(doc => {
        if (doc.exists) {
            const user = doc.data();
            const joinedDate = user.createdAt ? new Date(user.createdAt.toDate()).toLocaleDateString() : 'N/A';
            document.getElementById('content').innerHTML = `
                <div class="user-details">
                    <img src="${user.photoURL || 'https://via.placeholder.com/150'}" alt="${user.name}" class="user-profile-picture-large">
                    <h3>${user.name || 'N/A'}</h3>
                    <p>Email: ${user.email}</p>
                    <p>Role: ${user.isAdmin ? 'Admin' : 'Customer'}</p>
                    <p>Joined: ${joinedDate}</p>
                    ${!user.isAdmin ? `<button onclick="deleteUser('${doc.id}')" class="delete-btn">Delete</button>` : ''}
                    <button onclick="showAllUsers()" class="glow-button">Back</button>
                </div>
            `;
        }
    }).catch(error => showError('Error loading user: ' + error.message));
}

function deleteUser(userId) {
    if (confirm('Delete this user?')) {
        db.collection(COLLECTION_NAMES.USERS).doc(userId).get()
            .then(doc => {
                if (doc.exists && !doc.data().isAdmin) {
                    return Promise.all([
                        db.collection(COLLECTION_NAMES.USERS).doc(userId).delete(),
                        db.collection(COLLECTION_NAMES.CARTS).doc(userId).delete(),
                        db.collection(COLLECTION_NAMES.COUPONS).where('userEmail', '==', doc.data().email).get()
                            .then(snapshot => Promise.all(snapshot.docs.map(doc => doc.ref.delete())))
                    ]);
                }
                throw new Error('Cannot delete admin');
            })
            .then(() => {
                showSuccess('User deleted');
                showAllUsers();
            })
            .catch(error => showError('Error deleting user: ' + error.message));
    }
}

// Owner Panel
function showOwnerPanel() {
    document.getElementById('content').innerHTML = `
        <h2>Owner Information</h2>
        <div class="owner-info">
            <div class="owner-content">
                <div class="owner-image-container" id="tilt-container">
                    <img src="owner_image.jpg" alt="Gulshan Goel" class="owner-image" id="tilt-image">
                </div>
                <div class="owner-details">
                    <h3>Gulshan Goel</h3>
                    <p>Founder of SBJR Agriculture Shop</p>
                    <p>20+ years in agriculture innovation</p>
                </div>
            </div>
        </div>
    `;
    setupTiltEffect();
}

function setupTiltEffect() {
    const container = document.getElementById('tilt-container');
    const image = document.getElementById('tilt-image');
    if (!container || !image) return;

    const maxTilt = 10;
    container.addEventListener('mousemove', e => {
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const percentX = (x - centerX) / centerX;
        const percentY = -((y - centerY) / centerY);
        const tiltX = maxTilt * percentY;
        const tiltY = maxTilt * percentX;
        image.style.transform = `perspective(1000px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale3d(1.05, 1.05, 1.05)`;
    });
    container.addEventListener('mouseleave', () => {
        image.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
    });
}

// Season Display
function updateSeasonDisplay() {
    const seasonDisplay = document.getElementById('season-display');
    const month = new Date().getMonth();
    let currentSeason = '';
    if (month >= 5 && month <= 8) currentSeason = 'Kharif Season';
    else if (month >= 9 && month <= 11) currentSeason = 'Rabi Sowing Season';
    else if (month >= 0 && month <= 2) currentSeason = 'Rabi Growing Season';
    else if (month >= 2 && month <= 4) currentSeason = 'Rabi Harvesting Season';
    else currentSeason = 'Kharif Preparation Season';
    seasonDisplay.innerHTML = `
        <h3>Current Season:</h3>
        <div class="scrolling-text-container">
            <div class="scrolling-text">${currentSeason} - Shop now!</div>
        </div>
    `;
}

// Notifications
function showNotification(message) {
    const container = document.getElementById('notification-container');
    container.style.display = 'block'; // Show the container
    
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    container.appendChild(notification);
    
    // Automatically hide the notification and container after 5 seconds
    setTimeout(() => {
        notification.remove(); // Remove the notification text
        if (container.children.length === 0) {
            container.style.display = 'none'; // Hide container if no more notifications
        }
    }, 5000);
}

function initializeNotifications() {
    if (currentUser) {
        // Listen for order status updates
        db.collection(COLLECTION_NAMES.ORDERS)
            .where('userEmail', '==', currentUser.email)
            .onSnapshot(snapshot => {
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'modified') {
                        const order = change.doc.data();
                        showNotification(`Order #${change.doc.id} status updated to: ${order.status}`);
                    }
                });
            });

        // Listen for new products and show only one notification per batch
        db.collection(COLLECTION_NAMES.PRODUCTS).onSnapshot(snapshot => {
            const hasNewProducts = snapshot.docChanges().some(change => change.type === 'added');
            if (hasNewProducts) {
                showNotification('New products added! Check the shop.');
            }
        });
    }
}


// Password Reset
function showForgotPasswordForm() {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('forgot-password-form').style.display = 'block';
}

function showLoginForm() {
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('forgot-password-form').style.display = 'none';
}

function resetPassword() {
    const email = sanitizeInput(document.getElementById('reset-email').value.trim());
    if (!email || !validateEmail(email)) {
        showError('Enter a valid email');
        return;
    }
    auth.sendPasswordResetEmail(email)
        .then(() => {
            showSuccess('Reset email sent');
            showLoginForm();
        })
        .catch(error => showError('Reset failed: ' + error.message));
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    initializeTheme();
    updateCartCount();
    updateSeasonDisplay();
    document.getElementById('register-image')?.addEventListener('change', e => {
        const file = e.target.files[0];
        const preview = document.getElementById('register-image-preview');
        if (file) {
            const reader = new FileReader();
            reader.onload = e => preview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
            reader.readAsDataURL(file);
        } else {
            preview.innerHTML = '';
        }
    });
});