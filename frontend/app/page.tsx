"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { samples } from "@/lib/samples";
import type {
  FinalResult,
  Finding,
  LabTest,
  StreamEvent,
  SummaryContent,
} from "@/lib/types";

type AgentName = "intake" | "analyzer" | "improvement" | "nutrition" | "safety" | "summary";
type AgentStatus = "waiting" | "running" | "done";
type AgentProgress = { name: AgentName; status: AgentStatus; preview?: string };
type Language = "en" | "roman";
type FeatureId = "clarity" | "language" | "safety";
type CurrentUser = { id: number; name: string; email: string };
type AuthSession = { token: string; user: CurrentUser };
type SavedReport = { id: string; created_at: string; patient_name: string | null; summary: string };

const sessionStorageKey = "lablens-session";

const agentNames: AgentName[] = [
  "intake",
  "analyzer",
  "improvement",
  "nutrition",
  "safety",
  "summary",
];

const agentLabels: Record<AgentName, string> = {
  intake: "Agent 1 — Reading your report",
  analyzer: "Agent 2 — Reviewing each result",
  improvement: "Agent 3 — Preparing helpful guidance",
  nutrition: "Agent 4 — Reviewing everyday habits",
  safety: "Agent 5 — Running a safety review",
  summary: "Agent 6 — Writing your summary",
};

const resultCopy = {
  en: {
    prepared: "Prepared",
    resultTitle: "Here’s what we found.",
    patient: "Patient",
    years: "years",
    urgentTitle: "Please speak with a healthcare professional promptly.",
    urgentDescription: "A result may need timely review. This is a cautious educational prompt, not a medical assessment.",
    generalRange: "A general reference range was used where your report did not include one. Ranges can vary by lab and personal context.",
    noteForYou: "A note for you",
    tests: "Your test results",
    compare: "Compare these notes with your report.",
    consider: "Things to consider",
    considerDescription: "General ideas for a conversation with your clinician.",
    noSuggestions: "No additional suggestions were available from this report.",
    questions: "Questions for your doctor",
    questionsDescription: "Bring these to your next conversation.",
    noQuestions: "A clinician can help put these results in your personal context.",
    wellBeing: "Everyday well-being",
    wellBeingDescription: "General habits, not a treatment plan.",
    couldInclude: "Could include:",
    couldLimit: "Could limit:",
    everydayHabits: "Everyday habits:",
    noNutrition: "No additional food or habit suggestions were generated.",
    nextSteps: "Small next steps",
    safety: "About the safety review",
    safetyChanges: (count: number) => `We made ${count} clarification(s)`,
    safetyNote: resultSafetyNoteEnglish,
  },
  roman: {
    prepared: "Tayyar ki gayi",
    resultTitle: "Yeh hum ne samjha.",
    patient: "Mareez",
    years: "saal",
    urgentTitle: "Barah-e-karam jald kisi sehat ke maahir se baat karein.",
    urgentDescription: "Kisi result ko jald dekhne ki zaroorat ho sakti hai. Yeh sirf ehtiyati taleemi mashwara hai, tibbi tashkhees nahi.",
    generalRange: "Jahan report ki apni range maujood nahi thi, wahan aam reference range istemal hui. Ranges lab aur zaati halaat ke mutabiq badal sakti hain.",
    noteForYou: "Aap ke liye ek paigham",
    tests: "Aap ke test results",
    compare: "In notes ka apni report se muqabla karein.",
    consider: "Ghor karne wali baatein",
    considerDescription: "Apne doctor se baat karne ke liye aam nuqaat.",
    noSuggestions: "Is report se koi izafi mashware nahi mile.",
    questions: "Doctor se poochne ke sawalat",
    questionsDescription: "Agli mulaqat mein in par baat karein.",
    noQuestions: "Doctor aap ke zaati halaat ke mutabiq in results ko samjha sakte hain.",
    wellBeing: "Rozmarra ki sehat",
    wellBeingDescription: "Aam aadatein, ilaaj ka mansuba nahi.",
    couldInclude: "Shamil kar sakte hain:",
    couldLimit: "Kam kar sakte hain:",
    everydayHabits: "Rozmarra ki aadatein:",
    noNutrition: "Khanay ya aadaton ke liye koi izafi mashwara nahi mila.",
    nextSteps: "Chhotay aglay qadam",
    safety: "Safety review ke baare mein",
    safetyChanges: (count: number) => `${count} wazahatein ki gayin`,
    safetyNote: resultSafetyNoteRoman,
  },
} as const;

function resultSafetyNoteEnglish(note: string): string {
  return note;
}

function resultSafetyNoteRoman(_note: string): string {
  void _note;
  return "Yeh sirf aam maloomat hai, tashkhees ya ilaaj ka mashwara nahi. Apne doctor se zaroor baat karein. AI safety jaanch durustgi ki guarantee nahi deti.";
}

const apiBase = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

function PublicLanding({ onAuthenticated }: { onAuthenticated: (session: AuthSession) => void }) {
  const [showAccount, setShowAccount] = useState(false);
  const [isLogin, setIsLogin] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submitAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch(`${apiBase}/api/auth/${isLogin ? "login" : "register"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isLogin ? { email, password } : { name, email, password }),
      });
      const payload = (await response.json()) as AuthSession & { detail?: string };
      if (!response.ok || !payload.token || !payload.user) {
        throw new Error(payload.detail || "We could not create your account.");
      }
      onAuthenticated({ token: payload.token, user: payload.user });
    } catch (submitError) {
      setError(errorText(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="LabLens home">
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
          <span>Lab<span className="brand-light">Lens</span></span>
        </a>
        <nav className="topnav" aria-label="Main navigation">
          <a href="#features">Features</a>
          <a href="#privacy">Your privacy</a>
          <button type="button" className="nav-cta" onClick={() => setShowAccount(true)}>Create account <span aria-hidden="true">↗</span></button>
        </nav>
      </header>
      <div className="notice-strip" role="note"><span className="notice-dot" aria-hidden="true" />An educational guide — never a diagnosis. Always discuss results with your doctor.</div>
      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> A clearer view of your health</div>
          <h1>Lab results,<br /><em>made human.</em></h1>
          <p className="hero-description">Understand your report in clear language, then keep your explanations safely in your private account.</p>
          <button type="button" className="primary-button hero-button" onClick={() => setShowAccount(true)}>Create your free account <span aria-hidden="true">↓</span></button>
          <p className="landing-login">Already have an account? <button type="button" onClick={() => { setIsLogin(true); setShowAccount(true); }}>Sign in</button></p>
        </div>
        <div className="hero-art" aria-label="Illustration of a lab result card" role="img">
          <div className="report-card">
            <div className="report-card-head"><span className="report-icon">✚</span><span><strong>YOUR RESULTS</strong><small>One step closer to clarity</small></span><span className="report-menu">···</span></div>
            <div className="report-divider" />
            <div className="sample-result"><div><strong>Vitamin D</strong><small>25-hydroxy · ng/mL</small></div><b>32</b></div>
            <div className="range-track"><span className="range-marker" /></div>
            <div className="range-labels"><span>Low</span><span className="range-ok">In range</span><span>High</span></div>
            <div className="gentle-note"><span>✦</span> Your explanation is saved to your account.</div>
          </div>
          <div className="floating-note"><span className="floating-check">✓</span> Private history, always</div>
        </div>
      </section>
      <section className="stats-row" id="features" aria-label="LabLens principles">
        <div className="stat-item"><span className="stat-icon">◉</span><div><strong>Plain-language reports</strong><small>Clear words, less overwhelm</small></div></div>
        <div className="stat-item"><span className="stat-icon stat-leaf">✳</span><div><strong>Six working AI agents</strong><small>Every step is shown live</small></div></div>
        <div className="stat-item" id="privacy"><span className="stat-icon stat-lock">⌑</span><div><strong>Private saved history</strong><small>Only visible in your account</small></div></div>
      </section>
      {showAccount && (
        <div className="auth-overlay" role="dialog" aria-modal="true" aria-labelledby="account-title">
          <form className="auth-card" onSubmit={submitAccount}>
            <button className="auth-close" type="button" aria-label="Close" onClick={() => setShowAccount(false)}>×</button>
            <span className="auth-kicker">LABLENS ACCOUNT</span>
            <h2 id="account-title">{isLogin ? "Welcome back." : "Save your health story."}</h2>
            <p>{isLogin ? "Sign in to see your saved reports." : "Create an account to analyse and save reports privately."}</p>
            {!isLogin && <label>Full name<input required minLength={2} value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" /></label>}
            <label>Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
            <label>Password<input required type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={isLogin ? "current-password" : "new-password"} /></label>
            {error && <p className="auth-error">{error}</p>}
            <button className="primary-button auth-submit" disabled={submitting} type="submit">{submitting ? "Please wait…" : isLogin ? "Sign in" : "Create account"}</button>
            <button className="auth-switch" type="button" onClick={() => { setIsLogin((current) => !current); setError(""); }}>{isLogin ? "New to LabLens? Create an account" : "Already have an account? Sign in"}</button>
          </form>
        </div>
      )}
    </main>
  );
}

const featureOrder: FeatureId[] = ["clarity", "language", "safety"];

const landingFeatures: Record<FeatureId, {
  number: string;
  label: string;
  title: string;
  description: string;
  metric: string;
  metricLabel: string;
  note: string;
}> = {
  clarity: {
    number: "01",
    label: "Clear context",
    title: "See the number, the range, and the next question together.",
    description: "LabLens keeps the original result visible, then adds plain-language context without pretending to diagnose you.",
    metric: "106",
    metricLabel: "Glucose · mg/dL",
    note: "A little above the listed range",
  },
  language: {
    number: "02",
    label: "Language that meets you",
    title: "Switch between English and Roman Urdu in one tap.",
    description: "The same careful explanation is available in familiar language, so it is easier to understand and share at home.",
    metric: "Aasaan alfaaz",
    metricLabel: "Roman Urdu explanation",
    note: "Apne doctor se is result ke context ke baare mein poochain.",
  },
  safety: {
    number: "03",
    label: "Safety built in",
    title: "Guidance is reviewed before it reaches you.",
    description: "The app is designed to avoid diagnosis, prescriptions, and overconfident claims, while making urgent follow-up clear.",
    metric: "Safety review",
    metricLabel: "Before your summary",
    note: "For learning and discussion, never a treatment plan.",
  },
};

function initialProgress(): AgentProgress[] {
  return agentNames.map((name) => ({ name, status: "waiting" }));
}

function errorText(value: unknown): string {
  return value instanceof Error ? value.message : "Something went wrong. Please try again.";
}

function statusLabel(status: Finding["status"], language: Language): string {
  const labels = {
    en: { low: "Below range", normal: "Within range", high: "Above range", unknown: "Needs context" },
    roman: { low: "Range se kam", normal: "Range ke andar", high: "Range se zyada", unknown: "Mazeed maloomat" },
  };
  return labels[language][status];
}

function statusClass(status: Finding["status"]): string {
  return `status-pill status-${status}`;
}

function severityLabel(severity: Finding["severity"], language: Language): string {
  const labels = {
    en: { mild: "Mild note", moderate: "Moderate note", severe: "Severe note", unknown: "Context needed" },
    roman: { mild: "Halka darja", moderate: "Darmiyani darja", severe: "Shadeed darja", unknown: "Mazeed context" },
  };
  return labels[language][severity];
}

function sectionFor(language: Language, result: FinalResult): SummaryContent {
  return language === "en" ? result.summary_english : result.summary_roman_urdu;
}

function readError(responseText: string): string {
  try {
    const body = JSON.parse(responseText) as { detail?: string };
    return body.detail || "The report could not be submitted.";
  } catch {
    return "The report could not be submitted.";
  }
}

export default function Home() {
  const [mode, setMode] = useState<"text" | "upload">("text");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<FinalResult | null>(null);
  const [language, setLanguage] = useState<Language>("en");
  const [progress, setProgress] = useState<AgentProgress[]>(initialProgress);
  const [processing, setProcessing] = useState(false);
  const [notice, setNotice] = useState("");
  const [patientName, setPatientName] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [patientGender, setPatientGender] = useState("");
  const [speechPaused, setSpeechPaused] = useState(false);
  const [activeFeature, setActiveFeature] = useState<FeatureId>("clarity");
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const printableRef = useRef<HTMLElement>(null);
  const resultsInputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      window.speechSynthesis?.cancel();
      abortRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    const stored = window.localStorage.getItem(sessionStorageKey);
    if (!stored) {
      setAuthReady(true);
      return;
    }
    let session: AuthSession;
    try {
      session = JSON.parse(stored) as AuthSession;
    } catch {
      window.localStorage.removeItem(sessionStorageKey);
      setAuthReady(true);
      return;
    }
    void fetch(`${apiBase}/api/auth/me`, { headers: { Authorization: `Bearer ${session.token}` } })
      .then(async (response) => {
        if (!response.ok) throw new Error("Session expired");
        const payload = (await response.json()) as { user: CurrentUser };
        setUser(payload.user);
        void refreshReports();
      })
      .catch(() => window.localStorage.removeItem(sessionStorageKey))
      .finally(() => setAuthReady(true));
  }, []);

  function token() {
    const stored = window.localStorage.getItem(sessionStorageKey);
    if (!stored) return null;
    try {
      return (JSON.parse(stored) as AuthSession).token;
    } catch {
      return null;
    }
  }

  async function refreshReports() {
    const sessionToken = token();
    if (!sessionToken) return;
    const response = await fetch(`${apiBase}/api/reports`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    if (!response.ok) return;
    const payload = (await response.json()) as { reports: SavedReport[] };
    setSavedReports(payload.reports);
  }

  function completeAuthentication(session: AuthSession) {
    window.localStorage.setItem(sessionStorageKey, JSON.stringify(session));
    setUser(session.user);
    setAuthReady(true);
    void refreshReports();
  }

  async function signOut() {
    const sessionToken = token();
    if (sessionToken) {
      await fetch(`${apiBase}/api/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
    }
    window.localStorage.removeItem(sessionStorageKey);
    setUser(null);
    setSavedReports([]);
    setResult(null);
  }

  async function openSavedReport(reportId: string) {
    const sessionToken = token();
    if (!sessionToken) return;
    const response = await fetch(`${apiBase}/api/reports/${reportId}`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    if (!response.ok) {
      setNotice("This saved report could not be opened.");
      return;
    }
    const payload = (await response.json()) as { result: FinalResult };
    setResult(payload.result);
    window.requestAnimationFrame(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth" }));
  }

  function chooseSample(sampleId: string) {
    const selected = samples.find((item) => item.id === sampleId);
    if (!selected) return;
    setText(selected.text);
    setFile(null);
    setMode("text");
    setNotice("");
    setResult(null);
  }

  function startDemo() {
    chooseSample("full");
    window.requestAnimationFrame(() => {
      document.getElementById("analyze")?.scrollIntoView({ behavior: "smooth", block: "start" });
      resultsInputRef.current?.focus({ preventScroll: true });
    });
  }

  function updateFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (!selected) {
      setFile(null);
      return;
    }
    const accepted = /\.(pdf|png|jpe?g)$/i.test(selected.name);
    if (!accepted) {
      setFile(null);
      setNotice("Please choose a PDF, PNG, or JPG file.");
      event.target.value = "";
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      setFile(null);
      setNotice("The report must be 10 MB or smaller.");
      event.target.value = "";
      return;
    }
    setFile(selected);
    setNotice("");
    setResult(null);
  }

  async function submitAnalysis(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (processing) return;
    const sessionToken = token();
    if (!sessionToken) {
      setNotice("Please create an account or sign in before analysing a report.");
      return;
    }
    if (mode === "upload" && !file) {
      setNotice("Choose a report file first.");
      return;
    }
    if (mode === "text" && !text.trim()) {
      setNotice("Type some laboratory results or choose a sample report.");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setProcessing(true);
    setNotice("");
    setResult(null);
    setProgress(initialProgress());

    const body = new FormData();
    body.set("text", mode === "text" ? text : "");
    if (mode === "upload" && file) body.set("file", file);
    if (patientName.trim()) body.set("name", patientName.trim());
    if (patientAge.trim()) body.set("age", patientAge.trim());
    if (patientGender.trim()) body.set("gender", patientGender.trim());

    try {
      const response = await fetch(`${apiBase}/api/analyze`, {
        method: "POST",
        body,
        signal: controller.signal,
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      if (!response.ok) {
        throw new Error(readError(await response.text()));
      }
      if (!response.body) throw new Error("The analysis stream was not available.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let receivedFinal = false;
      let receivedRejection = false;
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const data = frame
            .split(/\r?\n/)
            .find((line) => line.startsWith("data:"))
            ?.slice(5)
            .trim();
          if (!data) continue;
          const message = JSON.parse(data) as StreamEvent;
          if (message.event === "agent_start" && message.agent) {
            setProgress((current) =>
              current.map((item) =>
                item.name === message.agent ? { ...item, status: "running" } : item,
              ),
            );
          } else if (message.event === "agent_done" && message.agent) {
            setProgress((current) =>
              current.map((item) =>
                item.name === message.agent
                  ? { ...item, status: "done", preview: message.preview }
                  : item,
              ),
            );
          } else if (message.event === "rejected") {
            receivedRejection = true;
            setNotice(message.message || "This does not appear to be a readable lab report.");
          } else if (message.event === "error") {
            throw new Error(message.message || "The analysis could not be completed.");
          } else if (message.event === "final" && message.result) {
            setResult(message.result);
            setPatientName(message.result.patient.name || "");
            setPatientAge(
              message.result.patient.age === null ? "" : String(message.result.patient.age),
            );
            setPatientGender(message.result.patient.gender || "");
            receivedFinal = true;
            void refreshReports();
          }
        }
        if (done) break;
      }
      if (!receivedFinal && !receivedRejection) {
        setNotice("The report could not be analyzed. Please check the input and try again.");
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setNotice(errorText(error));
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setProcessing(false);
    }
  }

  async function exportPdf() {
    if (!printableRef.current || !result) return;
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      await html2pdf()
        .set({
          margin: 10,
          filename: `lablens-report-${new Date().toISOString().slice(0, 10)}.pdf`,
          image: { type: "jpeg", quality: 0.96 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(printableRef.current)
        .save();
    } catch {
      window.print();
    }
  }

  function speakSummary() {
    const script =
      language === "en" ? result?.english_audio_script : result?.roman_urdu_audio_script;
    if (!script || !("speechSynthesis" in window)) {
      setNotice("Read-aloud is not available in this browser.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(script);
    const voices = window.speechSynthesis.getVoices();
    const voice =
      language === "roman"
        ? voices.find((item) => item.lang.toLowerCase() === "ur-pk") ||
          voices.find((item) => item.lang.toLowerCase().startsWith("en"))
        : voices.find((item) => item.lang.toLowerCase().startsWith("en"));
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = language === "roman" ? "ur-PK" : "en-US";
    }
    utterance.onend = () => setSpeechPaused(false);
    window.speechSynthesis.speak(utterance);
    setSpeechPaused(false);
  }

  function toggleSpeech() {
    if (!("speechSynthesis" in window)) {
      setNotice("Read-aloud is not available in this browser.");
      return;
    }
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setSpeechPaused(false);
    } else if (window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
      setSpeechPaused(true);
    } else {
      speakSummary();
    }
  }

  function stopSpeech() {
    window.speechSynthesis?.cancel();
    setSpeechPaused(false);
  }

  function changeLanguage(nextLanguage: Language) {
    window.speechSynthesis?.cancel();
    setSpeechPaused(false);
    setLanguage(nextLanguage);
  }

  const selectedSummary = result ? sectionFor(language, result) : null;
  const findingById = new Map(result?.findings.map((finding) => [finding.test_id, finding]));
  const testById = new Map(result?.tests.map((test) => [test.id, test]));
  const explanationById = new Map(
    selectedSummary?.finding_explanations.map((item) => [item.test_id, item.advice]),
  );
  const copy = resultCopy[language];

  if (!authReady) {
    return <main className="loading-page">Loading LabLens…</main>;
  }

  if (!user) {
    return <PublicLanding onAuthenticated={completeAuthentication} />;
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#" aria-label="LabLens home">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>Lab<span className="brand-light">Lens</span></span>
        </a>
        <nav className="topnav" aria-label="Main navigation">
          <a href="#features">Features</a>
          <a href="#how-it-works">How it works</a>
          <button type="button" className="account-pill" onClick={signOut}>Hi, {user.name.split(" ")[0]} · Sign out</button>
          <a href="#privacy">Your privacy</a>
          <a className="nav-cta" href="#analyze">Understand a report <span aria-hidden="true">↗</span></a>
        </nav>
      </header>

      <div className="notice-strip" role="note">
        <span className="notice-dot" aria-hidden="true" />
        An educational guide — never a diagnosis. Always discuss results with your doctor.
      </div>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> A clearer view of your health</div>
          <h1>Lab results,<br /><em>made human.</em></h1>
          <p className="hero-description">
            A little more clarity can make a big difference. Understand the numbers on your
            report, in language that feels like yours.
          </p>
          <a href="#analyze" className="primary-button hero-button">
            Make sense of my results <span aria-hidden="true">↓</span>
          </a>
          <button type="button" className="hero-demo-button" onClick={startDemo}>
            Load a full synthetic demo <span aria-hidden="true">→</span>
          </button>
          <div className="hero-trust">
            <span className="trust-icon" aria-hidden="true">✳</span>
            Your account keeps your saved explanations private and ready when you need them.
          </div>
        </div>
        <div className="hero-art" aria-label="Illustration of a lab result card" role="img">
          <div className="report-card">
            <div className="report-card-head">
              <span className="report-icon">✚</span>
              <span><strong>YOUR RESULTS</strong><small>One step closer to clarity</small></span>
              <span className="report-menu">···</span>
            </div>
            <div className="report-divider" />
            <div className="sample-result">
              <div><strong>Vitamin D</strong><small>25-hydroxy · ng/mL</small></div>
              <b>32</b>
            </div>
            <div className="range-track"><span className="range-marker" /></div>
            <div className="range-labels"><span>Low</span><span className="range-ok">In range</span><span>High</span></div>
            <div className="gentle-note"><span>✦</span> A helpful place to start. Your doctor can help with the full picture.</div>
          </div>
          <div className="floating-note"><span className="floating-check">✓</span> Plain language, always</div>
        </div>
      </section>

      <section className="stats-row" aria-label="LabLens principles">
        <div className="stat-item"><span className="stat-icon">◉</span><div><strong>Made for understanding</strong><small>Clear words, less overwhelm</small></div></div>
        <div className="stat-item"><span className="stat-icon stat-leaf">✳</span><div><strong>Careful by design</strong><small>No diagnosis. No prescriptions.</small></div></div>
        <div className="stat-item"><span className="stat-icon stat-lock">⌑</span><div><strong>Your report stays yours</strong><small>Not stored after your session</small></div></div>
      </section>

      <section className="feature-section" id="features" aria-labelledby="features-heading">
        <div className="feature-heading">
          <div>
            <div className="eyebrow"><span className="eyebrow-line" /> Built for the in-between moments</div>
            <h2 id="features-heading">Less guessing.<br /><em>More grounding.</em></h2>
          </div>
          <p>Explore what changes when a lab report is explained with a little more care.</p>
        </div>

        <div className="feature-stage">
          <div className="feature-tabs" role="tablist" aria-label="LabLens features">
            {featureOrder.map((featureId) => {
              const feature = landingFeatures[featureId];
              const selected = activeFeature === featureId;
              return (
                <button
                  type="button"
                  className={selected ? "feature-tab active" : "feature-tab"}
                  id={`feature-tab-${featureId}`}
                  key={featureId}
                  role="tab"
                  aria-selected={selected}
                  aria-controls="feature-preview"
                  onClick={() => setActiveFeature(featureId)}
                >
                  <span className="feature-number">{feature.number}</span>
                  <span><strong>{feature.label}</strong><small>{feature.title}</small></span>
                  <span className="feature-arrow" aria-hidden="true">→</span>
                </button>
              );
            })}
          </div>

          <div
            className={`feature-preview feature-preview-${activeFeature}`}
            id="feature-preview"
            role="tabpanel"
            aria-labelledby={`feature-tab-${activeFeature}`}
          >
            <div className="preview-glow" aria-hidden="true" />
            <div className="preview-card">
              <div className="preview-card-top"><span>LABLENS PREVIEW</span><i /><i /><i /></div>
              <div className="preview-card-copy">
                <span className="preview-label">{landingFeatures[activeFeature].metricLabel}</span>
                <strong>{landingFeatures[activeFeature].metric}</strong>
              </div>
              <div className="preview-status"><span /><p>{landingFeatures[activeFeature].note}</p></div>
              <div className="preview-lines" aria-hidden="true"><span /><span /><span /></div>
            </div>
            <div className="preview-caption">
              <span>{landingFeatures[activeFeature].number}</span>
              <div><strong>{landingFeatures[activeFeature].label}</strong><p>{landingFeatures[activeFeature].description}</p></div>
            </div>
          </div>
        </div>

        <div className="feature-footnote">
          <span className="feature-pulse" aria-hidden="true" />
          Each completed report is securely saved to your private account history.
          <button type="button" onClick={startDemo}>See it with a synthetic report <span aria-hidden="true">→</span></button>
        </div>
      </section>

      <section id="analyze" className="workspace-section">
        <div className="section-heading">
          <div className="eyebrow"><span className="eyebrow-line" /> Your next step</div>
          <h2>Let’s look at your results.</h2>
          <p>Upload a report or type in a few values. We’ll take it one step at a time.</p>
        </div>

        <section className="saved-reports" aria-labelledby="saved-reports-heading">
          <div><span className="saved-label">PRIVATE HISTORY</span><h3 id="saved-reports-heading">Your saved reports</h3></div>
          {savedReports.length ? (
            <div className="saved-report-list">
              {savedReports.slice(0, 4).map((report) => (
                <button type="button" key={report.id} onClick={() => void openSavedReport(report.id)}>
                  <span><strong>{report.patient_name || "Lab report"}</strong><small>{new Date(report.created_at).toLocaleDateString()} · {report.summary}</small></span><b aria-hidden="true">→</b>
                </button>
              ))}
            </div>
          ) : <p className="empty-history">Your completed report explanations will appear here.</p>}
        </section>

        <div className="workspace-grid">
          <div className="input-card">
            <div className="input-card-title">
              <span className="step-number">01</span>
              <div><h3>Share your report</h3><p>Your information is used only to create this explanation.</p></div>
            </div>
            <div className="mode-tabs" role="tablist" aria-label="Input method">
              <button type="button" className={mode === "text" ? "mode-tab active" : "mode-tab"} onClick={() => setMode("text")} role="tab" aria-selected={mode === "text"}>Type results</button>
              <button type="button" className={mode === "upload" ? "mode-tab active" : "mode-tab"} onClick={() => setMode("upload")} role="tab" aria-selected={mode === "upload"}>Upload report</button>
            </div>

            <form onSubmit={submitAnalysis}>
              {mode === "text" ? (
                <label className="field-label" htmlFor="results-text">
                  Lab results
                  <textarea
                    id="results-text"
                    ref={resultsInputRef}
                    rows={7}
                    value={text}
                    onChange={(event) => {
                      setText(event.target.value);
                      setResult(null);
                    }}
                    placeholder={"For example:\nGlucose: 110 mg/dL (range 70–99)\nVitamin D: 28 ng/mL"}
                  />
                </label>
              ) : (
                <div className="upload-zone">
                  <label htmlFor="report-file" className="upload-label">
                    <span className="upload-symbol" aria-hidden="true">↑</span>
                    <strong>{file ? file.name : "Choose a report to upload"}</strong>
                    <span>{file ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : "PDF, PNG or JPG · up to 10 MB"}</span>
                  </label>
                  <input id="report-file" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={updateFile} />
                  {file && <button className="remove-file" type="button" onClick={() => setFile(null)}>Remove file</button>}
                </div>
              )}

              {mode === "text" && (
                <div className="samples">
                  <span className="samples-label">Try a synthetic example</span>
                  <div className="sample-buttons">
                    {samples.map((sample) => (
                      <button type="button" key={sample.id} onClick={() => chooseSample(sample.id)} title={sample.description}>{sample.label}</button>
                    ))}
                  </div>
                  <p className="sample-disclaimer">Synthetic examples only — never real patient data.</p>
                </div>
              )}

              <button className="primary-button submit-button" type="submit" disabled={processing}>
                {processing ? <><span className="button-spinner" /> Working through your report…</> : <>Help me understand <span aria-hidden="true">→</span></>}
              </button>
            </form>

            <p className="inline-disclaimer"><span aria-hidden="true">ⓘ</span> Your report is sent to the configured AI provider for this explanation and is not stored by LabLens. This is not a diagnosis; please consult a doctor.</p>
            {notice && <p className="feedback-message" role="alert">{notice}</p>}
          </div>

          <aside className="process-card" id="how-it-works">
            <div className="process-topline"><span className="process-icon">✳</span><span>THE LABLENS APPROACH</span></div>
            <h3>A thoughtful look,<br />from start to finish.</h3>
            <p className="process-intro">Your results are reviewed in a few careful steps, with safety at the heart of each one.</p>
            <ol className="process-list">
              <li><span className="process-index">1</span><span><strong>We read the report</strong><small>Only the details actually shown.</small></span></li>
              <li><span className="process-index">2</span><span><strong>We put numbers in context</strong><small>Your report’s own ranges come first.</small></span></li>
              <li><span className="process-index">3</span><span><strong>We review the guidance</strong><small>Careful language, with clear limits.</small></span></li>
              <li><span className="process-index">4</span><span><strong>You choose what’s next</strong><small>Take questions to your clinician.</small></span></li>
            </ol>
            <div className="process-foot"><span>◷</span> Usually just a few moments</div>
          </aside>
        </div>

        {(processing || progress.some((item) => item.status !== "waiting")) && (
          <section className="timeline-card" aria-live="polite" aria-label="Analysis progress">
            <div className="timeline-heading"><span className="step-number">02</span><div><h3>A careful review is underway</h3><p>Each step adds context — not a diagnosis.</p></div></div>
            <ol className="timeline-list">
              {progress.map((item, index) => (
                <li className={`timeline-item timeline-${item.status}`} key={item.name}>
                  <span className="timeline-marker">{item.status === "done" ? "✓" : item.status === "running" ? <span className="mini-spinner" /> : String(index + 1).padStart(2, "0")}</span>
                  <span className="timeline-copy"><strong>{agentLabels[item.name]}</strong>{item.preview && <small>{item.preview}</small>}</span>
                  <span className="timeline-state">{item.status === "done" ? "Complete" : item.status === "running" ? "In progress" : "Waiting"}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {result && selectedSummary && (
          <section className="results-section" id="results" aria-labelledby="results-heading">
            <div className="results-heading">
              <div><div className="eyebrow"><span className="eyebrow-line" /> Your explanation</div><h2 id="results-heading">{copy.resultTitle}</h2></div>
              <div className="result-actions">
                <div className="language-toggle" role="group" aria-label="Summary language">
                  <button type="button" className={language === "en" ? "selected" : ""} onClick={() => changeLanguage("en")}>English</button>
                  <button type="button" className={language === "roman" ? "selected" : ""} onClick={() => changeLanguage("roman")}>Roman Urdu</button>
                </div>
                <button className="outline-button" type="button" onClick={exportPdf}>↓ <span>Save as PDF</span></button>
              </div>
            </div>

            <article className="result-report" ref={printableRef}>
              <div className="report-meta">
                <span>{copy.prepared} {new Date(result.generated_at).toLocaleDateString()}</span>
                <span>
                  {[result.patient.name || copy.patient, result.patient.age === null ? null : `${result.patient.age} ${copy.years}`, result.patient.gender]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              {result.urgent_banner && (
                <div className="urgent-banner" role="alert"><span>!</span><div><strong>{copy.urgentTitle}</strong><p>{copy.urgentDescription}</p></div></div>
              )}
              {result.general_ranges_used && (
                <p className="range-disclosure"><span>ⓘ</span> {copy.generalRange}</p>
              )}
              <div className="summary-card">
                <div className="summary-kicker"><span className="summary-spark">✳</span> {copy.noteForYou}</div>
                <h3>{selectedSummary.headline}</h3>
                <p>{selectedSummary.overview}</p>
                <div className="audio-controls" aria-label="Read summary aloud">
                  <button type="button" onClick={speakSummary}>▶ <span>Listen</span></button>
                  <button type="button" onClick={toggleSpeech} aria-label={speechPaused ? "Resume speech" : "Pause speech"}>{speechPaused ? "▶" : "Ⅱ"}</button>
                  <button type="button" onClick={stopSpeech} aria-label="Stop speech">■</button>
                </div>
              </div>

              <div className="result-columns">
                <section className="result-panel">
                  <div className="panel-title"><span className="panel-icon">⌁</span><div><h3>{copy.tests}</h3><p>{copy.compare}</p></div></div>
                  <div className="test-list">
                    {result.tests.map((test: LabTest) => {
                      const finding = findingById.get(test.id);
                      return <TestCard key={test.id} test={test} finding={finding} language={language} explanation={explanationById.get(test.id)} />;
                    })}
                  </div>
                </section>

                <section className="result-panel next-panel">
                  <div className="panel-title"><span className="panel-icon panel-icon-peach">✳</span><div><h3>{copy.consider}</h3><p>{copy.considerDescription}</p></div></div>
                  {selectedSummary.attention_tests.length > 0 && <BulletList items={selectedSummary.attention_tests} />}
                  {selectedSummary.suggestions.map((item) => (
                    <div className="advice-row" key={`${item.test_id}-${item.advice}`}><span className="advice-marker">↗</span><p><strong>{testById.get(item.test_id)?.name || "Your result"}</strong>{item.advice}</p></div>
                  ))}
                  {selectedSummary.general_suggestions.map((item) => <div className="advice-row" key={item}><span className="advice-marker">✦</span><p>{item}</p></div>)}
                  {selectedSummary.suggestions.length === 0 && selectedSummary.general_suggestions.length === 0 && <p className="empty-note">{copy.noSuggestions}</p>}
                </section>
              </div>

              <div className="result-columns lower-panels">
                <section className="result-panel">
                  <div className="panel-title"><span className="panel-icon panel-icon-mint">?</span><div><h3>{copy.questions}</h3><p>{copy.questionsDescription}</p></div></div>
                  {selectedSummary.doctor_questions.length ? selectedSummary.doctor_questions.map((item) => (
                    <div className="question-row" key={`${item.test_id}-${item.advice}`}><span>“</span><p>{item.advice}</p></div>
                  )) : <p className="empty-note">{copy.noQuestions}</p>}
                </section>
                <section className="result-panel">
                  <div className="panel-title"><span className="panel-icon panel-icon-lilac">↗</span><div><h3>{copy.wellBeing}</h3><p>{copy.wellBeingDescription}</p></div></div>
                  {selectedSummary.nutrition.suppressed ? (
                    <p className="suppression-note">{selectedSummary.nutrition.suppression_reason || copy.noNutrition}</p>
                  ) : (
                    <>
                      {selectedSummary.nutrition.findings.map((item) => (
                        <div className="nutrition-item" key={item.test_id}>
                          <strong>{testById.get(item.test_id)?.name || "Related to your results"}</strong>
                          {item.eat_more.length > 0 && <p><b>{copy.couldInclude}</b> {item.eat_more.join(", ")}</p>}
                          {item.eat_less.length > 0 && <p><b>{copy.couldLimit}</b> {item.eat_less.join(", ")}</p>}
                          {item.habits.length > 0 && <p><b>{copy.everydayHabits}</b> {item.habits.join(" ")}</p>}
                        </div>
                      ))}
                      {selectedSummary.nutrition.combined_advice.map((item) => <div className="advice-row compact" key={item}><span className="advice-marker">✦</span><p>{item}</p></div>)}
                      {!selectedSummary.nutrition.findings.length && !selectedSummary.nutrition.combined_advice.length && <p className="empty-note">{copy.noNutrition}</p>}
                    </>
                  )}
                </section>
              </div>

              <section className="next-steps">
                <div><span className="next-step-icon">✳</span><h3>{copy.nextSteps}</h3></div>
                <BulletList items={selectedSummary.next_steps} />
              </section>

              {result.safety_changes.length > 0 && (
                <details className="safety-disclosure">
                  <summary>{copy.safety} <span>{copy.safetyChanges(selectedSummary.safety_changes.length)}</span></summary>
                  <ul>{selectedSummary.safety_changes.map((change) => <li key={change}>{change}</li>)}</ul>
                </details>
              )}
              <div className="safety-note" id="privacy"><span>ⓘ</span><p>{copy.safetyNote(result.safety_note)}</p></div>

              {result.missing_fields.length > 0 && (
                <form className="optional-details" onSubmit={submitAnalysis}>
                  <div><span className="step-number">03</span><div><h3>Add a little context, if you’d like.</h3><p>This is optional. Your name, age and gender are never required to get a result.</p></div></div>
                  <div className="optional-fields">
                    {result.missing_fields.includes("name") && <label>Name <input value={patientName} onChange={(event) => setPatientName(event.target.value)} autoComplete="name" /></label>}
                    {result.missing_fields.includes("age") && <label>Age <input type="number" min="0" max="130" value={patientAge} onChange={(event) => setPatientAge(event.target.value)} inputMode="numeric" /></label>}
                    {result.missing_fields.includes("gender") && <label>Gender, if relevant to your report <input value={patientGender} onChange={(event) => setPatientGender(event.target.value)} /></label>}
                  </div>
                  <div className="optional-actions"><button className="text-button" type="button" onClick={() => setResult({ ...result, missing_fields: [] })}>Skip for now</button><button className="outline-button" type="submit" disabled={processing}>Re-run with details</button></div>
                </form>
              )}
            </article>
          </section>
        )}
      </section>

      <section className="closing-section">
        <span className="closing-spark">✳</span>
        <h2>Understanding is a good place to start.</h2>
        <p>Keep asking questions. Your care team is there to help you find the answers.</p>
        <a href="#analyze" className="outline-button">Back to the top <span aria-hidden="true">↑</span></a>
      </section>

      <footer className="site-footer">
        <a className="brand footer-brand" href="#"><span className="brand-mark" aria-hidden="true"><span /><span /><span /></span><span>Lab<span className="brand-light">Lens</span></span></a>
        <p>For learning and well-being. Not for diagnosis or treatment.</p>
        <span>Made with care · Educational use only</span>
      </footer>
    </main>
  );
}

function TestCard({
  test,
  finding,
  language,
  explanation,
}: {
  test: LabTest;
  finding?: Finding;
  language: Language;
  explanation?: string;
}) {
  if (!finding) return null;
  const rangeLabel =
    language === "en"
      ? test.reference_range
        ? `Report range: ${test.reference_range}`
        : "No report reference range provided"
      : test.reference_range
        ? `Report ki range: ${test.reference_range}`
        : "Report mein reference range nahi di gayi";
  const bandLabels =
    language === "en"
      ? { low: "Low", normal: "In range", high: "High" }
      : { low: "Kam", normal: "Range mein", high: "Zyada" };
  return (
    <article className={`test-card test-${finding.status}`}>
      <div className="test-card-top">
        <div><h4>{test.name}</h4><p>{rangeLabel}</p></div>
        <span className={statusClass(finding.status)}>{statusLabel(finding.status, language)}</span>
      </div>
      <div className="test-value-row"><strong>{test.original_value}</strong><span>{severityLabel(finding.severity, language)}</span></div>
      <div className={`test-band band-${finding.status}`} aria-label={statusLabel(finding.status, language)}>
        <span className="band-low">{bandLabels.low}</span><span className="band-normal">{bandLabels.normal}</span><span className="band-high">{bandLabels.high}</span><i />
      </div>
      <p className="test-explanation">{explanation || finding.explanation}</p>
      {finding.range_source === "general" && <p className="general-range-label">{language === "en" ? "General adult range used" : "Baligh afrad ki aam range istemal hui"}</p>}
      {finding.deviation_percent !== null && <p className="deviation-label">{language === "en" ? `${Math.abs(finding.deviation_percent).toFixed(1)}% from the range boundary · informational estimate` : `Range ki had se ${Math.abs(finding.deviation_percent).toFixed(1)}% farq · sirf maloomati andaza`}</p>}
    </article>
  );
}

function BulletList({ items }: { items: string[] }) {
  if (!items.length) return null;
  return <ul className="bullet-list">{items.map((item) => <li key={item}>{item}</li>)}</ul>;
}
