import pytest

from app.pipeline import (
    _force_nutrition_suppression,
    _validate_finding_ids,
    _validate_summary,
)
from app.schemas import (
    AnalysisOutput,
    Finding,
    LabTest,
    NutritionFinding,
    NutritionOutput,
    PatientMetadata,
    SafetyOutput,
    SummaryContent,
    SummaryOutput,
    TestAdvice as AdviceItem,
)


def test_analyzer_must_return_each_extracted_test_once() -> None:
    tests = [LabTest(id="t1", name="Glucose", original_value="120")]
    output = AnalysisOutput(
        findings=[
            Finding(
                test_id="t1",
                status="high",
                severity="mild",
                range_source="none",
                urgent_flag=False,
                explanation="Context is needed.",
            )
        ]
    )
    _validate_finding_ids(tests, output.findings)


def test_severe_finding_suppresses_nutrition_advice() -> None:
    nutrition = NutritionOutput(
        suppressed=False,
        findings=[
            NutritionFinding(
                test_id="t1",
                eat_more=["vegetables"],
                eat_less=[],
                habits=[],
            )
        ],
        combined_advice=["Eat a balanced diet."],
    )
    finding = Finding(
        test_id="t1",
        status="high",
        severity="severe",
        range_source="report",
        urgent_flag=False,
        explanation="Discuss promptly with a clinician.",
    )

    result = _force_nutrition_suppression(
        nutrition, [finding], PatientMetadata(), "Potassium result"
    )

    assert result.suppressed is True
    assert result.findings == []
    assert result.combined_advice == []


def test_pregnancy_mention_suppresses_nutrition_advice() -> None:
    nutrition = NutritionOutput(suppressed=False, findings=[], combined_advice=[])
    result = _force_nutrition_suppression(
        nutrition,
        [],
        PatientMetadata(),
        "",
        pregnancy_mentioned=True,
    )

    assert result.suppressed is True
    assert result.findings == []


def test_summary_must_include_a_translation_for_every_test() -> None:
    nutrition = NutritionOutput(suppressed=False, findings=[], combined_advice=[])
    test = LabTest(id="t1", name="Glucose", original_value="90")
    safety = SafetyOutput(
        suggestions=[],
        doctor_questions=[],
        general_suggestions=[],
        nutrition=nutrition,
        changes=[],
        urgent_banner=False,
        escalation_flag=False,
    )
    section = SummaryContent(
        headline="A summary",
        overview="General information.",
        fine_tests=[],
        attention_tests=[],
        next_steps=[],
        finding_explanations=[AdviceItem(test_id="t1", advice="Context matters.")],
        suggestions=[],
        doctor_questions=[],
        general_suggestions=[],
        nutrition=nutrition,
        safety_changes=[],
    )
    summary = SummaryOutput(
        english=section,
        roman_urdu=section.model_copy(update={"finding_explanations": []}),
        english_audio_script="",
        roman_urdu_audio_script="",
        urdu_audio_script="",
    )

    with pytest.raises(ValueError, match="explain every test"):
        _validate_summary(summary, [test], safety, nutrition)
