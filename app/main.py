from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import engine, Base
from .routers import auth, tickets, reports

# Automatically create tables (useful for SQLite out-of-the-box running and simple Supabase setups)
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Customer Support Ticket Management System",
    description="A FastAPI-based application with JWT authentication for managing customer support tickets.",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse

# Mount Routers
app.include_router(auth.router)
app.include_router(tickets.router)
app.include_router(reports.router)

# Mount Static Files directory (to serve frontend)
# Ensure the 'static' directory exists
import os
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

from fastapi import WebSocket, WebSocketDisconnect
from .websocket import manager

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)

@app.get("/")
def read_root():
    return RedirectResponse(url="/static/index.html")

@app.get("/api/health")
def read_health():
    return {
        "message": "Welcome to the Customer Support Ticket Management API",
        "documentation": "/docs",
        "status": "healthy"
    }

