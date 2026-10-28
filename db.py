import sqlite3
import json
import os
import shutil
from datetime import datetime

# Serverless (Vercel / Lambda) support: write to /tmp if root is read-only or in VERCEL
if os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
    DB_PATH = os.path.join("/tmp", "tathyoth.db")
    src_db = os.path.join(os.path.dirname(__file__), "tathyoth.db")
    if os.path.exists(src_db) and not os.path.exists(DB_PATH):
        try:
            shutil.copy2(src_db, DB_PATH)
        except Exception:
            pass
else:
    DB_PATH = os.path.join(os.path.dirname(__file__), "tathyoth.db")

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    c = conn.cursor()

    c.execute("""
    CREATE TABLE IF NOT EXISTS queries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        result_id TEXT UNIQUE,
        request_id TEXT,
        core_claim TEXT,
        mode TEXT,
        language TEXT,
        status TEXT,
        response_json TEXT,
        created_at TEXT
    )
    """)

    c.execute("""
    CREATE TABLE IF NOT EXISTS trending (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        coreClaim TEXT NOT NULL,
        status TEXT NOT NULL,
        topic TEXT,
        language TEXT,
        reviewedAt TEXT
    )
    """)

    c.execute("""
    CREATE TABLE IF NOT EXISTS bounties (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        topic TEXT,
        status TEXT,
        difficulty TEXT,
        deadline TEXT,
        eligibility TEXT,
        rewardRules TEXT
    )
    """)

    c.execute("""
    CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT,
        result_id TEXT,
        request_id TEXT,
        created_at TEXT
    )
    """)

    c.execute("""
    CREATE TABLE IF NOT EXISTS challenges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT,
        message TEXT,
        url TEXT,
        result_id TEXT,
        request_id TEXT,
        status TEXT,
        created_at TEXT
    )
    """)

    c.execute("""
    CREATE TABLE IF NOT EXISTS sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT,
        message TEXT,
        url TEXT,
        result_id TEXT,
        request_id TEXT,
        status TEXT,
        created_at TEXT
    )
    """)

    c.execute("SELECT COUNT(*) FROM trending")
    if c.fetchone()[0] == 0:
        seed_trending = [
            ("Will the Rs 500 currency note be banned in 2026?", "false", "Economy", "en", "2026-10-28T10:00:00Z"),
            ("PM Surya Ghar Solar Scheme provides 300 units of free electricity", "supported", "Energy", "en", "2026-10-27T14:20:00Z"),
            ("Supreme Court mandates CCTV cameras in all police stations across India", "supported", "Judiciary", "en", "2026-10-26T12:00:00Z"),
            ("Drinking boiled water cures all internal respiratory viral infections", "false", "Health", "en", "2026-10-25T09:15:00Z"),
            ("Senior citizen railway ticket concession restored for all trains in 2026", "disputed", "Railways", "en", "2026-10-24T18:45:00Z"),
            ("Free rooftop solar yojana requires Rs 25,000 security fee upfront", "false", "Schemes", "en", "2026-10-23T15:30:00Z"),
            ("NASA warns of 3 days of complete global darkness in December", "false", "Astronomy", "en", "2026-10-22T08:00:00Z")
        ]
        c.executemany("INSERT INTO trending (coreClaim, status, topic, language, reviewedAt) VALUES (?, ?, ?, ?, ?)", seed_trending)

    c.execute("SELECT COUNT(*) FROM bounties")
    if c.fetchone()[0] == 0:
        seed_bounties = [
            ("Verify circular regarding Rs 1,500 monthly youth allowance scheme", "Schemes", "open", "Medium", "2026-11-15", "Open to all", "150 points + Gazette citation badge"),
            ("Track original source of viral footage claiming crack on Yamuna Expressway", "Infrastructure", "open", "Hard", "2026-11-05", "Geolocation / video verification", "250 points for primary source footage"),
            ("Audit WhatsApp circular on new GST rate slabs effective November 1st", "Economy", "open", "Easy", "2026-11-10", "Open to all", "100 points for official notification link"),
            ("Fact-check notice claiming direct recruitment in Indian Railways without entrance exam", "Jobs", "open", "Medium", "2026-11-20", "Open to all", "150 points for RRB confirmation/refutation")
        ]
        c.executemany("INSERT INTO bounties (title, topic, status, difficulty, deadline, eligibility, rewardRules) VALUES (?, ?, ?, ?, ?, ?, ?)", seed_bounties)

    conn.commit()
    conn.close()

def get_cached_query(core_claim: str, mode: str):
    conn = get_connection()
    c = conn.cursor()
    c.execute("""
    SELECT response_json FROM queries 
    WHERE LOWER(TRIM(core_claim)) = LOWER(TRIM(?)) AND mode = ?
    ORDER BY id DESC LIMIT 1
    """, (core_claim, mode))
    row = c.fetchone()
    conn.close()
    if row:
        try:
            return json.loads(row["response_json"])
        except:
            return None
    return None

def save_query(result_id: str, request_id: str, claim: str, mode: str, language: str, status: str, full_response: dict):
    conn = get_connection()
    c = conn.cursor()
    now = datetime.utcnow().isoformat() + "Z"
    try:
        c.execute("""
        INSERT INTO queries (result_id, request_id, core_claim, mode, language, status, response_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (result_id, request_id, claim, mode, language, status, json.dumps(full_response), now))
        conn.commit()
    except Exception as e:
        print(f"Error saving query: {e}")
    finally:
        conn.close()

def get_trending(limit: int = 10):
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT coreClaim, status, topic, language, reviewedAt FROM trending ORDER BY id DESC LIMIT ?", (limit,))
    rows = c.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def add_trending_item(claim: str, status: str, topic: str = "General", language: str = "en"):
    conn = get_connection()
    c = conn.cursor()
    now = datetime.utcnow().isoformat() + "Z"
    try:
        c.execute("INSERT INTO trending (coreClaim, status, topic, language, reviewedAt) VALUES (?, ?, ?, ?, ?)", (claim, status, topic, language, now))
        conn.commit()
    except Exception as e:
        print(f"Error adding trending item: {e}")
    finally:
        conn.close()

def get_bounties(limit: int = 10):
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT id, title, topic, status, difficulty, deadline, eligibility, rewardRules FROM bounties ORDER BY id DESC LIMIT ?", (limit,))
    rows = c.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def save_feedback(kind: str, result_id: str, request_id: str):
    conn = get_connection()
    c = conn.cursor()
    now = datetime.utcnow().isoformat() + "Z"
    c.execute("INSERT INTO feedback (kind, result_id, request_id, created_at) VALUES (?, ?, ?, ?)", (kind, result_id, request_id, now))
    conn.commit()
    conn.close()

def save_challenge(kind: str, message: str, url: str, result_id: str, request_id: str):
    conn = get_connection()
    c = conn.cursor()
    now = datetime.utcnow().isoformat() + "Z"
    c.execute("""
    INSERT INTO challenges (kind, message, url, result_id, request_id, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'open', ?)
    """, (kind, message, url, result_id, request_id, now))
    conn.commit()
    conn.close()

def save_source(message: str, url: str, result_id: str, request_id: str):
    conn = get_connection()
    c = conn.cursor()
    now = datetime.utcnow().isoformat() + "Z"
    c.execute("""
    INSERT INTO sources (kind, message, url, result_id, request_id, status, created_at)
    VALUES ('user_submission', ?, ?, ?, ?, 'open', ?)
    """, (message, url, result_id, request_id, now))
    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully.")
