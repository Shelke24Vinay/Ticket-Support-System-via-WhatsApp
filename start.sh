#!/bin/bash
set -o errexit  # exit if any command fails

# Step 1: Set API_URL dynamically to use the Render-assigned port for local communication
export API_URL=http://127.0.0.1:$PORT

# Step 2: Start the Node.js bot in a subshell in the background
(cd whatsapp_bot && npm start) &

# Step 3: Start the FastAPI backend from the root directory
uvicorn app.main:app --host 0.0.0.0 --port $PORT

