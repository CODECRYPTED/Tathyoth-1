import os
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from typing import Optional, List

from db import (
    init_db,
    get_trending,
    add_trending_item,
    get_bounties,
    save_query,
    get_cached_query,
    save_feedback,
    save_challenge,
    save_source
)
from engine import process_verification_query

# Initialize DB on startup
init_db()

app = FastAPI(
    title="Tathyoth API Gateway",
    description="Fact-checking, claim verification, and evidence evaluation engine.",
    version="1.0.0"
)

# Enable CORS for external frontends or development servers
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Request Models ---

class QueryRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)
    mode: Optional[str] = "verify"
    language: Optional[str] = "auto"
    apiKey: Optional[str] = None

class ApiKeyConfigRequest(BaseModel):
    geminiKey: str

class FeedbackRequest(BaseModel):
    kind: str
    resultId: Optional[str] = None
    requestId: Optional[str] = None

class ChallengeRequest(BaseModel):
    kind: str
    message: str = Field(..., max_length=1500)
    url: Optional[str] = None
    resultId: Optional[str] = None
    requestId: Optional[str] = None

class SourceRequest(BaseModel):
    kind: Optional[str] = "source"
    message: str = Field(..., max_length=1500)
    url: Optional[str] = None
    resultId: Optional[str] = None
    requestId: Optional[str] = None

# --- API Routes ---

@app.get("/health")
@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "Tathyoth Gateway", "version": "1.0.0"}

@app.post("/api/query")
@app.post("/query")
async def handle_query(req: QueryRequest):
    try:
        # Check high-speed cache for identical prior scans
        cached = get_cached_query(req.text, req.mode)
        if cached:
            cached["cached"] = True
            return cached

        result = await process_verification_query(req.text, req.mode, req.language, user_gemini_key=req.apiKey)
        
        # Save query to database
        save_query(
            result_id=result.get("resultId"),
            request_id=result.get("requestId"),
            claim=result.get("coreClaim", req.text),
            mode=req.mode,
            language=req.language,
            status=result.get("status", "unverified"),
            full_response=result
        )

        # Add to recent trending list if mode is verify
        if req.mode == "verify" and result.get("status"):
            add_trending_item(
                claim=result.get("coreClaim", req.text)[:120],
                status=result.get("status", "unverified"),
                topic="General",
                language=req.language
            )

        return result
    except Exception as e:
        print(f"Query processing error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/config/key")
@app.post("/config/key")
def handle_save_key(req: ApiKeyConfigRequest):
    try:
        env_path = os.path.join(os.path.dirname(__file__), ".env")
        lines = []
        if os.path.exists(env_path):
            with open(env_path, "r", encoding="utf-8") as f:
                lines = f.readlines()
        
        found = False
        new_lines = []
        for line in lines:
            if line.startswith("GEMINI_API_KEY="):
                new_lines.append(f"GEMINI_API_KEY={req.geminiKey.strip()}\n")
                found = True
            else:
                new_lines.append(line)
        if not found:
            new_lines.append(f"GEMINI_API_KEY={req.geminiKey.strip()}\n")
            
        with open(env_path, "w", encoding="utf-8") as f:
            f.writelines(new_lines)
    except Exception:
        pass
        
    os.environ["GEMINI_API_KEY"] = req.geminiKey.strip()
    import engine
    engine.GEMINI_API_KEY = req.geminiKey.strip()
    return {"ok": True, "message": "Gemini API key configured successfully."}

@app.get("/api/trending")
@app.get("/trending")
def handle_trending():
    items = get_trending()
    return {"items": items}

@app.get("/api/bounties")
@app.get("/bounties")
def handle_bounties():
    items = get_bounties()
    return {"items": items}

@app.post("/api/feedback")
@app.post("/feedback")
def handle_feedback(req: FeedbackRequest):
    save_feedback(req.kind, req.resultId, req.requestId)
    return {"ok": True, "message": "Feedback recorded."}

@app.post("/api/challenges")
@app.post("/challenges")
def handle_challenges(req: ChallengeRequest):
    save_challenge(req.kind, req.message, req.url, req.resultId, req.requestId)
    return {"ok": True, "message": "Challenge submitted for editorial review."}

@app.post("/api/sources")
@app.post("/sources")
def handle_sources(req: SourceRequest):
    save_source(req.message, req.url, req.resultId, req.requestId)
    return {"ok": True, "message": "Source submitted for editorial review."}

# --- Static Frontend Serving ---

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(ROOT_DIR, "frontend")

static_dir = ROOT_DIR if os.path.exists(os.path.join(ROOT_DIR, "index.html")) else FRONTEND_DIR

if os.path.exists(os.path.join(static_dir, "index.html")):
    # Serve index.html at root
    @app.get("/")
    async def serve_index():
        return FileResponse(os.path.join(static_dir, "index.html"))

    # Mount remaining static assets (styles.css, app.js, etc.)
    app.mount("/", StaticFiles(directory=static_dir), name="static")

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    print(f"Starting Tathyoth Production Gateway on http://localhost:{port}...")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
