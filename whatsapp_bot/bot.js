const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

// Load API URL
const API_URL = process.env.API_URL || 'http://127.0.0.1:8000';
const MAPPINGS_FILE = path.join(__dirname, 'mappings.json');

// Initialize user mappings store (persists phone number to JWT session mapping)
let userMappings = {};
if (fs.existsSync(MAPPINGS_FILE)) {
    try {
        userMappings = JSON.parse(fs.readFileSync(MAPPINGS_FILE, 'utf-8'));
    } catch (e) {
        console.error('Error loading mappings.json', e);
    }
}

function saveMappings() {
    fs.writeFileSync(MAPPINGS_FILE, JSON.stringify(userMappings, null, 2), 'utf-8');
}

// Conversation states per user JID
const sessions = {};

// Helper: send text message
async function sendMessage(sock, jid, text) {
    await sock.sendMessage(jid, { text: text });
}

let globalSock = null;
let ws = null;

function setupWebSocket() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        console.log('Backend WebSocket is already open or connecting. Skipping duplicate setup.');
        return;
    }

    if (ws) {
        try {
            ws.close();
        } catch (e) {}
    }

    // Convert API_URL to ws:// or wss://
    let wsUrl = API_URL.replace(/^http/, 'ws');
    if (!wsUrl.endsWith('/ws')) {
        wsUrl = wsUrl + '/ws';
    }

    console.log(`Connecting to Backend WebSocket at ${wsUrl}...`);
    ws = new WebSocket(wsUrl);

    ws.on('open', () => {
        console.log('Connected to Backend WebSocket.');
    });

    ws.on('message', async (data) => {
        try {
            const event = JSON.parse(data.toString());
            await handleWebSocketEvent(event);
        } catch (err) {
            console.error('Error handling WebSocket message:', err);
        }
    });

    ws.on('close', () => {
        console.log('Backend WebSocket closed. Reconnecting in 5 seconds...');
        setTimeout(setupWebSocket, 5000);
    });

    ws.on('error', (err) => {
        console.error('Backend WebSocket error:', err.message);
    });
}

function findJidByCustomerId(customerId) {
    for (const [jid, mapping] of Object.entries(userMappings)) {
        if (mapping && mapping.id === customerId) {
            return jid;
        }
    }
    return null;
}

async function handleWebSocketEvent(event) {
    if (!globalSock) {
        console.log('WebSocket event received but globalSock is not ready.');
        return;
    }

    if (event.type === 'new_comment') {
        const ticket = event.ticket;
        const comment = event.comment;

        // Only notify customer on WhatsApp if comment is created by an admin
        if (comment.user.role === 'admin') {
            const customerJid = findJidByCustomerId(ticket.customer_id);
            if (customerJid) {
                const text = `💬 *New Message from Admin (${comment.user.full_name}):*\n\n${comment.message}\n\n_To reply, use the comment menu (option 3) or visit the portal._`;
                try {
                    await sendMessage(globalSock, customerJid, text);
                    console.log(`Relayed admin comment to customer JID: ${customerJid}`);
                } catch (err) {
                    console.error(`Error sending WhatsApp message to ${customerJid}:`, err);
                }
            }
        }
    } else if (event.type === 'ticket_updated') {
        const ticket = event.ticket;
        const customerJid = findJidByCustomerId(ticket.customer_id);
        if (customerJid) {
            const text = `🎫 *Ticket Update (#T-${ticket.id}):*\n\nTitle: *${ticket.title}*\nStatus: *${ticket.status.toUpperCase().replace('_', ' ')}*\nPriority: *${ticket.priority.toUpperCase()}*\n\n_Use MENU (option 2) to view all details._`;
            try {
                await sendMessage(globalSock, customerJid, text);
                console.log(`Relayed ticket update to customer JID: ${customerJid}`);
            } catch (err) {
                console.error(`Error sending WhatsApp message to ${customerJid}:`, err);
            }
        }
    }
}

let isConnecting = false;

// Main socket connection
async function connectToWhatsApp() {
    if (isConnecting) {
        console.log('connectToWhatsApp is already in progress. Skipping duplicate execution.');
        return;
    }
    isConnecting = true;

    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    // Dynamically fetch latest WhatsApp Web version to prevent 405 Method Not Allowed failures
    let version = [2, 3000, 1017855000]; // Modern fallback version
    try {
        const { version: latestVersion } = await fetchLatestBaileysVersion();
        version = latestVersion;
        console.log(`Fetched latest WhatsApp Web protocol version: ${version.join('.')}`);
    } catch (err) {
        console.log('Error fetching latest Baileys version, using default fallback.');
    }

    const sock = makeWASocket({
        version: version,
        auth: state,
        logger: pino({ level: 'silent' }), // Suppress verbose logs
        printQRInTerminal: false
    });
    globalSock = sock;

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('\n============================================================');
            console.log('SCAN QR CODE WITH WHATSAPP TO LOG IN');
            console.log('============================================================\n');
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === 'close') {
            console.log('Disconnect error details:', lastDisconnect?.error);
            
            const error = lastDisconnect?.error;
            const errorStr = error ? String(error.stack || error.message || error) : '';
            const errorDataStr = error?.data ? JSON.stringify(error.data) : '';
            const statusCode = error?.output?.statusCode;
            
            const isLoggedOut = statusCode === DisconnectReason.loggedOut;
            const isBadMac = errorStr.includes('Bad MAC') || 
                             errorStr.includes('decryption') || 
                             errorDataStr.includes('Bad MAC') ||
                             errorDataStr.includes('decryption');
            
            console.log('WhatsApp connection closed. Reconnecting:', !isLoggedOut && !isBadMac);
            
            isConnecting = false; // Reset connection flag so we can retry connecting
            
            if (isLoggedOut || isBadMac) {
                console.log('Session has been logged out, is invalid (401), or has corrupted keys (Bad MAC). Clearing auth cache...');
                try {
                    fs.rmSync(path.join(__dirname, 'auth_info_baileys'), { recursive: true, force: true });
                    console.log('Auth cache cleared. Reconnecting to generate fresh QR code in 2 seconds...');
                } catch (e) {
                    console.error('Failed to clear auth cache:', e);
                }
                setTimeout(connectToWhatsApp, 2000);
            } else {
                // Add a small 3-second delay to prevent aggressive loop blocking
                setTimeout(connectToWhatsApp, 3000);
            }
        } else if (connection === 'open') {
            console.log('\n============================================================');
            console.log('WHATSAPP BOT SUCCESSFULLY LOGGED IN & ACTIVE!');
            console.log('============================================================\n');
            isConnecting = false; // Reset connection state upon successful handshake
            setupWebSocket();
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Monitor incoming messages
    sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify') return;
        
        for (const msg of m.messages) {
            if (!msg.message) continue;
            if (msg.key.fromMe) continue; // Skip own messages
            
            const jid = msg.key.remoteJid;
            const text = msg.message.conversation || 
                         msg.message.extendedTextMessage?.text || 
                         '';
            const senderName = msg.pushName || 'User';
            
            try {
                await handleMessage(sock, jid, text, senderName);
            } catch (err) {
                console.error('Error processing message from ' + jid, err);
                await sendMessage(sock, jid, '⚠️ Internal error processing command. Please try again.');
            }
        }
    });
}

// Conversation state processor
async function handleMessage(sock, jid, text, senderName) {
    const normalizedText = text.trim();
    const commandWords = normalizedText.split(/\s+/);
    const primaryCmd = commandWords[0].toUpperCase();

    // Check mapping
    const isBound = userMappings[jid] && userMappings[jid].token;

    // Direct command handlers
    if (primaryCmd === 'RESET' || primaryCmd === 'CANCEL' || primaryCmd === 'EXIT' || primaryCmd === 'QUIT') {
        sessions[jid] = null;
        if (primaryCmd === 'RESET') {
            delete userMappings[jid];
            saveMappings();
            await sendMessage(sock, jid, '🔄 Session mapping removed. You have been logged out.');
        } else if (primaryCmd === 'QUIT') {
            await sendMessage(sock, jid, '🚪 Chat session closed. Reply MENU to return to dashboard.');
        } else {
            await sendMessage(sock, jid, '🔄 Conversational state reset. Send any message to open the main menu.');
        }
        return;
    }

    if (!isBound) {
        // --- AUTHENTICATION FLOWS ---
        
        // 1. Link Existing Account: BIND <email> <password>
        if (primaryCmd === 'BIND') {
            if (commandWords.length < 3) {
                await sendMessage(sock, jid, '❌ Invalid format.\nUsage: BIND <email> <password>');
                return;
            }
            const email = commandWords[1];
            const password = commandWords[2];
            
            await sendMessage(sock, jid, '⏳ Linking with support account...');
            try {
                const formData = new URLSearchParams();
                formData.append('username', email);
                formData.append('password', password);
                
                const loginRes = await axios.post(`${API_URL}/auth/login`, formData, {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                });
                
                const token = loginRes.data.access_token;
                
                // Get customer details
                const profileRes = await axios.get(`${API_URL}/auth/me`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                const profile = profileRes.data;
                if (profile.role !== 'customer') {
                    await sendMessage(sock, jid, '❌ Link denied. Only Customer roles can be linked to WhatsApp bot services.');
                    return;
                }
                
                // Save phone link
                userMappings[jid] = {
                    token: token,
                    email: profile.email,
                    name: profile.full_name,
                    id: profile.id
                };
                saveMappings();
                
                sessions[jid] = null;
                await sendMessage(sock, jid, `✅ Account linked successfully!\nWelcome, ${profile.full_name}.\n\nReply with "MENU" to view support operations.`);
            } catch (err) {
                const errMsg = err.response?.data?.detail || 'Credentials validation failed. Try again.';
                await sendMessage(sock, jid, `❌ Link failed: ${errMsg}`);
            }
            return;
        }
        
        // 2. Create New Account: REGISTER <full name> <email>
        if (primaryCmd === 'REGISTER') {
            if (commandWords.length < 3) {
                await sendMessage(sock, jid, '❌ Invalid format.\nUsage: REGISTER <full_name> <email>\nExample: REGISTER Alice Smith alice@example.com');
                return;
            }
            const email = commandWords[commandWords.length - 1];
            const fullName = commandWords.slice(1, -1).join(' ');
            
            if (!fullName || !email.includes('@')) {
                await sendMessage(sock, jid, '❌ Invalid email or name format.');
                return;
            }
            
            const randomPassword = 'wa_pass_' + Math.floor(1000 + Math.random() * 9000);
            
            await sendMessage(sock, jid, '⏳ Registering support account...');
            try {
                // Register User in FastAPI
                await axios.post(`${API_URL}/auth/register`, {
                    email: email,
                    password: randomPassword,
                    full_name: fullName,
                    role: 'customer'
                });
                
                // Login
                const formData = new URLSearchParams();
                formData.append('username', email);
                formData.append('password', randomPassword);
                
                const loginRes = await axios.post(`${API_URL}/auth/login`, formData, {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                });
                
                const token = loginRes.data.access_token;
                
                // Retrieve Profile ID
                const profileRes = await axios.get(`${API_URL}/auth/me`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                // Save mapping
                userMappings[jid] = {
                    token: token,
                    email: email,
                    name: fullName,
                    id: profileRes.data.id
                };
                saveMappings();
                
                sessions[jid] = null;
                await sendMessage(sock, jid, `✅ Account registered and bound!\n\n📋 *Your Login Credentials:*\nName: ${fullName}\nEmail: ${email}\nPassword: ${randomPassword}\n\nSave this password to log in to the web panel! Reply "MENU" to see option dashboard.`);
            } catch (err) {
                const errMsg = err.response?.data?.detail || 'Account registration failed.';
                await sendMessage(sock, jid, `❌ Sign up failed: ${errMsg}`);
            }
            return;
        }

        // Welcome greeting instruction
        await sendMessage(sock, jid, `👋 Hello! Welcome to the Customer Support Ticket Bot.\n\nTo raise and track tickets, please link your phone number. Reply with one of these commands:\n\n1️⃣ *BIND <email> <password>*\n(If you have an existing web portal account)\n\n2️⃣ *REGISTER <full name> <email>*\n(To create a new customer account)\n\n_Example: REGISTER Alice Smith alice@example.com_`);
        return;
    }

    // --- AUTHENTICATED STATE MENU SYSTEM ---
    const userSession = sessions[jid] || { state: 'MENU' };
    const token = userMappings[jid].token;
    const authHeader = { 'Authorization': `Bearer ${token}` };

    if (userSession.state === 'MENU') {
        if (normalizedText === '1') {
            sessions[jid] = { state: 'TICKET_TITLE' };
            await sendMessage(sock, jid, '📝 Please enter the *Title* for your support ticket:\n(Reply CANCEL to abort)');
        } else if (normalizedText === '2') {
            await sendMessage(sock, jid, '⏳ Loading active tickets...');
            try {
                const response = await axios.get(`${API_URL}/tickets`, { headers: authHeader });
                const tickets = response.data;
                
                if (tickets.length === 0) {
                    await sendMessage(sock, jid, '🎫 You do not have any active support tickets.');
                } else {
                    let text = '🎫 *Your Support Requests:*\n\n';
                    tickets.forEach(t => {
                        text += `*#T-${t.id} - ${t.title}*\n`;
                        text += `Status: ${t.status.toUpperCase().replace('_', ' ')}\n`;
                        text += `Priority: ${t.priority.toUpperCase()}\n`;
                        if (t.assigned_user) text += `Assigned: ${t.assigned_user.full_name}\n`;
                        text += `------------------------\n`;
                    });
                    text += '\nReply MENU to return.';
                    await sendMessage(sock, jid, text);
                }
            } catch (err) {
                await sendMessage(sock, jid, '❌ Failed to load tickets. Token may have expired. Reply RESET to log in again.');
            }
        } else if (normalizedText === '3') {
            sessions[jid] = { state: 'COMMENT_TICKET_ID' };
            await sendMessage(sock, jid, '💬 Enter the **Ticket ID** you want to comment on (e.g. 1):\n(Reply CANCEL to abort)');
        } else {
            // General Menu
            await sendMessage(sock, jid, `📋 *Service Desk (Account: ${userMappings[jid].name})*\n\nReply with a number:\n\n1️⃣ Raise a new Support Ticket\n2️⃣ View active support tickets\n3️⃣ Post comment/reply to a ticket\n\n_Type RESET to unlink your phone._`);
        }
        return;
    }

    // --- State: Title input ---
    if (userSession.state === 'TICKET_TITLE') {
        if (normalizedText.length < 3) {
            await sendMessage(sock, jid, '❌ Ticket title must be at least 3 characters. Enter again:');
            return;
        }
        sessions[jid] = {
            state: 'TICKET_DESC',
            title: normalizedText
        };
        await sendMessage(sock, jid, '📄 Enter a detailed *description* of the issue:');
        return;
    }

    // --- State: Description input ---
    if (userSession.state === 'TICKET_DESC') {
        if (normalizedText.length < 5) {
            await sendMessage(sock, jid, '❌ Description must be at least 5 characters. Enter again:');
            return;
        }
        sessions[jid] = {
            state: 'TICKET_PRIORITY',
            title: userSession.title,
            description: normalizedText
        };
        await sendMessage(sock, jid, '⚡ Choose a Priority (Reply with *low*, *medium*, or *high*):');
        return;
    }

    // --- State: Priority input & Submit ---
    if (userSession.state === 'TICKET_PRIORITY') {
        const priority = normalizedText.toLowerCase();
        if (!['low', 'medium', 'high'].includes(priority)) {
            await sendMessage(sock, jid, '❌ Invalid priority. Reply with low, medium, or high:');
            return;
        }
        
        await sendMessage(sock, jid, '⏳ Raising support ticket...');
        try {
            const response = await axios.post(`${API_URL}/tickets`, {
                title: userSession.title,
                description: userSession.description,
                priority: priority
            }, {
                headers: authHeader
            });
            
            const ticket = response.data;
            sessions[jid] = null;
            await sendMessage(sock, jid, `🎉 Ticket successfully raised!\n\n🎫 *Ticket summary:*\nID: #T-${ticket.id}\nTitle: ${ticket.title}\nPriority: ${ticket.priority.toUpperCase()}\nStatus: OPEN\n\nOur administration team has been notified. Reply MENU to see options.`);
        } catch (err) {
            await sendMessage(sock, jid, '❌ Failed to raise ticket. Token may have expired. Reply RESET to log in again.');
        }
        return;
    }

    // --- State: Comment Ticket ID ---
    if (userSession.state === 'COMMENT_TICKET_ID') {
        const ticketId = parseInt(normalizedText);
        if (isNaN(ticketId)) {
            await sendMessage(sock, jid, '❌ Ticket ID must be a numeric value. Enter ID:');
            return;
        }
        sessions[jid] = {
            state: 'CHAT_SESSION',
            ticketId: ticketId
        };
        await sendMessage(sock, jid, `💬 Continuous conversation session opened for Ticket *#T-${ticketId}*.\n\nAll messages you send here will be posted directly to this ticket's chat thread.\n\nType **QUIT** at any time to close the session and return to the main menu.\n\n✍️ Start typing your message:`);
        return;
    }

    // --- State: Continuous Chat Session ---
    if (userSession.state === 'CHAT_SESSION') {
        if (normalizedText.length < 1) {
            await sendMessage(sock, jid, '❌ Message cannot be empty. Type your message:');
            return;
        }
        
        try {
            await axios.post(`${API_URL}/tickets/${userSession.ticketId}/comments`, {
                message: normalizedText
            }, {
                headers: authHeader
            });
            // Intentionally send no confirmation text message to keep conversation view clean and standard.
        } catch (err) {
            const errMsg = err.response?.data?.detail || 'Ticket not found or access denied.';
            await sendMessage(sock, jid, `❌ Failed to send: ${errMsg}`);
        }
        return;
    }
}

// Global exception handlers to catch and resolve fatal "Bad MAC" errors
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    const errStr = String(err.stack || err.message || err);
    if (errStr.includes('Bad MAC') || errStr.includes('decryption')) {
        console.log('Critical decryption failure (Bad MAC) detected globally.');
        clearAuthCacheAndExit();
    }
});

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
    const errStr = String(reason?.stack || reason?.message || reason);
    if (errStr.includes('Bad MAC') || errStr.includes('decryption')) {
        console.log('Critical decryption failure (Bad MAC) detected globally.');
        clearAuthCacheAndExit();
    }
});

function clearAuthCacheAndExit() {
    console.log('Clearing auth cache folder to force a new QR code on restart...');
    try {
        const authPath = path.join(__dirname, 'auth_info_baileys');
        if (fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true });
            console.log('Auth cache folder deleted successfully.');
        }
    } catch (e) {
        console.error('Failed to delete auth cache folder:', e);
    }
    console.log('Exiting process to allow supervisor to restart the service...');
    process.exit(1);
}

// Start bot connection
connectToWhatsApp();
