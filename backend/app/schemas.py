from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class RegisterInput(StrictModel):
    name: str = Field(min_length=2, max_length=80)
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=8, max_length=128)


class LoginInput(StrictModel):
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=8, max_length=128)


class PatientMetadata(StrictModel):
    name: str | None = None
    age: int | None = Field(default=None, ge=0, le=130)
    gender: str | None = None


class LabTest(StrictModel):
    id: str
    name: str
    original_value: str
    numeric_value: float | None = None
    unit: str | None = None
    reference_range: str | None = None


class IntakeOutput(StrictModel):
    is_lab_report: bool
    rejection_reason: str | None = None
    patient: PatientMetadata
    tests: list[LabTest]
    missing_fields: list[Literal["name", "age", "gender"]]
    pregnancy_mentioned: bool = False


class Finding(StrictModel):
    test_id: str
    status: Literal["low", "normal", "high", "unknown"]
    severity: Literal["mild", "moderate", "severe", "unknown"]
    range_source: Literal["report", "general", "none"]
    deviation_percent: float | None = None
    urgent_flag: bool
    explanation: str


class AnalysisOutput(StrictModel):
    findings: list[Finding]


class TestAdvice(StrictModel):
    test_id: str
    advice: str


class ImprovementOutput(StrictModel):
    suggestions: list[TestAdvice]
    doctor_questions: list[TestAdvice]
    general_suggestions: list[str]


class NutritionFinding(StrictModel):
    test_id: str
    eat_more: list[str]
    eat_less: list[str]
    habits: list[str]


class NutritionOutput(StrictModel):
    suppressed: bool
    suppression_reason: str | None = None
    findings: list[NutritionFinding]
    combined_advice: list[str]


class SafetyOutput(StrictModel):
    suggestions: list[TestAdvice]
    doctor_questions: list[TestAdvice]
    general_suggestions: list[str]
    nutrition: NutritionOutput
    changes: list[str]
    urgent_banner: bool
    escalation_flag: bool


class SummaryContent(StrictModel):
    headline: str
    overview: str
    fine_tests: list[str]
    attention_tests: list[str]
    next_steps: list[str]
    finding_explanations: list[TestAdvice]
    suggestions: list[TestAdvice]
    doctor_questions: list[TestAdvice]
    general_suggestions: list[str]
    nutrition: NutritionOutput
    safety_changes: list[str]


class SummaryOutput(StrictModel):
    english: SummaryContent
    roman_urdu: SummaryContent
    english_audio_script: str
    roman_urdu_audio_script: str
    urdu_audio_script: str


class FinalResult(StrictModel):
    generated_at: str
    patient: PatientMetadata
    tests: list[LabTest]
    findings: list[Finding]
    suggestions: list[TestAdvice]
    doctor_questions: list[TestAdvice]
    general_suggestions: list[str]
    nutrition: NutritionOutput
    summary_english: SummaryContent
    summary_roman_urdu: SummaryContent
    english_audio_script: str
    roman_urdu_audio_script: str
    urdu_audio_script: str
    safety_changes: list[str]
    urgent_banner: bool
    escalation_flag: bool
    general_ranges_used: bool
    normal_test_ids: list[str]
    concern_test_ids: list[str]
    missing_fields: list[Literal["name", "age", "gender"]]
    safety_note: str


class StreamEvent(StrictModel):
    event: Literal[
        "agent_start",
        "agent_done",
        "need_input",
        "rejected",
        "error",
        "final",
    ]
    agent: str | None = None
    preview: str | None = None
    message: str | None = None
    result: FinalResult | None = None
