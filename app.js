// Firebase Web SDK Imports via CDN (Native ES Modules)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut,
    createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    doc, 
    getDoc, 
    getDocs, 
    setDoc, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    query, 
    orderBy 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
// Firebase Storage removed — using external URLs instead (no Blaze plan needed)

// Retrieve config from global window object
const firebaseConfig = window.firebaseConfig;
if (!firebaseConfig) {
    console.error("Firebase Configuration is missing! Ensure firebase-config.js is loaded first.");
}

// Initialize Firebase services
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
// Storage removed — articles use external URLs

// Keep track of active edit IDs
let editingQuoteId = null;
let editingJournalId = null;
let editingArticleId = null;
let currentArticleMediaUrl = null;

// DOM Elements
const loginContainer = document.getElementById('login-container');
const appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('login-form');
const btnLogout = document.getElementById('btn-logout');
const toastContainer = document.getElementById('toast-container');
const adminNameEl = document.getElementById('admin-name');
const adminAvatarEl = document.getElementById('admin-avatar');

// Navigation Tabs
const navItems = document.querySelectorAll('.nav-item');
const tabPanels = document.querySelectorAll('.tab-panel');
const pageTitleEl = document.getElementById('page-title');
const pageSubtitleEl = document.getElementById('page-subtitle');

// --- NOTIFICATION SYSTEM (TOAST) ---
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icon = document.createElement('i');
    icon.className = type === 'success' 
        ? 'fa-solid fa-circle-check toast-icon' 
        : 'fa-solid fa-circle-exclamation toast-icon';
        
    const msg = document.createElement('span');
    msg.className = 'toast-message';
    msg.textContent = message;
    
    toast.appendChild(icon);
    toast.appendChild(msg);
    toastContainer.appendChild(toast);
    
    // Auto remove after 3.5s
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px)';
        setTimeout(() => toast.remove(), 400);
    }, 3500);
}

// --- AUTHENTICATION STATE OBSERVER ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Fetch user document from Firestore to verify Admin role
        try {
            const userDocRef = doc(db, "users", user.uid);
            const userDocSnap = await getDoc(userDocRef);
            
            if (userDocSnap.exists() && userDocSnap.data().role === 'admin') {
                // User is Admin, authorize entry
                loginContainer.classList.add('hidden');
                appContainer.classList.remove('hidden');
                
                const name = userDocSnap.data().name || user.email.split('@')[0];
                adminNameEl.textContent = name;
                adminAvatarEl.textContent = name.charAt(0).toUpperCase();
                
                showToast("Selamat datang kembali, Admin " + name, "success");
                loadDashboardData();
            } else {
                // Deny access
                showToast("Akses Ditolak: Akun Anda tidak memiliki peran administrator.", "error");
                await signOut(auth);
            }
        } catch (error) {
            console.error(error);
            showToast("Gagal melakukan autentikasi: " + error.message, "error");
            await signOut(auth);
        }
    } else {
        // User logged out
        appContainer.classList.add('hidden');
        loginContainer.classList.remove('hidden');
        resetForms();
    }
});

// --- LOGIN HANDLER ---
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btnLogin = document.getElementById('btn-login');
    
    btnLogin.disabled = true;
    btnLogin.querySelector('span').textContent = "Sedang Masuk...";
    
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        showToast("Login gagal: " + error.message, "error");
        btnLogin.disabled = false;
        btnLogin.querySelector('span').textContent = "Masuk";
    }
});

// --- LOGOUT HANDLER ---
btnLogout.addEventListener('click', async () => {
    try {
        await signOut(auth);
        showToast("Berhasil keluar akun.", "success");
    } catch (error) {
        showToast("Gagal keluar: " + error.message, "error");
    }
});

// --- SPA TAB ROUTING NAVIGATION ---
navItems.forEach(item => {
    item.addEventListener('click', () => {
        const tab = item.getAttribute('data-tab');
        
        // Update active class on nav items
        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
        
        // Update visible tab panels
        tabPanels.forEach(panel => panel.classList.remove('active'));
        document.getElementById(`panel-${tab}`).classList.add('active');
        
        // Update titles
        updatePageTitles(tab);
        
        // Load data based on tab selected
        if (tab === 'dashboard') loadDashboardData();
        else if (tab === 'quotes') loadQuotesPage();
        else if (tab === 'journals') loadJournalsPage();
        else if (tab === 'articles') loadArticlesPage();
        else if (tab === 'chatbot') loadChatbotPage();
        else if (tab === 'users') loadUsersPage();
    });
});

function updatePageTitles(tab) {
    const titles = {
        dashboard: { title: "Dashboard Overview", subtitle: "Ringkasan status aplikasi Hera saat ini." },
        quotes: { title: "Quotes Harian", subtitle: "Kelola kutipan motivasi harian yang tampil di beranda aplikasi." },
        journals: { title: "Topik Jurnal", subtitle: "Kelola topik, instruksi, dan langkah-langkah latihan relasi diri." },
        articles: { title: "Artikel", subtitle: "Kelola konten edukasi makanan sehat dan tips kesehatan untuk menaikkan mood." },
        chatbot: { title: "Konfigurasi AI Heralyze", subtitle: "Atur kepribadian, gaya penulisan, dan perilaku agen AI chatbot." },
        users: { title: "Manajemen User", subtitle: "Pantau pengguna aplikasi dan atur peran administrasi." }
    };
    
    if (titles[tab]) {
        pageTitleEl.textContent = titles[tab].title;
        pageSubtitleEl.textContent = titles[tab].subtitle;
    }
}

function resetForms() {
    editingQuoteId = null;
    editingJournalId = null;
    editingArticleId = null;
    currentArticleMediaUrl = null;
    document.getElementById('quote-form').reset();
    document.getElementById('journal-form').reset();
    document.getElementById('article-form').reset();
    document.getElementById('btn-cancel-quote-edit').classList.add('hidden');
    document.getElementById('btn-cancel-journal-edit').classList.add('hidden');
    document.getElementById('btn-cancel-article-edit').classList.add('hidden');
    document.getElementById('journal-steps-container').innerHTML = '';
    document.getElementById('btn-save-article').innerHTML = `<i class="fa-solid fa-save"></i> Simpan Artikel`;
}

// ==========================================
// 1. DASHBOARD PANEL CONTROLLER
// ==========================================
async function loadDashboardData() {
    try {
        // Fetch Users count
        const usersSnap = await getDocs(collection(db, "users"));
        document.getElementById('stat-total-users').textContent = usersSnap.size;
        
        // Fetch Quotes count
        const quotesSnap = await getDocs(collection(db, "quotes"));
        document.getElementById('stat-total-quotes').textContent = quotesSnap.size;
        
        // Fetch Journals count
        const journalsSnap = await getDocs(collection(db, "journals"));
        document.getElementById('stat-total-journals').textContent = journalsSnap.size;

        // Fetch Articles count
        const articlesSnap = await getDocs(collection(db, "articles"));
        document.getElementById('stat-total-articles').textContent = articlesSnap.size;
        
        // Show active quote
        const activeQuoteQuery = query(collection(db, "quotes"));
        const allQuotes = await getDocs(activeQuoteQuery);
        let activeQuote = null;
        allQuotes.forEach(docSnap => {
            const data = docSnap.data();
            if (data.active === true) activeQuote = data;
        });
        
        if (activeQuote) {
            document.getElementById('dashboard-active-quote').textContent = `"${activeQuote.text}"`;
            document.getElementById('dashboard-active-quote-author').textContent = `- ${activeQuote.author}`;
        } else {
            document.getElementById('dashboard-active-quote').textContent = "Tidak ada quote aktif saat ini.";
            document.getElementById('dashboard-active-quote-author').textContent = "";
        }
        
        // Show AI config prompt
        const aiConfigRef = doc(db, "configs", "heralyze");
        const aiConfigSnap = await getDoc(aiConfigRef);
        if (aiConfigSnap.exists()) {
            document.getElementById('dashboard-ai-prompt').textContent = aiConfigSnap.data().system_prompt;
        } else {
            document.getElementById('dashboard-ai-prompt').textContent = "Konfigurasi AI belum ditambahkan ke Firestore.";
        }
        
    } catch (error) {
        console.error(error);
        showToast("Gagal memuat ringkasan dashboard: " + error.message, "error");
    }
}

// ==========================================
// 2. QUOTES PANEL CONTROLLER
// ==========================================
async function loadQuotesPage() {
    resetForms();
    await renderQuotesTable();
}

async function renderQuotesTable() {
    const listEl = document.getElementById('quotes-list');
    listEl.innerHTML = `<tr><td colspan="4" class="text-center">Memuat data quotes...</td></tr>`;
    
    try {
        const quotesQuery = query(collection(db, "quotes"));
        const querySnap = await getDocs(quotesQuery);
        
        if (querySnap.empty) {
            listEl.innerHTML = `<tr><td colspan="4" class="text-center text-muted">Belum ada data quotes.</td></tr>`;
            return;
        }
        
        listEl.innerHTML = '';
        querySnap.forEach(docSnap => {
            const quote = docSnap.data();
            const id = docSnap.id;
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${quote.text}</td>
                <td><strong>${quote.author}</strong></td>
                <td>
                    <span class="badge ${quote.active ? 'badge-success' : 'text-muted bg-emerald-light'}" style="background-color: ${quote.active ? '' : '#f1f5f9'}; color: ${quote.active ? '' : '#64748b'}">
                        ${quote.active ? 'Aktif' : 'Nonaktif'}
                    </span>
                </td>
                <td>
                    <div class="table-actions">
                        <button class="btn btn-edit btn-action-small btn-toggle-active" data-id="${id}" data-active="${quote.active}">
                            <i class="fa-solid fa-power-off"></i>
                        </button>
                        <button class="btn btn-edit btn-action-small btn-edit-quote" data-id="${id}">
                            <i class="fa-solid fa-pencil"></i>
                        </button>
                        <button class="btn btn-danger btn-action-small btn-delete-quote" data-id="${id}">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>
            `;
            listEl.appendChild(tr);
        });
        
        bindQuotesTableEvents();
    } catch (error) {
        showToast("Gagal memuat daftar quotes: " + error.message, "error");
    }
}

function bindQuotesTableEvents() {
    // Delete Quote
    document.querySelectorAll('.btn-delete-quote').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = btn.getAttribute('data-id');
            if (confirm("Apakah Anda yakin ingin menghapus quote ini?")) {
                try {
                    await deleteDoc(doc(db, "quotes", id));
                    showToast("Quote berhasil dihapus.", "success");
                    await renderQuotesTable();
                } catch (error) {
                    showToast("Gagal menghapus quote: " + error.message, "error");
                }
            }
        });
    });
    
    // Toggle Active Status
    document.querySelectorAll('.btn-toggle-active').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = btn.getAttribute('data-id');
            const isActive = btn.getAttribute('data-active') === 'true';
            
            try {
                // If turning active, turn off other quotes first
                if (!isActive) {
                    const allQuotes = await getDocs(collection(db, "quotes"));
                    for (const docSnap of allQuotes.docs) {
                        if (docSnap.data().active === true) {
                            await updateDoc(doc(db, "quotes", docSnap.id), { active: false });
                        }
                    }
                }
                
                // Toggle status
                await updateDoc(doc(db, "quotes", id), { active: !isActive });
                showToast("Status quote berhasil diperbarui.", "success");
                await renderQuotesTable();
            } catch (error) {
                showToast("Gagal mengubah status quote: " + error.message, "error");
            }
        });
    });
    
    // Edit Quote (load into form)
    document.querySelectorAll('.btn-edit-quote').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = btn.getAttribute('data-id');
            try {
                const docSnap = await getDoc(doc(db, "quotes", id));
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    editingQuoteId = id;
                    document.getElementById('quote-text').value = data.text;
                    document.getElementById('quote-author').value = data.author;
                    document.getElementById('quote-active').checked = data.active;
                    
                    document.getElementById('btn-cancel-quote-edit').classList.remove('hidden');
                    document.getElementById('btn-save-quote').innerHTML = `<i class="fa-solid fa-save"></i> Perbarui Quote`;
                    showToast("Memuat quote untuk diedit.", "success");
                }
            } catch (error) {
                showToast("Gagal memuat quote: " + error.message, "error");
            }
        });
    });
}

// Quote Form Submit
document.getElementById('quote-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = document.getElementById('quote-text').value.trim();
    const author = document.getElementById('quote-author').value.trim();
    const active = document.getElementById('quote-active').checked;
    
    try {
        // If set as active, make others inactive
        if (active) {
            const allQuotes = await getDocs(collection(db, "quotes"));
            for (const docSnap of allQuotes.docs) {
                if (docSnap.data().active === true && docSnap.id !== editingQuoteId) {
                    await updateDoc(doc(db, "quotes", docSnap.id), { active: false });
                }
            }
        }
        
        const quoteData = { text, author, active };
        
        if (editingQuoteId) {
            // Edit mode
            await setDoc(doc(db, "quotes", editingQuoteId), quoteData, { merge: true });
            showToast("Quote berhasil diperbarui.", "success");
        } else {
            // Add mode
            await addDoc(collection(db, "quotes"), quoteData);
            showToast("Quote baru berhasil ditambahkan.", "success");
        }
        
        resetForms();
        await renderQuotesTable();
    } catch (error) {
        showToast("Gagal menyimpan quote: " + error.message, "error");
    }
});

// Cancel Quote Edit
document.getElementById('btn-cancel-quote-edit').addEventListener('click', () => {
    resetForms();
    document.getElementById('btn-save-quote').innerHTML = `<i class="fa-solid fa-save"></i> Simpan Quote`;
});

// ==========================================
// 3. JOURNAL TOPICS PANEL CONTROLLER
// ==========================================
let stepCount = 0;

function addStepInputRow(value = '') {
    stepCount++;
    const container = document.getElementById('journal-steps-container');
    const row = document.createElement('div');
    row.className = 'step-input-row';
    row.id = `step-row-${stepCount}`;
    row.innerHTML = `
        <span>${container.children.length + 1}</span>
        <input type="text" class="journal-step-input" placeholder="Masukkan instruksi langkah..." value="${value.replace(/"/g, '&quot;')}" required>
        <button type="button" class="btn btn-danger btn-action-small btn-remove-step" data-row-id="step-row-${stepCount}">
            <i class="fa-solid fa-times"></i>
        </button>
    `;
    container.appendChild(row);
    
    // Bind remove button event
    row.querySelector('.btn-remove-step').addEventListener('click', () => {
        row.remove();
        reindexSteps();
    });
}

function reindexSteps() {
    const container = document.getElementById('journal-steps-container');
    Array.from(container.children).forEach((child, index) => {
        child.querySelector('span').textContent = index + 1;
    });
}

document.getElementById('btn-add-step').addEventListener('click', () => {
    addStepInputRow();
});

async function loadJournalsPage() {
    resetForms();
    await renderJournalsList();
}

async function renderJournalsList() {
    const listEl = document.getElementById('journals-list');
    listEl.innerHTML = `<p class="text-center text-muted">Memuat topik jurnal...</p>`;
    
    try {
        const journalQuery = query(collection(db, "journals"), orderBy("order"));
        const querySnap = await getDocs(journalQuery);
        
        if (querySnap.empty) {
            listEl.innerHTML = `<p class="text-center text-muted">Belum ada topik jurnal terdaftar.</p>`;
            return;
        }
        
        listEl.innerHTML = '';
        querySnap.forEach(docSnap => {
            const journal = docSnap.data();
            const id = docSnap.id;
            
            const item = document.createElement('div');
            item.className = 'journal-list-item';
            
            // Generate list of steps
            let stepsHtml = '';
            if (journal.steps && journal.steps.length > 0) {
                stepsHtml = '<ol>' + journal.steps.map(step => `<li>${step}</li>`).join('') + '</ol>';
            } else {
                stepsHtml = '<p class="text-muted">Tidak ada langkah ditambahkan.</p>';
            }
            
            item.innerHTML = `
                <div class="journal-item-header">
                    <span class="journal-item-title">${journal.title}</span>
                    <span class="badge bg-indigo-light text-indigo">Order: ${journal.order || 0}</span>
                </div>
                <div class="journal-item-objective">
                    <strong>Tujuan:</strong> ${journal.objective}
                </div>
                <div class="journal-item-steps">
                    <strong>Langkah-Langkah:</strong>
                    ${stepsHtml}
                </div>
                <div class="journal-item-footer">
                    <button class="btn btn-edit btn-action-small btn-edit-journal" data-id="${id}">
                        <i class="fa-solid fa-pencil"></i> Edit
                    </button>
                    <button class="btn btn-danger btn-action-small btn-delete-journal" data-id="${id}">
                        <i class="fa-solid fa-trash"></i> Hapus
                    </button>
                </div>
            `;
            listEl.appendChild(item);
        });
        
        bindJournalsEvents();
    } catch (error) {
        showToast("Gagal memuat topik jurnal: " + error.message, "error");
    }
}

function bindJournalsEvents() {
    // Delete Journal Topic
    document.querySelectorAll('.btn-delete-journal').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = btn.getAttribute('data-id');
            if (confirm("Apakah Anda yakin ingin menghapus topik jurnal ini?")) {
                try {
                    await deleteDoc(doc(db, "journals", id));
                    showToast("Topik jurnal berhasil dihapus.", "success");
                    await renderJournalsList();
                } catch (error) {
                    showToast("Gagal menghapus topik: " + error.message, "error");
                }
            }
        });
    });
    
    // Edit Journal Topic (load into form)
    document.querySelectorAll('.btn-edit-journal').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = btn.getAttribute('data-id');
            try {
                const docSnap = await getDoc(doc(db, "journals", id));
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    editingJournalId = id;
                    
                    document.getElementById('journal-title').value = data.title;
                    document.getElementById('journal-objective').value = data.objective;
                    document.getElementById('journal-order').value = data.order || 1;
                    
                    // Reset steps container and populate
                    const container = document.getElementById('journal-steps-container');
                    container.innerHTML = '';
                    if (data.steps && data.steps.length > 0) {
                        data.steps.forEach(step => {
                            addStepInputRow(step);
                        });
                    }
                    
                    document.getElementById('btn-cancel-journal-edit').classList.remove('hidden');
                    document.getElementById('btn-save-journal').innerHTML = `<i class="fa-solid fa-save"></i> Perbarui Jurnal`;
                    showToast("Memuat topik jurnal untuk diedit.", "success");
                }
            } catch (error) {
                showToast("Gagal memuat detail jurnal: " + error.message, "error");
            }
        });
    });
}

// Save/Update Journal Form Submit
document.getElementById('journal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('journal-title').value.trim();
    const objective = document.getElementById('journal-objective').value.trim();
    const order = parseInt(document.getElementById('journal-order').value) || 1;
    
    // Collect all steps
    const steps = [];
    document.querySelectorAll('.journal-step-input').forEach(input => {
        const val = input.value.trim();
        if (val) steps.push(val);
    });
    
    const journalData = { title, objective, order, steps };
    
    try {
        if (editingJournalId) {
            await setDoc(doc(db, "journals", editingJournalId), journalData, { merge: true });
            showToast("Topik jurnal berhasil diperbarui.", "success");
        } else {
            await addDoc(collection(db, "journals"), journalData);
            showToast("Topik jurnal baru berhasil disimpan.", "success");
        }
        
        resetForms();
        await renderJournalsList();
    } catch (error) {
        showToast("Gagal menyimpan topik jurnal: " + error.message, "error");
    }
});

// Cancel Journal Edit
document.getElementById('btn-cancel-journal-edit').addEventListener('click', () => {
    resetForms();
    document.getElementById('btn-save-journal').innerHTML = `<i class="fa-solid fa-save"></i> Simpan Jurnal`;
});

// ==========================================
// 4. CHATBOT CONFIG PANEL CONTROLLER
// ==========================================
async function loadChatbotPage() {
    try {
        const docRef = doc(db, "configs", "heralyze");
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            document.getElementById('chatbot-system-prompt').value = docSnap.data().system_prompt;
        } else {
            document.getElementById('chatbot-system-prompt').value = "Kamu adalah Heralyze, seorang sahabat atau teman dekat tempat bercerita yang ramah...";
        }
    } catch (error) {
        showToast("Gagal mengambil konfigurasi AI: " + error.message, "error");
    }
}

document.getElementById('chatbot-config-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const system_prompt = document.getElementById('chatbot-system-prompt').value.trim();
    
    try {
        await setDoc(doc(db, "configs", "heralyze"), { system_prompt }, { merge: true });
        showToast("Konfigurasi AI Heralyze berhasil diperbarui.", "success");
    } catch (error) {
        showToast("Gagal memperbarui konfigurasi AI: " + error.message, "error");
    }
});

// ==========================================
// 5. USERS PANEL CONTROLLER
// ==========================================
async function loadUsersPage() {
    const listEl = document.getElementById('users-list');
    listEl.innerHTML = `<tr><td colspan="5" class="text-center">Memuat daftar pengguna...</td></tr>`;
    
    try {
        const usersSnap = await getDocs(collection(db, "users"));
        
        if (usersSnap.empty) {
            listEl.innerHTML = `<tr><td colspan="5" class="text-center text-muted">Belum ada user yang terdaftar.</td></tr>`;
            return;
        }
        
        listEl.innerHTML = '';
        usersSnap.forEach(docSnap => {
            const user = docSnap.data();
            const id = docSnap.id;
            
            // Format CreatedAt timestamp
            let registerDate = "-";
            if (user.createdAt) {
                const date = user.createdAt.toDate ? user.createdAt.toDate() : new Date(user.createdAt);
                registerDate = date.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
            }
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${user.name || '-'}</strong></td>
                <td>${user.email || '-'}</td>
                <td>
                    <span class="badge ${user.role === 'admin' ? 'badge-success' : 'text-muted bg-emerald-light'}" style="background-color: ${user.role === 'admin' ? '' : '#f1f5f9'}; color: ${user.role === 'admin' ? '' : '#64748b'}">
                        ${user.role || 'user'}
                    </span>
                </td>
                <td>${registerDate}</td>
                <td>
                    <button class="btn btn-edit btn-action-small btn-toggle-role" data-id="${id}" data-role="${user.role}">
                        <i class="fa-solid fa-user-shield"></i> Ubah Peran
                    </button>
                </td>
            `;
            listEl.appendChild(tr);
        });
        
        bindUsersEvents();
    } catch (error) {
        showToast("Gagal memuat pengguna: " + error.message, "error");
    }
}

function bindUsersEvents() {
    // Toggle User Role
    document.querySelectorAll('.btn-toggle-role').forEach(btn => {
        btn.addEventListener('click', async () => {
            const uid = btn.getAttribute('data-id');
            const currentRole = btn.getAttribute('data-role');
            const newRole = currentRole === 'admin' ? 'user' : 'admin';
            
            // Protection: Prevent admin from demoting themselves
            if (uid === auth.currentUser.uid && currentRole === 'admin') {
                showToast("Gagal: Anda tidak dapat menurunkan peran administrator Anda sendiri.", "error");
                return;
            }
            
            if (confirm(`Apakah Anda yakin ingin mengubah peran pengguna ini menjadi ${newRole.toUpperCase()}?`)) {
                try {
                    await updateDoc(doc(db, "users", uid), { role: newRole });
                    showToast("Peran pengguna berhasil diubah menjadi " + newRole, "success");
                    await loadUsersPage();
                    await loadDashboardData();
                } catch (error) {
                    showToast("Gagal mengubah peran: " + error.message, "error");
                }
            }
        });
    });
}

// Category selection change listener — update label hint
const articleCategorySelect = document.getElementById('article-category');
if (articleCategorySelect) {
    articleCategorySelect.addEventListener('change', (e) => {
        // Both categories use image URL, just update helper text
        const cat = e.target.value;
        const urlHelper = document.getElementById('article-media-url-helper');
        if (cat === 'makanan') {
            urlHelper.textContent = 'Paste link gambar makanan dari Google Drive, Imgur, dsb.';
        } else if (cat === 'tips') {
            urlHelper.textContent = 'Paste link gambar tips kesehatan dari Google Drive, Imgur, dsb.';
        }
        // Also update preview when category changes
        updateMediaPreview();
    });
}

// Live URL Preview
const mediaUrlInput = document.getElementById('article-media-url');
let previewDebounce = null;

function updateMediaPreview() {
    const previewBox = document.getElementById('media-url-preview');
    const url = document.getElementById('article-media-url').value.trim();

    if (!url) {
        previewBox.classList.add('hidden');
        previewBox.innerHTML = '';
        return;
    }

    previewBox.classList.remove('hidden');
    previewBox.innerHTML = `
        <p class="preview-label">Preview Gambar</p>
        <img src="${url}" alt="preview" onerror="this.outerHTML='<p class=\\'preview-error\\'><i class=\\'fa-solid fa-triangle-exclamation\\'></i> Gambar tidak bisa dimuat. Pastikan URL-nya langsung mengarah ke file gambar.</p>'">
    `;
}

if (mediaUrlInput) {
    mediaUrlInput.addEventListener('input', () => {
        clearTimeout(previewDebounce);
        previewDebounce = setTimeout(updateMediaPreview, 600);
    });
    mediaUrlInput.addEventListener('paste', () => {
        clearTimeout(previewDebounce);
        previewDebounce = setTimeout(updateMediaPreview, 300);
    });
}
// ==========================================
// 6. ARTICLES PANEL CONTROLLER
// ==========================================
async function loadArticlesPage() {
    resetForms();
    await renderArticlesTable();
}

async function renderArticlesTable() {
    const listEl = document.getElementById('articles-list');
    listEl.innerHTML = `<tr><td colspan="4" class="text-center">Memuat data artikel...</td></tr>`;
    
    try {
        const articlesQuery = query(collection(db, "articles"), orderBy("createdAt", "desc"));
        const querySnap = await getDocs(articlesQuery);
        
        if (querySnap.empty) {
            listEl.innerHTML = `<tr><td colspan="4" class="text-center text-muted">Belum ada data artikel.</td></tr>`;
            return;
        }
        
        listEl.innerHTML = '';
        querySnap.forEach(docSnap => {
            const article = docSnap.data();
            const id = docSnap.id;
            
            const tr = document.createElement('tr');
            
            let mediaPreviewHtml = `<img src="${article.mediaUrl}" class="media-preview-img" alt="preview">`;
            
            tr.innerHTML = `
                <td>
                    <div style="font-weight: 600;">${article.title}</div>
                    <div class="text-muted" style="font-size: 12px; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${article.description || ''}
                    </div>
                </td>
                <td>
                    <span class="badge ${article.category === 'makanan' ? 'bg-emerald-light text-emerald' : 'bg-indigo-light text-indigo'}">
                        ${article.category.charAt(0).toUpperCase() + article.category.slice(1)}
                    </span>
                </td>
                <td>${mediaPreviewHtml}</td>
                <td>
                    <div class="table-actions">
                        <button class="btn btn-edit btn-action-small btn-edit-article" data-id="${id}">
                            <i class="fa-solid fa-pencil"></i>
                        </button>
                        <button class="btn btn-danger btn-action-small btn-delete-article" data-id="${id}">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>
            `;
            listEl.appendChild(tr);
        });
        
        bindArticlesTableEvents();
    } catch (error) {
        console.error(error);
        showToast("Gagal memuat daftar artikel: " + error.message, "error");
    }
}

function bindArticlesTableEvents() {
    // Edit Article
    document.querySelectorAll('.btn-edit-article').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            try {
                const docSnap = await getDoc(doc(db, "articles", id));
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    editingArticleId = id;
                    currentArticleMediaUrl = data.mediaUrl;
                    
                    document.getElementById('article-title').value = data.title;
                    document.getElementById('article-category').value = data.category;
                    document.getElementById('article-content').value = data.description;
                    document.getElementById('article-media-url').value = data.mediaUrl || '';
                    
                    // Dispatch change event to update label hints
                    document.getElementById('article-category').dispatchEvent(new Event('change'));
                    
                    document.getElementById('btn-cancel-article-edit').classList.remove('hidden');
                    document.getElementById('btn-save-article').innerHTML = `<i class="fa-solid fa-save"></i> Perbarui Artikel`;
                    
                    showToast("Memuat artikel untuk diedit.", "success");
                }
            } catch (error) {
                console.error(error);
                showToast("Gagal memuat detail artikel: " + error.message, "error");
            }
        });
    });

    // Delete Article
    document.querySelectorAll('.btn-delete-article').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            if (confirm("Apakah Anda yakin ingin menghapus artikel ini?")) {
                try {
                    await deleteDoc(doc(db, "articles", id));
                    showToast("Artikel berhasil dihapus.", "success");
                    await renderArticlesTable();
                    await loadDashboardData();
                } catch (error) {
                    console.error(error);
                    showToast("Gagal menghapus artikel: " + error.message, "error");
                }
            }
        });
    });
}

// Article Form Submit
document.getElementById('article-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const title = document.getElementById('article-title').value.trim();
    const category = document.getElementById('article-category').value;
    const description = document.getElementById('article-content').value.trim();
    const mediaUrl = document.getElementById('article-media-url').value.trim();
    
    if (!mediaUrl) {
        showToast("Silakan masukkan URL media.", "error");
        return;
    }
    
    const btnSave = document.getElementById('btn-save-article');
    btnSave.disabled = true;
    btnSave.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...`;
    
    try {
        const articleData = {
            title,
            category,
            description,
            mediaUrl,
            createdAt: new Date().toISOString()
        };
        
        if (editingArticleId) {
            await setDoc(doc(db, "articles", editingArticleId), articleData, { merge: true });
            showToast("Artikel berhasil diperbarui.", "success");
        } else {
            await addDoc(collection(db, "articles"), articleData);
            showToast("Artikel baru berhasil ditambahkan.", "success");
        }
        
        resetForms();
        await renderArticlesTable();
        await loadDashboardData();
    } catch (error) {
        console.error(error);
        showToast("Gagal menyimpan artikel: " + error.message, "error");
    } finally {
        btnSave.disabled = false;
        btnSave.innerHTML = editingArticleId ? `<i class="fa-solid fa-save"></i> Perbarui Artikel` : `<i class="fa-solid fa-save"></i> Simpan Artikel`;
    }
});

// Cancel Article Edit
document.getElementById('btn-cancel-article-edit').addEventListener('click', () => {
    resetForms();
});

