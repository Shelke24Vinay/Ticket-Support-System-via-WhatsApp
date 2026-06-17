# WhatsApp Ticket raising Bot

This is a companion Node.js service that runs a **WhatsApp Bot** using the `@whiskeysockets/baileys` library. It acts as an interactive client, allowing customers to raise support requests, check active tickets, and add comments to threads directly from WhatsApp.

---

## Prerequisites

- **Node.js** (v16.0.0 or later installed on the system)
- **NPM** (Node Package Manager)

---

## Installation & Setup

### 1. Open a new terminal and navigate to the bot folder
```bash
cd c:\Users\vsinn\Desktop\jwt_project\whatsapp_bot
```

### 2. Install dependencies
Install the required packages from `package.json`:
```bash
npm install
```

### 3. API Configuration
By default, the bot connects to the local backend at `http://127.0.0.1:8000`. 

If your backend is running elsewhere (or deployed), configure it by setting an environment variable before starting or hardcode it in `bot.js`.
* *To run on custom URL: `set API_URL=http://your-backend-ip:8000` (Windows CMD) or `$env:API_URL="http://your-backend-ip:8000"` (PowerShell).*

---

## How to Run

Start the WhatsApp Bot:
```bash
npm start
```

1. **Authentication (QR Code)**: Upon launch, the terminal will print a large matrix **QR code**.
2. **Scan with Phone**:
   - Open WhatsApp on your mobile phone.
   - Go to **Linked Devices** -> **Link a Device**.
   - Scan the QR code displayed in the terminal.
3. Once linked, the terminal will output:
   `WHATSAPP BOT SUCCESSFULLY LOGGED IN & ACTIVE!`

---

## Conversational Bot Workflow

Once the bot is running, anyone can send a WhatsApp message to the bot's phone number to interact with it:

### 1. Link or Register (First-time users)
If the sender's phone number is unrecognized, the bot will welcome them and request to bind an account:
- **Link Existing Customer**: Reply with `BIND <email> <password>`
- **Create Customer**: Reply with `REGISTER <full name> <email>` (e.g. `REGISTER Alice Smith alice@example.com`)
  - *The bot will register them in FastAPI, generate a secure random password, and immediately link their WhatsApp session.*

### 2. Main Dashboard Menu
Once linked, sending any message (or replying `MENU`) triggers the options menu:
```
📋 Service Desk (Account: Alice Smith)

Reply with a number:
1️⃣ Raise a new Support Ticket
2️⃣ View active support tickets
3️⃣ Post comment/reply to a ticket

Type RESET to unlink your phone.
```

### 3. Raising a Ticket
1. Reply with `1`.
2. The bot asks for the **Title** of the ticket.
3. The bot asks for the **Description** of the issue.
4. The bot asks for the **Priority** (`low`, `medium`, or `high`).
5. The bot sends a `POST /tickets` request to the backend using the customer's JWT token, creates the ticket, and returns the ticket summary!

### 4. Direct Chat Control Commands
At any point, a user can message the bot:
- `RESET`: Logs out/unlinks the WhatsApp session and removes all mappings.
- `CANCEL` / `EXIT`: Resets the active conversational path state back to the `MENU` option selection.
