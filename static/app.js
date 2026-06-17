// --- API Base URL ---
const API_URL = ""; // Empty string runs requests against the current host (same-origin), avoiding CORS

// --- App State ---
const state = {
    token: localStorage.getItem("token") || null,
    user: null,
    tickets: [],
    activeTicket: null,
    admins: [] // Populated from reports
};

// --- DOM Elements ---
const el = {
    // Auth Views
    authView: document.getElementById("auth-view"),
    tabLoginBtn: document.getElementById("tab-login-btn"),
    tabRegisterBtn: document.getElementById("tab-register-btn"),
    loginForm: document.getElementById("login-form"),
    registerForm: document.getElementById("register-form"),
    loginError: document.getElementById("login-error"),
    registerError: document.getElementById("register-error"),
    registerSuccess: document.getElementById("register-success"),
    
    // Header status
    userStatusContainer: document.getElementById("user-status-container"),
    headerUserName: document.getElementById("header-user-name"),
    headerUserRole: document.getElementById("header-user-role"),
    logoutBtn: document.getElementById("logout-btn"),
    
    // Dashboards
    customerView: document.getElementById("customer-view"),
    adminView: document.getElementById("admin-view"),
    
    // Customer Elements
    raiseTicketForm: document.getElementById("raise-ticket-form"),
    customerTicketsContainer: document.getElementById("customer-tickets-container"),
    customerTicketCount: document.getElementById("customer-ticket-count"),
    
    // Admin Elements
    adminTicketsContainer: document.getElementById("admin-tickets-container"),
    adminTicketCount: document.getElementById("admin-ticket-count"),
    agentWorkloadContainer: document.getElementById("agent-workload-container"),
    filterStatus: document.getElementById("filter-status"),
    filterPriority: document.getElementById("filter-priority"),
    filterAssignee: document.getElementById("filter-assignee"),
    
    // Stats
    statTotal: document.getElementById("stat-total"),
    statInProgress: document.getElementById("stat-in-progress"),
    statResolved: document.getElementById("stat-resolved"),
    statUnassigned: document.getElementById("stat-unassigned"),
    
    // Modal Details
    ticketModal: document.getElementById("ticket-modal"),
    modalCloseBtn: document.getElementById("modal-close-btn"),
    modalTicketId: document.getElementById("modal-ticket-id"),
    modalTicketTitle: document.getElementById("modal-ticket-title"),
    modalTicketDesc: document.getElementById("modal-ticket-desc"),
    modalCommentsThread: document.getElementById("modal-comments-thread"),
    commentForm: document.getElementById("comment-form"),
    commentMessage: document.getElementById("comment-message"),
    modalPriorityContainer: document.getElementById("modal-priority-container"),
    modalStatusContainer: document.getElementById("modal-status-container"),
    modalCustomerName: document.getElementById("modal-customer-name"),
    modalCustomerEmail: document.getElementById("modal-customer-email"),
    modalAssigneeContainer: document.getElementById("modal-assignee-container"),
    modalCreatedAt: document.getElementById("modal-created-at")
};

// --- Initialization ---
document.addEventListener("DOMContentLoaded", () => {
    setupAuthTabSwitching();
    setupForms();
    setupModalClose();
    
    if (state.token) {
        fetchProfile();
    } else {
        showPanel("auth");
    }
});

// --- View Switching ---
function showPanel(panelName) {
    // Hide all panels
    document.querySelectorAll(".view-panel").forEach(panel => {
        panel.classList.remove("active");
    });
    
    // Show request panel
    if (panelName === "auth") {
        el.authView.classList.add("active");
        el.userStatusContainer.style.display = "none";
    } else if (panelName === "customer") {
        el.customerView.classList.add("active");
        el.userStatusContainer.style.display = "flex";
        loadCustomerTickets();
    } else if (panelName === "admin") {
        el.adminView.classList.add("active");
        el.userStatusContainer.style.display = "flex";
        setupAdminFilters();
        loadAdminDashboard();
    }
}

// --- Auth Operations ---
function setupAuthTabSwitching() {
    el.tabLoginBtn.addEventListener("click", () => {
        el.tabLoginBtn.classList.add("active");
        el.tabRegisterBtn.classList.remove("active");
        el.loginForm.classList.add("active");
        el.registerForm.classList.remove("active");
        el.registerSuccess.style.display = "none";
        el.registerError.style.display = "none";
    });
    
    el.tabRegisterBtn.addEventListener("click", () => {
        el.tabRegisterBtn.classList.add("active");
        el.tabLoginBtn.classList.remove("active");
        el.registerForm.classList.add("active");
        el.loginForm.classList.remove("active");
        el.loginError.style.display = "none";
    });
}

function setupForms() {
    // Login form
    el.loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        el.loginError.style.display = "none";
        
        const email = document.getElementById("login-email").value;
        const password = document.getElementById("login-password").value;
        
        // OAuth2 Password Request expects form-data
        const formData = new FormData();
        formData.append("username", email);
        formData.append("password", password);
        
        try {
            const response = await fetch(`${API_URL}/auth/login`, {
                method: "POST",
                body: formData
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.detail || "Authentication failed. Check credentials.");
            }
            
            // Save Token
            state.token = data.access_token;
            localStorage.setItem("token", data.access_token);
            
            // Fetch Profile
            await fetchProfile();
            
            // Clear inputs
            el.loginForm.reset();
        } catch (err) {
            el.loginError.textContent = err.message;
            el.loginError.style.display = "block";
        }
    });

    // Register Form
    el.registerForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        el.registerError.style.display = "none";
        el.registerSuccess.style.display = "none";
        
        const name = document.getElementById("register-name").value;
        const email = document.getElementById("register-email").value;
        const password = document.getElementById("register-password").value;
        const role = document.querySelector('input[name="register-role"]:checked').value;
        
        try {
            const response = await fetch(`${API_URL}/auth/register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email,
                    password,
                    full_name: name,
                    role
                })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.detail || "Failed to register account.");
            }
            
            el.registerSuccess.textContent = "Registration successful! You can now sign in.";
            el.registerSuccess.style.display = "block";
            el.registerForm.reset();
            
            // Switch to Login tab automatically after a delay
            setTimeout(() => {
                el.tabLoginBtn.click();
                document.getElementById("login-email").value = email;
            }, 1200);
        } catch (err) {
            el.registerError.textContent = err.message;
            el.registerError.style.display = "block";
        }
    });

    // Logout
    el.logoutBtn.addEventListener("click", () => {
        state.token = null;
        state.user = null;
        localStorage.removeItem("token");
        if (ws) {
            try { ws.close(); } catch(e){}
            ws = null;
        }
        showPanel("auth");
    });
}

// Fetch Profile detail
async function fetchProfile() {
    try {
        const response = await fetch(`${API_URL}/auth/me`, {
            headers: getHeaders()
        });
        
        if (!response.ok) {
            throw new Error("Session expired.");
        }
        
        const user = await response.json();
        state.user = user;
        
        // Render user panel details
        el.headerUserName.textContent = user.full_name;
        el.headerUserRole.textContent = user.role;
        el.headerUserRole.className = `role-pill ${user.role}`;
        
        // Setup WebSocket for real-time updates
        setupWebSocket();
        
        // Redirect to panel based on role
        if (user.role === "admin") {
            showPanel("admin");
        } else {
            showPanel("customer");
        }
    } catch (err) {
        state.token = null;
        localStorage.removeItem("token");
        showPanel("auth");
    }
}

function getHeaders() {
    return {
        "Authorization": `Bearer ${state.token}`
    };
}

// --- Customer View Operations ---
async function loadCustomerTickets() {
    try {
        const response = await fetch(`${API_URL}/tickets`, {
            headers: getHeaders()
        });
        
        if (!response.ok) throw new Error("Could not load tickets.");
        
        const tickets = await response.json();
        state.tickets = tickets;
        el.customerTicketCount.textContent = tickets.length;
        
        renderTicketsList(tickets, el.customerTicketsContainer);
    } catch (err) {
        console.error(err);
    }
}

// Submit ticket form
el.raiseTicketForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const title = document.getElementById("ticket-title").value;
    const description = document.getElementById("ticket-description").value;
    const priority = document.getElementById("ticket-priority").value;
    
    try {
        const response = await fetch(`${API_URL}/tickets`, {
            method: "POST",
            headers: {
                ...getHeaders(),
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ title, description, priority })
        });
        
        if (!response.ok) throw new Error("Could not submit ticket.");
        
        el.raiseTicketForm.reset();
        loadCustomerTickets();
    } catch (err) {
        alert(err.message);
    }
});

// Render Ticket list cards
function renderTicketsList(tickets, container) {
    container.innerHTML = "";
    
    if (tickets.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-ticket-simple"></i>
                <p>No support requests found.</p>
            </div>
        `;
        return;
    }
    
    tickets.forEach(ticket => {
        const card = document.createElement("div");
        card.className = "ticket-card";
        card.addEventListener("click", () => openTicketDetail(ticket.id));
        
        const date = new Date(ticket.created_at).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        
        card.innerHTML = `
            <div class="ticket-card-header">
                <div class="ticket-meta-left">
                    <span class="ticket-id">#T-${ticket.id}</span>
                    <h3>${escapeHtml(ticket.title)}</h3>
                </div>
                <span class="badge badge-${ticket.status}">${ticket.status.replace('_', ' ')}</span>
            </div>
            <p>${escapeHtml(ticket.description)}</p>
            <div class="ticket-card-footer">
                <span>Raised: ${date}</span>
                <div class="ticket-badges">
                    <span class="badge badge-${ticket.priority}">${ticket.priority}</span>
                    ${ticket.assigned_user ? `
                        <span class="badge" style="background: rgba(255,255,255,0.04); color: var(--text-secondary);">
                            <i class="fa-solid fa-user-tie"></i> ${escapeHtml(ticket.assigned_user.full_name)}
                        </span>
                    ` : ''}
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

// --- Admin Operations ---
async function loadAdminDashboard() {
    try {
        // Load report aggregates
        const reportResponse = await fetch(`${API_URL}/reports/summary`, {
            headers: getHeaders()
        });
        
        if (reportResponse.ok) {
            const report = await reportResponse.json();
            
            // Populate stats
            el.statTotal.textContent = report.total_tickets;
            el.statInProgress.textContent = report.status_counts.in_progress || 0;
            el.statResolved.textContent = report.status_counts.resolved || 0;
            el.statUnassigned.textContent = report.unassigned_count || 0;
            
            // Load admins from assignments data
            state.admins = report.agent_assignments;
            
            // Render agent distribution list
            renderAgentDistribution(report.agent_assignments, report.total_tickets);
            
            // Populate filter assignee list if empty
            populateAdminDropdowns(report.agent_assignments);
        }
        
        // Load tickets
        loadAdminTickets();
    } catch (err) {
        console.error(err);
    }
}

async function loadAdminTickets() {
    const status = el.filterStatus.value;
    const priority = el.filterPriority.value;
    const assignee = el.filterAssignee.value;
    
    let url = `${API_URL}/tickets?`;
    if (status) url += `status=${status}&`;
    if (priority) url += `priority=${priority}&`;
    if (assignee) url += `assigned_to=${assignee}&`;
    
    try {
        const response = await fetch(url, {
            headers: getHeaders()
        });
        if (!response.ok) throw new Error("Could not load admin tickets.");
        
        const tickets = await response.json();
        el.adminTicketCount.textContent = tickets.length;
        renderTicketsList(tickets, el.adminTicketsContainer);
    } catch (err) {
        console.error(err);
    }
}

function setupAdminFilters() {
    el.filterStatus.onchange = loadAdminTickets;
    el.filterPriority.onchange = loadAdminTickets;
    el.filterAssignee.onchange = loadAdminTickets;
}

function populateAdminDropdowns(agents) {
    // Store cursor selection
    const selectedFilter = el.filterAssignee.value;
    
    // Reset to "All Agents"
    el.filterAssignee.innerHTML = '<option value="">All Agents</option>';
    
    agents.forEach(agent => {
        const opt = document.createElement("option");
        opt.value = agent.agent_id;
        opt.textContent = agent.agent_name;
        if (parseInt(selectedFilter) === agent.agent_id) {
            opt.selected = true;
        }
        el.filterAssignee.appendChild(opt);
    });
}

function renderAgentDistribution(agents, totalCount) {
    el.agentWorkloadContainer.innerHTML = "";
    
    if (agents.length === 0) {
        el.agentWorkloadContainer.innerHTML = '<p class="sub text-muted">No agents registered.</p>';
        return;
    }
    
    agents.forEach(agent => {
        const pct = totalCount > 0 ? (agent.ticket_count / totalCount) * 100 : 0;
        
        const row = document.createElement("div");
        row.className = "agent-bar-row";
        row.innerHTML = `
            <div class="agent-bar-info">
                <span>${escapeHtml(agent.agent_name)}</span>
                <strong>${agent.ticket_count} active</strong>
            </div>
            <div class="agent-bar-bg">
                <div class="agent-bar-fill" style="width: ${pct}%"></div>
            </div>
        `;
        el.agentWorkloadContainer.appendChild(row);
    });
}

// --- Ticket Details Dialog ---
async function openTicketDetail(ticketId) {
    try {
        const response = await fetch(`${API_URL}/tickets/${ticketId}`, {
            headers: getHeaders()
        });
        
        if (!response.ok) throw new Error("Could not fetch details.");
        
        const ticket = await response.json();
        state.activeTicket = ticket;
        
        // Header
        el.modalTicketId.textContent = ticket.id;
        el.modalTicketTitle.textContent = ticket.title;
        el.modalTicketDesc.textContent = ticket.description;
        
        // Metadata Panel
        el.modalCreatedAt.textContent = new Date(ticket.created_at).toLocaleString();
        el.modalCustomerName.textContent = ticket.customer.full_name;
        el.modalCustomerEmail.textContent = ticket.customer.email;
        
        // Priority Pill
        el.modalPriorityContainer.innerHTML = `<span class="badge badge-${ticket.priority}">${ticket.priority}</span>`;
        
        // Status display
        if (state.user.role === "admin") {
            // Dropdown selection for admins
            el.modalStatusContainer.innerHTML = `
                <select id="modal-status-select" style="padding: 6px 12px; font-size:12px;">
                    <option value="open" ${ticket.status === 'open' ? 'selected' : ''}>Open</option>
                    <option value="in_progress" ${ticket.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                    <option value="resolved" ${ticket.status === 'resolved' ? 'selected' : ''}>Resolved</option>
                    <option value="closed" ${ticket.status === 'closed' ? 'selected' : ''}>Closed</option>
                </select>
            `;
            document.getElementById("modal-status-select").onchange = (e) => updateTicketStatus(ticket.id, e.target.value);
        } else {
            // Simple text badge for customers
            el.modalStatusContainer.innerHTML = `<span class="badge badge-${ticket.status}">${ticket.status.replace('_', ' ')}</span>`;
        }
        
        // Assignee Panel
        if (state.user.role === "admin") {
            let options = '<option value="">Unassigned</option>';
            state.admins.forEach(agent => {
                options += `<option value="${agent.agent_id}" ${ticket.assigned_to === agent.agent_id ? 'selected' : ''}>${escapeHtml(agent.agent_name)}</option>`;
            });
            
            el.modalAssigneeContainer.innerHTML = `
                <select id="modal-assignee-select" style="padding: 6px 12px; font-size:12px;">
                    ${options}
                </select>
            `;
            document.getElementById("modal-assignee-select").onchange = (e) => assignTicketAgent(ticket.id, e.target.value);
        } else {
            // Text for customer
            el.modalAssigneeContainer.innerHTML = ticket.assigned_user ? 
                `<strong>${escapeHtml(ticket.assigned_user.full_name)}</strong>` : 
                '<span class="text-muted italic">Waiting to be assigned</span>';
        }
        
        // Discussion comments thread
        renderComments(ticket.comments);
        
        // Show modal
        el.ticketModal.classList.add("active");
    } catch (err) {
        alert(err.message);
    }
}

function renderComments(comments) {
    el.modalCommentsThread.innerHTML = "";
    
    if (comments.length === 0) {
        el.modalCommentsThread.innerHTML = '<p class="sub text-muted italic text-center" style="padding: 20px 0;">No comments in discussion thread yet.</p>';
        return;
    }
    
    comments.forEach(comment => {
        const bubble = document.createElement("div");
        // Apply class depending on commenting user's role
        bubble.className = `comment-bubble ${comment.user.role}`;
        
        const date = new Date(comment.created_at).toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        bubble.innerHTML = `
            <div class="comment-meta">
                <strong>${escapeHtml(comment.user.full_name)} (${comment.user.role.toUpperCase()})</strong>
                <span>${date}</span>
            </div>
            <div>${escapeHtml(comment.message)}</div>
        `;
        el.modalCommentsThread.appendChild(bubble);
    });
    
    // Scroll thread to bottom
    setTimeout(() => {
        el.modalCommentsThread.scrollTop = el.modalCommentsThread.scrollHeight;
    }, 50);
}

// Update ticket status
async function updateTicketStatus(ticketId, newStatus) {
    try {
        const response = await fetch(`${API_URL}/tickets/${ticketId}`, {
            method: "PUT",
            headers: {
                ...getHeaders(),
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ status: newStatus })
        });
        
        if (!response.ok) throw new Error("Could not update status.");
        
        // Reload dashboard & detail view
        loadAdminDashboard();
        openTicketDetail(ticketId);
    } catch (err) {
        alert(err.message);
    }
}

// Assign agent
async function assignTicketAgent(ticketId, agentId) {
    const val = agentId === "" ? null : parseInt(agentId);
    try {
        const response = await fetch(`${API_URL}/tickets/${ticketId}/assign`, {
            method: "PUT",
            headers: {
                ...getHeaders(),
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ assigned_to: val })
        });
        
        if (!response.ok) throw new Error("Could not modify assignment.");
        
        // Reload dashboard & detail view
        loadAdminDashboard();
        openTicketDetail(ticketId);
    } catch (err) {
        alert(err.message);
    }
}

// Submit comments
el.commentForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.activeTicket) return;
    
    const message = el.commentMessage.value.trim();
    if (!message) return;
    
    try {
        const response = await fetch(`${API_URL}/tickets/${state.activeTicket.id}/comments`, {
            method: "POST",
            headers: {
                ...getHeaders(),
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ message })
        });
        
        if (!response.ok) throw new Error("Could not post comment.");
        
        el.commentMessage.value = "";
        
        // Reload detail thread
        const detailResponse = await fetch(`${API_URL}/tickets/${state.activeTicket.id}`, {
            headers: getHeaders()
        });
        if (detailResponse.ok) {
            const ticket = await detailResponse.json();
            state.activeTicket = ticket;
            renderComments(ticket.comments);
        }
    } catch (err) {
        alert(err.message);
    }
});

function setupModalClose() {
    el.modalCloseBtn.onclick = () => {
        el.ticketModal.classList.remove("active");
        state.activeTicket = null;
        
        // Refresh underlying dashboard lists
        if (state.user.role === "admin") {
            loadAdminDashboard();
        } else {
            loadCustomerTickets();
        }
    };
    
    // Close modal on background click
    el.ticketModal.onclick = (e) => {
        if (e.target === el.ticketModal) {
            el.modalCloseBtn.onclick();
        }
    };
}

// --- Helper Utilities ---
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#039;");
}

// --- Real-time WebSockets ---
let ws = null;

function setupWebSocket() {
    if (ws) {
        try {
            ws.close();
        } catch (e) {}
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    console.log(`Connecting to WebSocket at ${wsUrl}`);
    ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleWebSocketMessage(data);
        } catch (err) {
            console.error("Failed to parse WebSocket message", err);
        }
    };

    ws.onclose = () => {
        console.log("WebSocket connection closed. Reconnecting in 5 seconds...");
        setTimeout(setupWebSocket, 5000);
    };

    ws.onerror = (err) => {
        console.error("WebSocket error:", err);
    };
}

function handleWebSocketMessage(data) {
    if (data.type === "new_comment") {
        // If the ticket modal is open for this ticket ID, append the new comment
        if (state.activeTicket && state.activeTicket.id === data.ticket_id) {
            const exists = state.activeTicket.comments.some(c => c.id === data.comment.id);
            if (!exists) {
                state.activeTicket.comments.push(data.comment);
                renderComments(state.activeTicket.comments);
            }
        }

        // Also refresh list/dashboard to show any changes
        if (state.user) {
            if (state.user.role === "admin") {
                loadAdminDashboard();
            } else {
                loadCustomerTickets();
            }
        }
    } else if (data.type === "ticket_updated") {
        // If the ticket modal is open for this ticket ID, refresh details
        if (state.activeTicket && state.activeTicket.id === data.ticket_id) {
            openTicketDetail(data.ticket_id);
        }

        // Refresh list/dashboard
        if (state.user) {
            if (state.user.role === "admin") {
                loadAdminDashboard();
            } else {
                loadCustomerTickets();
            }
        }
    }
}
