// Firebase Web SDK Imports via CDN (Native ES Modules)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut 
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

// Retrieve config from global window object
const firebaseConfig = window.firebaseConfig;
if (!firebaseConfig) {
    console.error("Firebase Configuration is missing! Ensure firebase-config.js is loaded first.");
}

// Initialize Firebase services
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Keep track of active edit IDs
let editingQuoteId = null;
let editingJournalId = null;

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
        else if (tab === 'chatbot') loadChatbotPage();
        else if (tab === 'users') loadUsersPage();
    });
});

function updatePageTitles(tab) {
    const titles = {
        dashboard: { title: "Dashboard Overview", subtitle: "Ringkasan status aplikasi Hera saat ini." },
        quotes: { title: "Quotes Harian", subtitle: "Kelola kutipan motivasi harian yang tampil di beranda aplikasi." },
        journals: { title: "Topik Jurnal", subtitle: "Kelola topik, instruksi, dan langkah-langkah latihan relasi diri." },
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
    document.getElementById('quote-form').reset();
    document.getElementById('journal-form').reset();
    document.getElementById('btn-cancel-quote-edit').classList.add('hidden');
    document.getElementById('btn-cancel-journal-edit').classList.add('hidden');
    document.getElementById('journal-steps-container').innerHTML = '';
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
                        <i class="fa-solid fa-user-shield"></i> Ubah Role
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
                } catch (error) {
                    showToast("Gagal mengubah peran: " + error.message, "error");
                }
            }
        });
    });
}
