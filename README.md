# Customer Support Ticket Management System (FastAPI + JWT + Supabase)

This is a premium, secure backend API application built with **FastAPI** and **SQLAlchemy** for managing Customer Support Tickets. The database is powered by **Supabase** (or local SQLite for immediate testing).

## Features

- **JWT Authentication**: Secure endpoints using standard OAuth2 Bearer tokens.
- **Role-Based Access Control (RBAC)**: Supports `customer` and `admin` roles:
  - **Customers** can register, login, view their profile, create tickets, view/update their own tickets (if still open), and post comments to their tickets.
  - **Administrators** can view all tickets, filter tickets by status/priority/assigned agent, assign tickets to agents, modify ticket statuses (`open` -> `in_progress` -> `resolved` -> `closed`), add responses, and access reports.
- **Collaboration Comments Thread**: Customers and Admins can exchange messages on any ticket.
- **Admin Reporting & Analytics**: Dashboard statistics aggregating ticket counts by status, priority, unassigned count, and admin workload distribution.
- **Supabase Integration**: Connects to the Supabase PostgreSQL database natively. Can fall back to SQLite for instant offline local testing.

---

## Technology Stack

- **Core Framework**: FastAPI (Python 3.13+)
- **Database Engine**: SQLAlchemy (ORM) + PostgreSQL (via Supabase)
- **Token Security**: python-jose (JWT validation and creation)
- **Hashing Security**: bcrypt (Modern hash mechanism avoiding deprecated passlib imports)
- **Validation**: Pydantic v2
- **Testing**: httpx + FastAPI TestClient

---

## Project Structure

```
jwt_project/
├── app/
│   ├── __init__.py
│   ├── main.py            # FastAPI entrypoint, middleware, router mounting
│   ├── config.py          # App settings & dotenv environment parser
│   ├── database.py        # SQLAlchemy engine and session dependency
│   ├── models.py          # SQLAlchemy models (User, Ticket, Comment)
│   ├── schemas.py         # Pydantic schemas (Data serialization & verification)
│   ├── auth.py            # Password hashing, JWT token issuer & RBAC dependencies
│   └── routers/
│       ├── __init__.py
│       ├── auth.py        # Authentication routes (/register, /login, /me)
│       ├── tickets.py     # Ticket routes (create, read, update, assign, comment)
│       └── reports.py     # Admin reporting routes (/reports/summary)
├── requirements.txt       # Dependencies
├── .env.template          # Configuration template
├── .env                  # Actively loaded environment configuration
├── verify_app.py          # Programmatic end-to-end integration tests
└── README.md              # Documentation
```

---

## Installation & Setup

### 1. Clone/Navigate to the workspace
Make sure you are in the project folder:
```bash
cd c:\Users\vsinn\Desktop\jwt_project
```

### 2. Setup Virtual Environment & Install Dependencies
Activate the virtual environment and install packages:
```powershell
# Create venv
python -m venv venv

# Activate venv
# On Windows PowerShell:
.\venv\Scripts\Activate.ps1
# On Windows Command Prompt:
.\venv\Scripts\activate.bat

# Install dependencies
pip install -r requirements.txt
```

### 3. Database Configuration (Supabase or SQLite)
By default, the project runs out of the box using **SQLite** (`sqlite:///./tickets.db`) so you can run tests and inspect features instantly.

To connect to your **Supabase** Database:
1. Log in to your [Supabase Dashboard](https://supabase.com/).
2. Select your project, then go to **Project Settings** -> **Database**.
3. Under **Connection string**, select the **URI** tab. Copy the connection string.
   - *Tip: Use the Transaction connection pooler (usually port 6543) for best performance, e.g. `postgresql://postgres.[REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true`*
4. Open your `.env` file in the project root:
   ```env
   DATABASE_URL=your-supabase-connection-string-here
   JWT_SECRET_KEY=use-a-strong-random-hex-string
   JWT_ALGORITHM=HS256
   ACCESS_TOKEN_EXPIRE_MINUTES=60
   ```
5. Save the file. When you restart the application, the tables will automatically be created in your Supabase schema!

---

## Running the Application

Start the local development server:
```bash
uvicorn app.main:app --reload
```
The server will start at `http://127.0.0.1:8000`.

### Interactive API Documentation
Once running, open your browser and navigate to:
- **Swagger UI**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs) (Allows you to log in, test and run all requests interactively in the browser!)
- **ReDoc**: [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)

---

## Running E2E Verification Tests

We have created an automated verification suite that runs a full lifecycle simulation (creating customers/admins, logging in, posting tickets, trying unauthorized edits, adding comments, assigning, resolving, and pulling metrics reports).

To run the verification suite:
```bash
python verify_app.py
```

---

## API Documentation Map

### 1. Authentication (`/auth`)
- `POST /auth/register`: Register a new user.
  - Body: `{"email": "...", "password": "...", "full_name": "...", "role": "customer" | "admin"}`
- `POST /auth/login`: Authenticate credentials (OAuth2 Form compatible).
  - Body: Form fields `username` and `password`
  - Returns: `{"access_token": "...", "token_type": "bearer"}`
- `GET /auth/me`: Fetch profile of the logged-in user.
  - Headers: `Authorization: Bearer <TOKEN>`

### 2. Tickets (`/tickets`)
- `POST /tickets`: Create a new ticket.
  - Body: `{"title": "...", "description": "...", "priority": "low" | "medium" | "high"}`
- `GET /tickets`: View ticket list (Customers see their own; Admins see all).
  - Query Parameters (Filters): `status`, `priority`, `assigned_to`
- `GET /tickets/{ticket_id}`: View ticket details and comments thread.
- `PUT /tickets/{ticket_id}`: Update a ticket.
  - Customer can only edit title/description/priority of their own *open* tickets.
  - Admin can update any field (including status `in_progress`, `resolved`, `closed`).
- `PUT /tickets/{ticket_id}/assign`: Assign ticket to an admin (Admin only).
  - Body: `{"assigned_to": <ADMIN_ID>}`
- `POST /tickets/{ticket_id}/comments`: Post comment on a ticket.
  - Body: `{"message": "..."}`

### 3. Reports & Analytics (`/reports`)
- `GET /reports/summary`: Fetch metrics reporting panel (Admin only).
  - Returns: Total tickets count, status counts, priority counts, unassigned tickets, and assignment counts for all admins.
