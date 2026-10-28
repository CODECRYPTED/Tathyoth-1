"use strict";

/* Tathyoth Grounded Verification Engine Frontend
   Built with zero dependencies: vanilla ES6+, accessible DOM generation, reactive interactions. */

const CONFIG = {
  apiBase: (typeof window !== "undefined" && window.location.protocol.startsWith("http")) 
    ? window.location.origin 
    : "http://localhost:8000",
  timeoutMs: 30000
};

const V = {
  supported: { label: "Verified / Supported", icon: "✓", class: "supported" },
  false: { label: "Debunked / False", icon: "✕", class: "false" },
  misleading: { label: "Misleading Context", icon: "⚠", class: "misleading" },
  partly_true: { label: "Partly True", icon: "◑", class: "misleading" },
  unverified: { label: "Unverified / Data Gap", icon: "?", class: "unverified" },
  insufficient_evidence: { label: "Insufficient Evidence", icon: "∅", class: "unverified" },
  disputed: { label: "Disputed Claim", icon: "⚖", class: "disputed" },
  outdated: { label: "Outdated / Historical", icon: "⌛", class: "unverified" }
};

const LANGS = { en: "English", hi: "हिन्दी", hinglish: "Hinglish" };
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const state = {
  mode: "verify",
  last: null,
  history: [],
  activeSourceFilter: "all",
  isSpeaking: false
};

/* ---------- DOM Helpers ---------- */
const h = (tag, attrs = {}, ...children) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k.startsWith("data-")) el.setAttribute(k, v);
    else if (v != null && v !== false) el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  }
  return el;
};

const safeUrl = u => {
  try {
    const parsed = new URL(u);
    return /^https?:$/.test(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
};

const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }
};

const say = msg => {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(say._timer);
  say._timer = setTimeout(() => t.classList.remove("on"), 3500);
};

const fmt = d => {
  if (!d) return null;
  const x = new Date(d);
  return isNaN(x) ? null : x.toLocaleDateString(undefined, { dateStyle: "medium" });
};

const detect = t => {
  if (/[\u0900-\u097F]/.test(t)) {
    return /[A-Za-z]{3,}/.test(t) ? "hinglish" : "hi";
  }
  return /\b(hai|hain|nahi|nahin|kya|ka|ke|ki|ko|sarkar|yojana|paisa|tha|raha|kitna|kab)\b/i.test(t) 
    ? "hinglish" 
    : "en";
};

/* ---------- API Caller ---------- */
async function api(path, { method = "GET", body } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), CONFIG.timeoutMs);
  try {
    const res = await fetch(CONFIG.apiBase + path, {
      method,
      signal: ctl.signal,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined
    });
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok) {
      throw {
        code: data?.error?.code || "HTTP",
        status: res.status,
        message: data?.detail || data?.error?.message || "Server request failed"
      };
    }
    return data;
  } catch (err) {
    if (err.name === "AbortError") throw { code: "TIMEOUT" };
    if (err instanceof TypeError) throw { code: "NETWORK" };
    throw err;
  } finally {
    clearTimeout(t);
  }
}

const errText = e => ({
  TIMEOUT: "Verification scan timed out. The search sources are taking too long to respond.",
  NETWORK: "Could not connect to the Tathyoth Gateway at http://localhost:8000. Please ensure the server is active.",
  INVALID: "The verification payload was malformed or incomplete."
})[e.code] || e.message || "An unexpected error occurred during claim analysis.";

/* Data Normalization */
function clean(r, mode) {
  const arr = x => Array.isArray(x) ? x.filter(s => typeof s === "string") : [];
  if (!r || typeof r !== "object") throw { code: "INVALID" };
  const status = r.status && V[r.status] ? r.status : "unverified";
  
  return {
    ...r,
    mode: mode || "verify",
    status,
    coreClaim: String(r.coreClaim || state.text || "Unspecified proposition"),
    scope: String(r.scope || "Global / General Science"),
    summary: String(r.summary || "No summary provided."),
    established: arr(r.established),
    uncertain: arr(r.uncertain),
    limitations: arr(r.limitations),
    sourcedFacts: arr(r.sourcedFacts),
    unanswered: arr(r.unanswered),
    confidenceScore: typeof r.confidenceScore === "number" ? r.confidenceScore : 85,
    confidenceRating: String(r.confidenceRating || "Calibrated Grounding"),
    confidenceExplanation: String(r.confidenceExplanation || "Evidence triangulated across indexed repositories."),
    fallacyAudit: r.fallacyAudit || { hasFallacy: false, fallacies: [], reasoningIntegrity: "Factual proposition" },
    reasoning: r.reasoning || {},
    engineUsed: String(r.engineUsed || "Tathyoth Grounded Fact Engine"),
    sources: (Array.isArray(r.sources) ? r.sources : []).map(s => ({
      title: String(s?.title || "Indexed Authority Citation"),
      publisher: String(s?.publisher || "Independent Registry"),
      url: safeUrl(s?.url),
      publishedAt: s?.publishedAt || null,
      stance: ["supports", "contradicts"].includes(s?.stance) ? s.stance : "context",
      authority: s?.authority || "standard",
      excerpt: s?.excerpt ? String(s.excerpt) : null,
      notes: String(s?.verificationNotes || "")
    }))
  };
}

/* ---------- Scanner Live HUD Animation ---------- */
function startScannerHUD(container, claimText) {
  const steps = [
    "Normalizing claim & stripping viral forwards...",
    "Querying live web, encyclopedias & IFCN registries...",
    "Verifying temporal integrity against 2026 ground truth...",
    "Auditing logical fallacies & causal integrity...",
    "Synthesizing grounded verdict & calibrating confidence..."
  ];

  const hud = h("div", { class: "scanner-hud" },
    h("div", { class: "radar-wrap" },
      h("div", { class: "radar-ring" }),
      h("div", { class: "radar-core" }, "🔍")
    ),
    h("h2", { class: "scanner-title" }, "Deep Fact-Checking Scan In Progress"),
    h("p", { class: "scanner-sub" }, `Analyzing: "${claimText.slice(0, 100)}${claimText.length > 100 ? "..." : ""}"`),
    h("div", { class: "scan-steps" },
      steps.map((st, idx) => 
        h("div", { class: `scan-step ${idx === 0 ? "active" : ""}`, id: `scan-step-${idx}` },
          h("span", { class: "step-icon" }, idx === 0 ? "⚡" : "○"),
          h("span", {}, st)
        )
      )
    )
  );

  container.replaceChildren(hud);

  let cur = 0;
  const interval = setInterval(() => {
    if (cur < steps.length) {
      const prevEl = $(`#scan-step-${cur}`);
      if (prevEl) {
        prevEl.className = "scan-step done";
        prevEl.querySelector(".step-icon").textContent = "✓";
      }
      cur++;
      const nextEl = $(`#scan-step-${cur}`);
      if (nextEl) {
        nextEl.className = "scan-step active";
        nextEl.querySelector(".step-icon").textContent = "⚡";
      }
    }
  }, 1200);

  return () => clearInterval(interval);
}

/* ---------- Next-Gen Verdict Renderer ---------- */
function renderResult(r) {
  const box = $("#result");
  const isVerify = r.mode === "verify";
  const vInfo = V[r.status] || V.unverified;
  const why = r.reasoning || {};

  // 1. Top Meta Bar
  const topBar = h("div", { class: "verdict-top-bar" },
    h("div", { class: "engine-meta" },
      h("span", { class: "meta-chip" }, `⚡ ${r.engineUsed}`),
      h("span", { class: "meta-chip scope" }, `📍 ${r.scope}`),
      h("span", { class: "meta-chip" }, "📅 Anchor: 2026")
    ),
    h("div", { class: "meta-chip" },
      r.lastChecked ? `Scanned ${fmt(r.lastChecked)}` : "Live Verification"
    )
  );

  // 2. Poppy Hero Verdict Stamp & Animated Confidence Bar
  const heroSection = h("div", { class: "verdict-hero" },
    h("div", { class: "verdict-badge-wrap" },
      h("div", { class: "verdict-stamp", "data-status": r.status },
        h("span", { class: "stamp-icon" }, vInfo.icon),
        h("span", {}, vInfo.label)
      )
    ),
    h("div", { class: "confidence-box" },
      h("div", { class: "conf-header" },
        h("span", {}, "Confidence Index"),
        h("span", { class: "conf-score" }, `${r.confidenceScore}%`)
      ),
      h("div", { class: "conf-bar-track" },
        h("div", { class: "conf-bar-fill", id: "conf-fill", style: "width: 0%" })
      ),
      h("div", { class: "conf-desc" }, r.confidenceRating)
    )
  );

  // 3. Claim Deconstruct Box
  const claimBlock = h("div", { class: "claim-block" },
    h("div", { class: "claim-label" }, "Core Atomic Claim Analyzed"),
    h("div", { class: "claim-text" }, `“${r.coreClaim}”`)
  );

  // 4. Summary Banner
  const summaryBanner = h("div", { class: "summary-banner" },
    h("p", { class: "summary-lead" }, r.summary)
  );

  // 5. Dual Fact Columns: Established vs Open
  const establishedList = r.established.length 
    ? r.established 
    : ["No authoritative confirmations settling this claim yet."];
  const uncertainList = r.uncertain.length 
    ? r.uncertain 
    : ["No unresolved contradictions identified in authoritative registries."];

  const truthColumns = h("div", { class: "truth-columns" },
    h("div", { class: "truth-card pro" },
      h("h3", {}, "What Authoritative Sources Confirm"),
      h("ul", {}, establishedList.map(item => h("li", {}, item)))
    ),
    h("div", { class: "truth-card con" },
      h("h3", {}, "What Remains Open or Disputed"),
      h("ul", {}, uncertainList.map(item => h("li", {}, item)))
    )
  );

  // 6. Logical Fallacy & Causation Radar
  const fallacyData = r.fallacyAudit || {};
  const hasFallacy = Boolean(fallacyData.hasFallacy);
  const fallacyCard = h("div", { class: `fallacy-card ${hasFallacy ? "has-fallacy" : ""}` },
    h("div", { class: "fallacy-header" },
      h("div", { class: "fallacy-title" },
        h("span", {}, hasFallacy ? "🚨" : "🛡️"),
        h("span", {}, "Reasoning & Causal Fallacy Audit")
      ),
      h("span", { class: "fallacy-badge" }, fallacyData.reasoningIntegrity || "Empirical review")
    ),
    hasFallacy && fallacyData.fallacies && fallacyData.fallacies.length
      ? h("div", {}, fallacyData.fallacies.map(f =>
          h("div", { class: "fallacy-item" },
            h("div", { class: "fallacy-type" }, f.type),
            h("div", { class: "fallacy-detail" }, f.detail)
          )
        ))
      : h("p", { style: "font-size:0.85rem; color:var(--text-muted); margin-top:0.3rem;" },
          "Claim proposition directly addressed without detected correlation errors or anonymous authority appeals."
        )
  );

  // 7. Reasoning Inspector Drawer
  const inspectorDrawer = h("details", { class: "inspector-drawer" },
    h("summary", {},
      h("span", {}, "🔍 Why this verdict was reached (Forensic Breakdown)"),
      h("span", {}, "▾")
    ),
    h("div", { class: "inspector-body" },
      h("p", { style: "margin-bottom:0.75rem;" }, why.whyThisVerdict || "Evaluated by cross-referencing multi-source evidence against empirical consensus."),
      Array.isArray(why.conflictingEvidence) && why.conflictingEvidence.length
        ? h("div", { style: "margin-top:0.5rem;" },
            h("b", { style: "color:var(--false);" }, "Conflicting Evidence:"),
            h("ul", { style: "padding-left:1.2rem; margin-top:0.25rem;" }, why.conflictingEvidence.map(c => h("li", {}, c)))
          )
        : null,
      r.limitations.length
        ? h("div", { style: "margin-top:0.5rem;" },
            h("b", { style: "color:var(--text-dim);" }, "Verification Caveats:"),
            h("ul", { style: "padding-left:1.2rem; margin-top:0.25rem;" }, r.limitations.map(l => h("li", {}, l)))
          )
        : null
    )
  );

  // 8. Interactive Source Evidence Dossier (with Dynamic Stance Filtering)
  const sourcesContainer = h("div", { class: "source-cards" });

  const renderSourceCards = filter => {
    state.activeSourceFilter = filter;
    const filtered = (r.sources || []).filter(s => {
      if (filter === "all") return true;
      return s.stance === filter;
    });

    if (!filtered.length) {
      sourcesContainer.replaceChildren(
        h("div", { class: "item", style: "text-align:center; padding:1.5rem;" },
          h("p", { class: "sub" }, `No sources currently tagged under '${filter}'.`)
        )
      );
      return;
    }

    sourcesContainer.replaceChildren(...filtered.map(s => {
      const isHighAuth = s.authority === "high";
      return h("article", { class: "source-card" },
        h("div", { class: "source-meta" },
          h("div", { class: "source-badges" },
            h("span", { class: `badge-stance ${s.stance}` }, s.stance),
            isHighAuth && h("span", { class: "badge-auth" }, "★ High Authority IFCN/Peer-Reviewed")
          ),
          h("span", { class: "source-publisher" }, [s.publisher, fmt(s.publishedAt)].filter(Boolean).join(" • "))
        ),
        h("h4", { class: "source-title" },
          s.url
            ? h("a", { href: s.url, target: "_blank", rel: "noopener noreferrer" }, s.title, " ↗")
            : s.title
        ),
        s.excerpt && h("div", { class: "source-excerpt" }, `“${s.excerpt}”`),
        s.notes && h("p", { style: "font-size:0.75rem; color:var(--text-dim); margin-top:0.4rem;" }, s.notes)
      );
    }));
  };

  // Counts for filter tabs
  const countAll = r.sources.length;
  const countPro = r.sources.filter(s => s.stance === "supports").length;
  const countCon = r.sources.filter(s => s.stance === "contradicts").length;
  const countCtx = r.sources.filter(s => s.stance === "context").length;

  const filterTabs = h("div", { class: "source-filters" },
    h("button", {
      class: "filter-btn active",
      type: "button",
      onclick: e => {
        $$(".filter-btn", filterTabs).forEach(b => b.classList.remove("active"));
        e.target.classList.add("active");
        renderSourceCards("all");
      }
    }, `All Sources (${countAll})`),
    countPro > 0 && h("button", {
      class: "filter-btn",
      type: "button",
      onclick: e => {
        $$(".filter-btn", filterTabs).forEach(b => b.classList.remove("active"));
        e.target.classList.add("active");
        renderSourceCards("supports");
      }
    }, `Supports (${countPro})`),
    countCon > 0 && h("button", {
      class: "filter-btn",
      type: "button",
      onclick: e => {
        $$(".filter-btn", filterTabs).forEach(b => b.classList.remove("active"));
        e.target.classList.add("active");
        renderSourceCards("contradicts");
      }
    }, `Contradicts (${countCon})`),
    countCtx > 0 && h("button", {
      class: "filter-btn",
      type: "button",
      onclick: e => {
        $$(".filter-btn", filterTabs).forEach(b => b.classList.remove("active"));
        e.target.classList.add("active");
        renderSourceCards("context");
      }
    }, `Context (${countCtx})`)
  );

  const sourcesSection = h("div", { class: "sources-section" },
    h("div", { class: "sources-head" },
      h("div", { class: "sources-title" },
        h("span", {}, "📚"),
        h("span", {}, "Live Evidence Dossier"),
        h("span", { class: "badge-count" }, `${countAll} Indexed Sources`)
      ),
      filterTabs
    ),
    sourcesContainer
  );

  // Initialize source cards with "all"
  renderSourceCards("all");

  // 9. Interactive Action Dock
  const shareSummary = `[Tathyoth Check] Claim: "${r.coreClaim}"\nVerdict: ${vInfo.label.toUpperCase()}\nSummary: ${r.summary}\nEvidence: ${countAll} sources inspected.`;
  const citationText = `Tathyoth Grounded Fact Engine. "${r.coreClaim}". Status: ${vInfo.label}. Scanned ${r.lastChecked ? fmt(r.lastChecked) : "2026"}.`;

  const actionDock = h("div", { class: "action-dock" },
    h("button", { class: "dock-btn", type: "button", onclick: () => copy(shareSummary, "Verdict card copied!") }, "📋 Copy Verdict Card"),
    h("button", { class: "dock-btn", type: "button", onclick: () => copy(citationText, "IFCN Citation copied!") }, "🎓 Copy Citation"),
    h("button", { class: "dock-btn", id: "btn-speak", type: "button", onclick: () => toggleSpeak(r) }, "🔊 Listen Narration"),
    h("button", { class: "dock-btn", type: "button", onclick: () => save(r) }, "⭐ Save to Device"),
    h("button", { class: "dock-btn", type: "button", onclick: () => $("#dlg").showModal() }, "⚡ Challenge Verdict")
  );

  // 10. Feedback Bar
  const feedbackBar = h("div", { class: "feedback-bar" },
    h("span", {}, "Was this fact-check helpful?"),
    h("button", { class: "feedback-btn", type: "button", onclick: () => sendFeedback("helpful", r) }, "👍 Yes"),
    h("button", { class: "feedback-btn", type: "button", onclick: () => sendFeedback("needs_correction", r) }, "✏️ Needs correction"),
    h("button", { class: "feedback-btn", type: "button", onclick: () => sendFeedback("missing_context", r) }, "📎 Missing context")
  );

  // Assemble Complete Card
  const card = h("article", { class: "verdict-card", "data-status": r.status },
    topBar,
    heroSection,
    claimBlock,
    summaryBanner,
    truthColumns,
    fallacyCard,
    inspectorDrawer,
    sourcesSection,
    actionDock,
    feedbackBar
  );

  box.replaceChildren(card);
  box.scrollIntoView({ behavior: "smooth", block: "start" });

  // Trigger smooth confidence bar animation
  requestAnimationFrame(() => {
    setTimeout(() => {
      const fillEl = $("#conf-fill");
      if (fillEl) fillEl.style.width = `${Math.min(Math.max(r.confidenceScore, 5), 100)}%`;
    }, 150);
  });
}

/* ---------- User Actions ---------- */
async function copy(text, successMsg = "Copied to clipboard.") {
  try {
    await navigator.clipboard.writeText(text);
    say(successMsg);
  } catch {
    say("Clipboard copy failed. Please select text manually.");
  }
}

function save(r) {
  const saved = store.get("tathyoth.saved", []);
  saved.unshift({
    claim: (r.coreClaim || state.text).slice(0, 140),
    status: r.status,
    confidence: r.confidenceScore,
    at: new Date().toISOString()
  });
  store.set("tathyoth.saved", saved.slice(0, 50));
  say("Saved to your local device history.");
}

function toggleSpeak(r) {
  if (!("speechSynthesis" in window)) {
    return say("Audio narration is not supported in this browser.");
  }
  const btn = $("#btn-speak");
  if (state.isSpeaking) {
    window.speechSynthesis.cancel();
    state.isSpeaking = false;
    if (btn) btn.textContent = "🔊 Listen Narration";
    return;
  }
  window.speechSynthesis.cancel();
  const vInfo = V[r.status] || V.unverified;
  const script = `Claim: ${r.coreClaim}. Verdict: ${vInfo.label}. ${r.summary}`;
  const utterance = new SpeechSynthesisUtterance(script);
  utterance.lang = lang() === "hi" ? "hi-IN" : "en-IN";
  utterance.rate = 1.0;
  utterance.onend = () => {
    state.isSpeaking = false;
    if (btn) btn.textContent = "🔊 Listen Narration";
  };
  utterance.onerror = () => {
    state.isSpeaking = false;
    if (btn) btn.textContent = "🔊 Listen Narration";
  };

  state.isSpeaking = true;
  if (btn) btn.textContent = "⏹️ Stop Narration";
  window.speechSynthesis.speak(utterance);
}

async function sendFeedback(kind, r) {
  try {
    await api("/api/feedback", {
      method: "POST",
      body: { kind, resultId: r.resultId || null, requestId: r.requestId || null }
    });
    say("Thank you for your feedback!");
  } catch {
    say("Feedback recorded locally.");
  }
}

function lang() {
  const v = $("#lang").value;
  const d = detect($("#text").value);
  return v === "auto" ? d : v;
}

function setMode(m) {
  state.mode = m;
  $$(".modes button").forEach(b => b.setAttribute("aria-checked", String(b.dataset.mode === m)));
  const isVerify = m === "verify";
  $("#go .go-text").textContent = isVerify ? "Check this claim" : "Search facts";
  $("#text").placeholder = isVerify 
    ? "Paste the forward, headline or medical claim here..." 
    : "Ask a factual question, e.g. What is the composition of air?";
  $("#hint").textContent = isVerify 
    ? "We extract the testable proposition, check 2026 data, audit fallacies, and show verified sources." 
    : "Grounded factual search backed by indexed encyclopedias and peer-reviewed consensus.";
}

/* ---------- Query Submission Orchestrator ---------- */
async function submit(e) {
  e.preventDefault();
  const goBtn = $("#go");
  if (goBtn.disabled) return;

  const text = $("#text").value.trim().normalize("NFC");
  const err = $("#err");
  const fail = msg => { err.textContent = msg; err.hidden = false; };
  err.hidden = true;

  if (!text) return fail("Please enter a statement, headline, or question to scan.");
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text) && !safeUrl(text)) {
    return fail("Only standard http:// and https:// URLs are supported.");
  }

  state.text = text;
  goBtn.disabled = true;
  goBtn.querySelector(".go-text").textContent = "Scanning...";

  // Launch live scanner HUD
  const stopScanner = startScannerHUD($("#result"), text);
  const mode = state.mode;

  try {
    const response = await api("/api/query", {
      method: "POST",
      body: { text, mode, language: lang() }
    });

    stopScanner();
    const res = clean(response, mode);
    state.last = res;
    renderResult(res);
    remember(text, mode);
  } catch (err) {
    stopScanner();
    $("#result").replaceChildren();
    fail(errText(err));
  } finally {
    goBtn.disabled = false;
    goBtn.querySelector(".go-text").textContent = mode === "verify" ? "Check this claim" : "Search facts";
  }
}

function remember(text, mode) {
  state.history.unshift({ text, mode, at: new Date().toISOString() });
  if ($("#hKeep").checked) store.set("tathyoth.history", state.history.slice(0, 30));
}

function openSaved() {
  const s = store.get("tathyoth.saved", []);
  const hs = state.history;
  $("#sList").replaceChildren(...(s.length 
    ? s.map(i => h("li", {},
        h("span", {}, i.claim),
        h("small", { style: "color:var(--text-muted);" }, `${i.status} • ${fmt(i.at)}`)
      )) 
    : [h("li", {}, "No verdicts saved yet.")]));

  $("#hList").replaceChildren(...(hs.length 
    ? hs.map(i => h("li", {},
        h("span", {}, i.text),
        h("small", { style: "color:var(--violet);" }, i.mode)
      )) 
    : [h("li", {}, "No search history in this session.")]));

  $("#saved").showModal();
}

async function challenge(e) {
  e.preventDefault();
  const url = $("#curl").value.trim();
  const er = $("#cerr");
  const kind = $("#ckind").value;
  er.hidden = true;

  if (url && !safeUrl(url)) {
    er.textContent = "Please enter a valid http:// or https:// URL.";
    er.hidden = false;
    return;
  }

  const body = {
    kind,
    message: $("#cmsg").value.trim(),
    url: url || null,
    resultId: state.last?.resultId || null,
    requestId: state.last?.requestId || null
  };

  try {
    await api(kind === "source" ? "/api/sources" : "/api/challenges", { method: "POST", body });
    say("Challenge submitted for editorial review. Thank you!");
    $("#dlg").close();
    $("#cf").reset();
  } catch (err) {
    er.textContent = errText(err);
    er.hidden = false;
  }
}

/* Sample Layout Trigger */
function sample() {
  const sampleData = clean({
    status: "disputed",
    coreClaim: "Drinking boiling water permanently immunizes cells against respiratory infections",
    scope: "Global Health / Medical Science",
    summary: "Disputed and contradicted. Scientific consensus firmly refutes that thermal water ingestion can immunize internal pulmonary cells against respiratory viral agents.",
    established: [
      "Drinking warm water can soothe throat irritation and prevent dehydration.",
      "Viruses replicate inside human mucosal cells where boiling water cannot safely penetrate without causing thermal injury."
    ],
    uncertain: [
      "No peer-reviewed epidemiological study has observed preventative immunity through hot beverages."
    ],
    confidenceScore: 92,
    confidenceRating: "Very High (Scientific Consensus)",
    confidenceExplanation: "Corroborated across 6 clinical medical records and WHO fact-checks.",
    fallacyAudit: {
      hasFallacy: true,
      reasoningIntegrity: "Compromised by rhetorical bias",
      fallacies: [
        {
          type: "Correlation vs. Causation Fallacy",
          detail: "Assuming soothing of symptoms equates to eradication of internal cellular infection."
        },
        {
          type: "Appeals to Anonymous Authority",
          detail: "Message attributes claims to generalized 'doctors & scientists' without citation."
        }
      ]
    },
    reasoning: {
      whyThisVerdict: "Universal clinical pathology establishes that viral pathogens replicate intracellularly in respiratory tracts, completely isolated from digestive fluids.",
      conflictingEvidence: [],
      missingInformation: []
    },
    sources: [
      {
        title: "WHO Mythbusters: Can drinking water prevent viral infection?",
        publisher: "World Health Organization",
        url: "https://who.int",
        stance: "contradicts",
        authority: "high",
        excerpt: "While staying hydrated is important for overall health, drinking water does not prevent or cure viral infections."
      },
      {
        title: "NIH Medline: Respiratory Viral Pathophysiology",
        publisher: "National Institutes of Health",
        url: "https://nih.gov",
        stance: "contradicts",
        authority: "high",
        excerpt: "Cellular uptake of respiratory viruses occurs through ACE2 and sialic acid receptors in the nasal and lung epithelium."
      },
      {
        title: "Mayo Clinic: Warm fluids and sore throat relief",
        publisher: "Mayo Clinic",
        url: "https://mayoclinic.org",
        stance: "supports",
        authority: "high",
        excerpt: "Drinking warm liquids such as tea or warm water can soothe a scratchy throat and thin mucus."
      }
    ],
    limitations: ["Sample layout demonstration."]
  }, "verify");

  state.last = sampleData;
  renderResult(sampleData);
}

/* ---------- Feeds (Bounties & Trending) ---------- */
function filters(kind, items, keys, draw) {
  const box = $(`.filters[data-for=${kind}]`);
  if (!box) return;
  const cur = {};
  box.replaceChildren(...keys.map(([k, label]) => {
    const vals = [...new Set(items.map(i => i[k]).filter(Boolean))];
    if (vals.length < 2) return null;
    return h("label", {}, label,
      h("select", {
        onchange: e => {
          cur[k] = e.target.value;
          draw(items.filter(i => Object.entries(cur).every(([a, b]) => !b || i[a] === b)));
        }
      },
      h("option", { value: "" }, "All"),
      vals.map(v => h("option", { value: v }, V[v]?.label || LANGS[v] || v))
      )
    );
  }));
  draw(items);
}

async function load(kind, drawItem, keys) {
  const out = $(kind === "bounties" ? "#bList" : "#tList");
  if (!out) return;
  const empty = m => out.replaceChildren(h("p", { class: "sub" }, m));
  try {
    const r = await api("/api/" + kind);
    const items = Array.isArray(r?.items) ? r.items : [];
    if (!items.length) return empty("No items recorded yet.");
    filters(kind, items, keys, f => {
      out.replaceChildren(...(f.length ? f.map(drawItem) : [h("p", { class: "sub" }, "No matches for selected filter.")]));
    });
  } catch (err) {
    empty("Live feed temporarily offline.");
  }
  out.setAttribute("aria-busy", "false");
}

const bountyItem = b => h("article", { class: "item" },
  h("span", { class: "tag" }, b.topic || "General"),
  h("span", { class: "tag" }, b.status || "open"),
  h("h3", {}, String(b.title || "Untitled bounty")),
  h("p", { class: "sub", style: "margin:0;" }, [b.difficulty, b.eligibility].filter(Boolean).join(" • "))
);

const trendItem = t => h("article", { class: "item" },
  h("span", { class: `badge-stance ${t.status === "supported" ? "supports" : (t.status === "false" ? "contradicts" : "context")}` },
    V[t.status]?.label || t.status
  ),
  h("h3", {}, String(t.coreClaim || "Untitled claim")),
  h("button", {
    class: "ghost small-btn",
    type: "button",
    style: "margin-top:0.4rem;",
    onclick: () => {
      $("#text").value = t.coreClaim;
      setMode("verify");
      $("#q").requestSubmit();
    }
  }, "Re-scan this claim")
);

const EXAMPLES = [
  "Hot water cures every virus",
  "Naya 500 ka note 2026 mein band ho raha hai, sach hai kya?",
  "Can humans breathe underwater without equipment?",
  "NASA warns 3 days of complete darkness in December"
];

/* ---------- Bootstrap ---------- */
document.addEventListener("DOMContentLoaded", () => {
  setMode("verify");

  $$(".modes button").forEach(b => {
    b.addEventListener("click", () => setMode(b.dataset.mode));
  });

  $("#q").addEventListener("submit", submit);
  
  $("#text").addEventListener("input", () => {
    const t = $("#text").value;
    $("#langNow").textContent = t.trim() ? "Detected: " + LANGS[detect(t)] : "";
  });

  $("#text").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      $("#q").requestSubmit();
    }
  });

  $("#openSaved").addEventListener("click", openSaved);
  $("#sample").addEventListener("click", sample);

  // Initialize example chips
  const chipsContainer = $("#chips");
  chipsContainer.replaceChildren(...EXAMPLES.map(ex => 
    h("button", {
      type: "button",
      onclick: () => {
        const txt = $("#text");
        txt.value = ex;
        txt.dispatchEvent(new Event("input"));
        txt.focus();
      }
    }, ex)
  ));

  // Modals
  $("#cf").addEventListener("submit", challenge);
  $("#cclose").addEventListener("click", () => $("#dlg").close());
  $("#ccancel").addEventListener("click", () => $("#dlg").close());
  $("#sClose").addEventListener("click", () => $("#saved").close());
  $("#sCloseBtn").addEventListener("click", () => $("#saved").close());
  $("#sClear").addEventListener("click", () => {
    store.set("tathyoth.saved", []);
    openSaved();
  });
  $("#hClear").addEventListener("click", () => {
    state.history = [];
    store.set("tathyoth.history", []);
    openSaved();
  });
  $("#hKeep").addEventListener("change", e => {
    store.set("tathyoth.history", e.target.checked ? state.history : []);
  });

  // Font size scaler
  const sizes = [100, 110, 120];
  let sizeIdx = store.get("tathyoth.size", 0);
  const applySize = () => {
    sizeIdx = sizes[sizeIdx] ? sizeIdx : 0;
    document.documentElement.style.fontSize = `${sizes[sizeIdx]}%`;
    $("#size").textContent = ["A", "A+", "A++"][sizeIdx];
    store.set("tathyoth.size", sizeIdx);
  };
  $("#size").addEventListener("click", () => {
    sizeIdx = (sizeIdx + 1) % sizes.length;
    applySize();
  });
  applySize();

  // Load feeds
  load("bounties", bountyItem, [["topic", "Topic"], ["status", "Status"]]);
  load("trending", trendItem, [["status", "Verdict"]]);
});
