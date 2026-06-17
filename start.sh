#!/bin/bash
set -o errexit  # exit if any command fails

# Step 1: move into the subfolder
cd whatsapp_bot

# Step 2: start the Node.js bot
npm start &

# Step 3: start the FastAPI backend
# Use $PORT so Render assigns the correct port
uvicorn app.main:app --host 0.0.0.0 --port $PORT
