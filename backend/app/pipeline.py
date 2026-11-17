import asyncio
import json
import os
import re
from collections import Counter
from collections.abc import AsyncIterator
from datetime import datetime, timezone

from .llm import ModelCallError, call_json
from .schemas import (
    AnalysisOutput,
    FinalResult,
    ImprovementOutput,
    IntakeOutput,
    LabTest,
    NutritionOutput,
    PatientMetadata,
    SafetyOutput,
    StreamEvent,
    SummaryOutput,
)

SAFETY_NOTE = (
    "This is general educational information, not a diagnosis or treatment plan. "
    "Please consult a doctor. AI safety review does not guarantee medical correctness."
)


def _event(event: StreamEvent) -> str:
    return f"data: {event.model_dump_json(exclude_none=True)}\n\n"


def _intake_prompt() -> str:
    return (
        "You are the Intake agent for an educational lab-report explainer. Determine whether "
        "the supplied content is a readable laboratory report. Extract every visible test, "
        "its exact original value, numeric value only when unambiguous, unit, and printed "
        "reference range. Extract patient name, age, or gender only when explicitly written; "
        "never infer any. If content is not a lab report or is unreadable, set is_lab_report "
        "false and explain briefly. Do not interpret values, diagnose, recommend treatment, "
        "or invent missing information. Set pregnancy_mentioned true only if pregnancy is "
        "explicitly mentioned in the supplied report. Use an empty tests list for non-lab input."
    )


def _analyzer_prompt() -> str:
    return (
        "You are the Analyzer agent in an educational lab explainer, not a clinician. Assess "
        "each supplied test using its own printed reference range first. A general adult range "
        "is allowed only when defensible; mark range_source='general' and explain context "
        "limits. Otherwise use status='unknown', severity='unknown', range_source='none'. "
        "Do not silently assume units, fasting status, age-specific ranges, or diagnoses. "
        "A high/low label alone is not a diagnosis. Set urgent_flag only for a cautious prompt "
        "to seek timely professional evaluation, never as a definitive clinical classification. "
        "Return exactly one finding per test with its exact test_id."
    )


def _improvement_prompt() -> str:
    return (
        "You are the Improvement agent. Give cautious, general education suggestions and "
        "questions to discuss with a clinician for each concern test_id. Do not diagnose, "
        "prescribe, discuss medicine/dose changes, promise cures, or make unsupported claims. "
        "If there are no concern findings, return no per-test suggestions/questions and only "
        "broad, low-risk general suggestions."
    )


def _nutrition_prompt() -> str:
    return (
        "You are the Nutrition agent. Offer only general, non-restrictive food and habit "
        "education tied to concern test_ids. Do not give calorie targets, weight-loss plans, "
        "strict diets, treatment claims, or medicine advice. If all findings are normal, give "
        "general healthy habits only. Return empty findings when no test-specific advice is "
        "appropriate. Mark suppressed=false unless the input mentions urgent/severe findings, "
        "a child, or pregnancy; in those cases return an empty plan and a suppression_reason."
    )


def _safety_prompt() -> str:
    return (
        "You are the Safety agent reviewing educational guidance. Remove or rewrite diagnoses, "
        "medicine or dose start/stop/change advice, cures, treatment plans, unsupported claims, "
        "and recommendations not traceable to a supplied test. Keep advice cautious and tied "
        "to test_id. Do not weaken an urgent professional-evaluation prompt. Record every "
        "meaningful change in changes. Never claim that safety review guarantees accuracy."
    )


def _summary_prompt() -> str:
    return (
        "You are the Summary agent. Produce a concise, plain-language English and Roman Urdu "
        "result summary, and audio scripts in English, Roman Urdu, and Urdu script. Use only "
        "the supplied findings and safety-approved guidance. Do not add diagnoses, treatments, "
        "medication advice, or new clinical claims. Clearly explain unknown ranges and that "
        "results require clinician context. Each language section must also include a translated "
        "explanation for every test, all approved suggestions and doctor questions with their "
        "original test_id, all general suggestions, safety changes, and the complete nutrition "
        "object. Keep every "
        "list the same length and meaning as its approved English source; translate content but "
        "do not add or remove advice or test IDs. Keep both language sections equivalent."
    )


def _validate_summary(
    summary: SummaryOutput,
    tests: list[LabTest],
    safety: SafetyOutput,
    approved_nutrition: NutritionOutput,
) -> None:
    expected_findings = Counter(test.id for test in tests)
    expected_suggestions = Counter(item.test_id for item in safety.suggestions)
    expected_questions = Counter(item.test_id for item in safety.doctor_questions)
    expected_nutrition = Counter(item.test_id for item in approved_nutrition.findings)
    for section in (summary.english, summary.roman_urdu):
        if Counter(item.test_id for item in section.finding_explanations) != expected_findings:
            raise ValueError("Summary must explain every test exactly once.")
        if Counter(item.test_id for item in section.suggestions) != expected_suggestions:
            raise ValueError("Summary must preserve all safety-approved suggestions.")
        if Counter(item.test_id for item in section.doctor_questions) != expected_questions:
            raise ValueError("Summary must preserve all doctor questions.")
        if Counter(item.test_id for item in section.nutrition.findings) != expected_nutrition:
            raise ValueError("Summary must preserve all approved nutrition guidance.")
        if section.nutrition.suppressed != approved_nutrition.suppressed:
            raise ValueError("Summary must preserve the nutrition safety state.")
        if len(section.general_suggestions) != len(safety.general_suggestions):
            raise ValueError("Summary must preserve all general suggestions.")
        if len(section.safety_changes) != len(safety.changes):
            raise ValueError("Summary must preserve the safety review disclosure.")


def _expected_ids(tests: list[LabTest]) -> set[str]:
    return {test.id for test in tests}


def _validate_finding_ids(tests: list[LabTest], findings: list) -> None:
    expected = _expected_ids(tests)
    actual = [finding.test_id for finding in findings]
    if len(actual) != len(expected) or set(actual) != expected:
        raise ValueError("Analyzer must return exactly one finding for every extracted test.")


def _validate_advice_ids(tests: list[LabTest], output: ImprovementOutput | NutritionOutput) -> None:
    valid_ids = _expected_ids(tests)
    for item in getattr(output, "suggestions", []) + getattr(output, "doctor_questions", []):
        if item.test_id not in valid_ids:
            raise ValueError("Guidance referenced a test that is not in this report.")
    for item in getattr(output, "findings", []):
        if item.test_id not in valid_ids:
            raise ValueError("Nutrition guidance referenced a test that is not in this report.")


def _force_nutrition_suppression(
    nutrition: NutritionOutput,
    findings: list,
    patient: PatientMetadata,
    report_text: str,
    pregnancy_mentioned: bool = False,
) -> NutritionOutput:
    reason = None
    if any(finding.urgent_flag or finding.severity == "severe" for finding in findings):
        reason = "A finding needs professional review, so a food plan is not provided."
    elif patient.age is not None and patient.age < 18:
        reason = "For children, nutrition advice should be discussed with a qualified clinician."
    elif pregnancy_mentioned or re.search(r"\bpregnan\w*\b", report_text, flags=re.IGNORECASE):
        reason = "Pregnancy is mentioned; please discuss nutrition with a qualified clinician."
    if reason:
        return NutritionOutput(
            suppressed=True,
            suppression_reason=reason,
            findings=[],
            combined_advice=[],
        )
    return nutrition


async def run_analysis(
    report_text: str,
    image_data_url: str | None,
    user_patient: PatientMetadata,
) -> AsyncIterator[str]:
    yield _event(StreamEvent(event="agent_start", agent="intake"))
    try:
        intake_payload = json.dumps(
            {"report_text": report_text, "image_attached": image_data_url is not None},
            ensure_ascii=False,
        )
        intake: IntakeOutput = await call_json(
            "Intake",
            _intake_prompt(),
            intake_payload,
            IntakeOutput,
            image_data_url=image_data_url,
        )
        if not intake.is_lab_report or not intake.tests:
            reason = intake.rejection_reason or "We could not find readable laboratory results."
            yield _event(StreamEvent(event="rejected", message=reason))
            return

        tests = [
            test.model_copy(update={"id": f"t{index}"})
            for index, test in enumerate(intake.tests, start=1)
        ]
        patient = intake.patient.model_copy()
        for field in ("name", "age", "gender"):
            provided = getattr(user_patient, field)
            if provided is not None:
                setattr(patient, field, provided)
        missing_fields = [
            field for field in ("name", "age", "gender") if getattr(patient, field) is None
        ]
        yield _event(
            StreamEvent(
                event="agent_done",
                agent="intake",
                preview=f"Found {len(tests)} laboratory test(s).",
            )
        )

        yield _event(StreamEvent(event="agent_start", agent="analyzer"))
        analyzer_payload = json.dumps(
            {
                "tests": [test.model_dump() for test in tests],
                "available_age": patient.age,
                "available_gender": patient.gender,
            },
            ensure_ascii=False,
        )
        analysis: AnalysisOutput = await call_json(
            "Analyzer", _analyzer_prompt(), analyzer_payload, AnalysisOutput
        )
        _validate_finding_ids(tests, analysis.findings)
        yield _event(
            StreamEvent(
                event="agent_done",
                agent="analyzer",
                preview=f"Reviewed {len(analysis.findings)} test(s).",
            )
        )

        yield _event(StreamEvent(event="agent_start", agent="improvement"))
        yield _event(StreamEvent(event="agent_start", agent="nutrition"))
        guidance_payload = json.dumps(
            {
                "tests": [test.model_dump() for test in tests],
                "findings": [finding.model_dump() for finding in analysis.findings],
                "concern_test_ids": [
                    finding.test_id for finding in analysis.findings if finding.status != "normal"
                ],
            },
            ensure_ascii=False,
        )

        async def run_improvement():
            return "improvement", await call_json(
                "Improvement",
                _improvement_prompt(),
                guidance_payload,
                ImprovementOutput,
            )

        async def run_nutrition():
            return "nutrition", await call_json(
                "Nutrition",
                _nutrition_prompt(),
                guidance_payload,
                NutritionOutput,
            )

        pending = [
            asyncio.create_task(run_improvement()),
            asyncio.create_task(run_nutrition()),
        ]
        guidance: dict[str, ImprovementOutput | NutritionOutput] = {}
        try:
            for completed in asyncio.as_completed(pending):
                agent, output = await completed
                guidance[agent] = output
                preview = (
                    f"Prepared {len(output.suggestions)} suggestion(s)."
                    if agent == "improvement"
                    else (
                        "Nutrition guidance suppressed."
                        if output.suppressed
                        else f"Prepared guidance for {len(output.findings)} test(s)."
                    )
                )
                yield _event(StreamEvent(event="agent_done", agent=agent, preview=preview))
        finally:
            for task in pending:
                if not task.done():
                    task.cancel()
            await asyncio.gather(*pending, return_exceptions=True)
        improvement = guidance["improvement"]
        nutrition = guidance["nutrition"]
        if not isinstance(improvement, ImprovementOutput) or not isinstance(nutrition, NutritionOutput):
            raise ValueError("The guidance agents returned an unexpected response.")
        _validate_advice_ids(tests, improvement)
        _validate_advice_ids(tests, nutrition)
        nutrition = _force_nutrition_suppression(
            nutrition, analysis.findings, patient, report_text, intake.pregnancy_mentioned
        )

        yield _event(StreamEvent(event="agent_start", agent="safety"))
        safety_payload = json.dumps(
            {
                "findings": [finding.model_dump() for finding in analysis.findings],
                "improvement": improvement.model_dump(),
                "nutrition": nutrition.model_dump(),
            },
            ensure_ascii=False,
        )
        safety: SafetyOutput = await call_json(
            "Safety", _safety_prompt(), safety_payload, SafetyOutput
        )
        _validate_advice_ids(
            tests,
            ImprovementOutput(
                suggestions=safety.suggestions,
                doctor_questions=safety.doctor_questions,
                general_suggestions=safety.general_suggestions,
            ),
        )
        safety_nutrition = _force_nutrition_suppression(
            safety.nutrition,
            analysis.findings,
            patient,
            report_text,
            intake.pregnancy_mentioned,
        )
        urgent = safety.urgent_banner or any(f.urgent_flag for f in analysis.findings)
        escalation = safety.escalation_flag or urgent
        yield _event(
            StreamEvent(
                event="agent_done",
                agent="safety",
                preview=f"Safety review recorded {len(safety.changes)} change(s).",
            )
        )

        yield _event(StreamEvent(event="agent_start", agent="summary"))
        summary_payload = json.dumps(
            {
                "tests": [test.model_dump() for test in tests],
                "findings": [finding.model_dump() for finding in analysis.findings],
                "approved_guidance": {
                    "suggestions": [item.model_dump() for item in safety.suggestions],
                    "doctor_questions": [item.model_dump() for item in safety.doctor_questions],
                    "general_suggestions": safety.general_suggestions,
                    "nutrition": safety_nutrition.model_dump(),
                    "safety_changes": safety.changes,
                },
                "urgent_banner": urgent,
                "safety_note": SAFETY_NOTE,
            },
            ensure_ascii=False,
        )
        summary: SummaryOutput = await call_json(
            "Summary", _summary_prompt(), summary_payload, SummaryOutput
        )
        _validate_summary(summary, tests, safety, safety_nutrition)
        yield _event(
            StreamEvent(
                event="agent_done",
                agent="summary",
                preview="Prepared English and Roman Urdu summaries.",
            )
        )

        result = FinalResult(
            generated_at=datetime.now(timezone.utc).isoformat(),
            patient=patient,
            tests=tests,
            findings=analysis.findings,
            suggestions=safety.suggestions,
            doctor_questions=safety.doctor_questions,
            general_suggestions=safety.general_suggestions,
            nutrition=safety_nutrition,
            summary_english=summary.english,
            summary_roman_urdu=summary.roman_urdu,
            english_audio_script=summary.english_audio_script,
            roman_urdu_audio_script=summary.roman_urdu_audio_script,
            urdu_audio_script=summary.urdu_audio_script,
            safety_changes=safety.changes,
            urgent_banner=urgent,
            escalation_flag=escalation,
            general_ranges_used=any(f.range_source == "general" for f in analysis.findings),
            normal_test_ids=[
                f.test_id for f in analysis.findings if f.status == "normal"
            ],
            concern_test_ids=[
                f.test_id for f in analysis.findings if f.status != "normal"
            ],
            missing_fields=missing_fields,
            safety_note=SAFETY_NOTE,
        )
        yield _event(StreamEvent(event="final", result=result))
    except (ModelCallError, ValueError) as exc:
        yield _event(StreamEvent(event="error", message=str(exc)))
