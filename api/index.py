from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.wsgi import WSGIMiddleware
import sys
import os

# Add parent directories to Python path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import the backend main app
from backend.main import app as backend_app

# Create a wrapper app for Vercel
app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount the backend FastAPI app
app.mount("/api", backend_app)

# Health check at root
@app.get("/")
async def root():
    return {"message": "BIS Standard Discovery API - Vercel Deployment", "status": "healthy"}

# Vercel expects this
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
