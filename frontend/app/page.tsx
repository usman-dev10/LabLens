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

const agentNames: AgentName[] = [
  "intake",
  "analyzer",
  "improvement",
  "nutrition",
  "safety",
  "summary",
];

const agentLabels: Record<AgentName, string> = {
  intake: "Reading your report",
  analyzer: "Reviewing each result",
  improvement: "Preparing helpful guidance",
  nutrition: "Reviewing everyday habits",
  safety: "Running a safety review",
  summary: "Writing your summary",
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
  const printableRef = useRef<HTMLElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      window.speechSynthesis?.cancel();
      abortRef.current?.abort();
    },
    [],
  );

  function chooseSample(sampleId: string) {
    const selected = samples.find((item) => item.id === sampleId);
    if (!selected) return;
    setText(selected.text);
    setFile(null);
    setMode("text");
    setNotice("");
    setResult(null);
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
          <a href="#how-it-works">How it works</a>
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
          <div className="hero-trust">
            <span className="trust-icon" aria-hidden="true">✳</span>
            No account. No saved reports. Just a little more understanding.
          </div>
        </div>
        <div className="hero-art" aria-label="Illustration of a lab result card" role="img">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="spark spark-one">✳</div>
          <div className="spark spark-two">✦</div>
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

      <section id="analyze" className="workspace-section">
        <div className="section-heading">
          <div className="eyebrow"><span className="eyebrow-line" /> Your next step</div>
          <h2>Let’s look at your results.</h2>
          <p>Upload a report or type in a few values. We’ll take it one step at a time.</p>
        </div>

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
          <section className="results-section" aria-labelledby="results-heading">
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
