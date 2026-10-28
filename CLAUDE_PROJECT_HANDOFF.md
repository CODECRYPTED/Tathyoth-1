# Tathyoth - Claude AI Project Handoff Dossier

> **Platform Motto:** *"Kisne kaha, saboot kahan hai?"* (Who said it, where is the evidence?)  
> **Platform Mission:** Human-first, anti-slop, grounded fact-checking & question-answering platform anchored to **October 2026** reality with zero hallucination tolerance.

---

## 1. Project Overview & Context
This is a full-fledged verification platform built with a Python FastAPI backend and a Next-Gen animated frontend.
It solves the **7 Core AI Failure Modes**:
1. **AI Hallucination:** Zero generative invention. Every claim is strictly grounded in live external search snippets (DuckDuckGo Web + DuckDuckGo Instant Answer API + Wikipedia REST API + IFCN registry).
2. **Confidence Illusion:** Dynamically calibrated 0–100% confidence index based on source count, peer-reviewed/IFCN presence, and stance conflict ratio.
3. **Training Data Cutoffs:** All evaluations are anchored to **October 2026** reality with real-time web retrieval.
4. **Retrieval Failures (RAG):** 3-Tier progressive query relaxation + multilingual entity mapping (Hinglish/Hindi to English concepts) to prevent empty search results.
5. **Ambiguous / Viral Prompts:** Pre-processor strips WhatsApp forwarding headers, high-unicode emojis, and noise to isolate the core testable atomic proposition.
6. **Context Drift:** Stateless, atomic query evaluations. Context cannot bleed across sessions.
7. **Reasoning & Logic Limits:** Dedicated fallacy & causal auditor detects correlation vs. causation, fabricated statistics, and anonymous authority appeals ("Doctors say", "NASA warned").

---

## 2. File Structure & Responsibilities

```text
tathyoth/
├── backend/
│   ├── server.py             # FastAPI gateway with CORS, rate-limiting, static asset serving, and REST endpoints:
│   │                         #   POST /api/query       (live verification / QA)
│   │                         #   GET  /api/trending    (clean English trending feed)
│   │                         #   GET  /api/bounties    (community bounty board)
│   │                         #   POST /api/feedback    (helpful / correction / missing context)
│   │                         #   POST /api/challenges  (editorial challenge submission)
│   ├── engine.py             # Grounded Fact & QA Engine:
│   │                         #   - Clean and decompose atomic claim
│   │                         #   - Multi-tier retrieval (DDG HTML + DDG Instant Answer + Wikipedia)
│   │                         #   - Multilingual Hinglish entity expansion
│   │                         #   - Calibrated confidence scoring (0-100%)
│   │                         #   - Fallacy & causal auditor
│   │                         #   - Universal text sanitizer (zero mojibake / corrupted symbols)
│   │                         #   - Gemini Flash 2.5 synthesis with offline grounded fallback
│   ├── db.py                 # SQLite database layer (tathyoth.db) with caching (<30ms repeat scans)
│   └── tathyoth.db           # Persistent SQLite database
├── frontend/
│   ├── index.html            # Next-Gen UI: Live Scanner HUD, Hero Verdict badge, Truth columns, Evidence dossier
│   ├── styles.css            # Poppy animations (@keyframes stampIn, radarSweep), dark theme with neon badges
│   └── app.js                # Vanilla ES6 client: live scanning simulation, dynamic stance filters, Web Speech narration, clipboard export
├── run.py                    # One-command bootstrapper (uvicorn server:app with auto-reload)
├── requirements.txt          # Python dependencies (fastapi, uvicorn, httpx, beautifulsoup4, python-dotenv)
├── Dockerfile                # Production Docker container
├── Procfile                  # Railway / Heroku / Fly.io boot config
└── render.yaml               # 1-Click Render.com deployment blueprint
```

---

## 3. How to Run Locally

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Run the platform
python run.py

# 3. Open in browser
http://localhost:8000/
```

---

## 4. Key Endpoints & Contracts

### `POST /api/query`
**Payload:**
```json
{
  "text": "Can dogs eat grapes?",
  "mode": "comprehensive",
  "language": "auto"
}
```
**Response Format:**
```json
{
  "status": "false",
  "coreClaim": "Can dogs eat grapes?",
  "scope": "Universal",
  "summary": "No. Authoritative veterinary and medical guidance confirms this is hazardous or toxic. Ingestion causes acute kidney failure in dogs.",
  "confidenceScore": 95,
  "confidenceRating": "Very High (Authoritative Consensus)",
  "confidenceExplanation": "Calibrated across 8 examined sources, including 2 high-authority records.",
  "fallacyAudit": {
    "hasFallacy": false,
    "fallacies": [],
    "reasoningIntegrity": "Factual proposition"
  },
  "sources": [ ... ],
  "established": [ ... ],
  "uncertain": [ ... ]
}
```

---

## 5. Next Steps for Claude
1. Continue enhancing UI features or custom dashboards as requested by the user.
2. Deploy the repository to GitHub and connect to Render.com / Vercel.
3. Optionally add Gemini / Anthropic API keys to `.env` for generative synthesis if preferred.
