# Tathyoth (तथ्योथ)
> **"Kisne kaha? Saboot kahan hai?"**  
> *A grounded, human-first claim verification & fact-checking platform for English, Hindi, and Hinglish.*  
> Built by **Crypted Core**.

---

## 🏛️ What Makes Tathyoth a Full-Fledged Product (Not a Demo)

Unlike toy prototypes that only feed a prompt box into a single LLM:
1. **Multi-Source Evidence Gathering:** Queries Google Fact Check Tools API, Wikipedia (English and Hindi), and indexed web references before drawing conclusions.
2. **Multi-LLM Synthesis:** Supports Google Gemini, Anthropic Claude, and OpenAI GPT-4o with strict editorial guardrails that ban robotic "AI slop" (*delve, testament, leverage, seamless, revolutionize*).
3. **Database Persistence:** Real SQLite database tracking live queries, recent trending claims, open community bounties, and user challenge submissions.
4. **Human Skepticism & Humility:** If evidence is thin or contradictory, it honestly states *"Insufficient evidence"* or *"Unverified"* rather than hallucinating answers.
5. **Full-Stack Unified Gateway:** The FastAPI backend serves both the API layer and the static frontend UI seamlessly on port 8000.

---

## 🚀 Quick Start (Running Locally)

Your server is already configured and running on port 8000!

To run it anytime:
```bash
python run.py
```
Then open your browser at:
👉 **[http://localhost:8000](http://localhost:8000)**

---

## 🔑 Adding API Keys (Optional but Powerful)

The platform is designed to work immediately out-of-the-box using the built-in evidence cross-examiner.

To unlock full multi-model AI synthesis and live Google Fact Check API results, open `backend/.env` and add your keys:

```ini
PORT=8000

# Google Gemini (Best for Hindi/Hinglish nuance)
GEMINI_API_KEY=your_gemini_api_key_here

# Anthropic Claude 3.5 Sonnet (Best for deep reasoning & bias audit)
ANTHROPIC_API_KEY=your_claude_api_key_here

# OpenAI GPT-4o (Fast claim decomposition)
OPENAI_API_KEY=your_openai_api_key_here

# Google Fact Check Tools API (IFCN certified reviews)
GOOGLE_FACTCHECK_KEY=your_google_cloud_factcheck_key_here
```

---

## 📂 Project Architecture

```
tathyoth/
├── run.py                 # Single-command launcher for the full product
├── README.md              # Project documentation
├── backend/
│   ├── server.py          # FastAPI server & route handlers
│   ├── engine.py          # Multi-source search & LLM verification engine
│   ├── db.py              # SQLite database & data persistence
│   ├── tathyoth.db        # SQLite database file
│   ├── .env               # Active secret keys
│   └── .env.example       # Template for environment variables
└── frontend/
    ├── index.html         # HTML UI (Human, dark, clean interface)
    ├── styles.css         # Minimalist stylesheet
    └── app.js             # Client controller connected to backend
```

---

## 🌐 Endpoints

- `GET /` — Serves the full web application
- `GET /health` — Health check endpoint
- `POST /api/query` — Fact-checks claims & returns evidence trail
- `GET /api/trending` — Retrieves recently verified claims
- `GET /api/bounties` — Retrieves open community sleuthing tasks
- `POST /api/feedback` — Records user helpfulness ratings
- `POST /api/challenges` — Accepts user disputes and corrections
- `POST /api/sources` — Accepts user-submitted evidence links
