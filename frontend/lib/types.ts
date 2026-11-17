export type PatientMetadata = {
  name: string | null;
  age: number | null;
  gender: string | null;
};

export type LabTest = {
  id: string;
  name: string;
  original_value: string;
  numeric_value: number | null;
  unit: string | null;
  reference_range: string | null;
};

export type Finding = {
  test_id: string;
  status: "low" | "normal" | "high" | "unknown";
  severity: "mild" | "moderate" | "severe" | "unknown";
  range_source: "report" | "general" | "none";
  deviation_percent: number | null;
  urgent_flag: boolean;
  explanation: string;
};

export type TestAdvice = {
  test_id: string;
  advice: string;
};

export type NutritionFinding = {
  test_id: string;
  eat_more: string[];
  eat_less: string[];
  habits: string[];
};

export type NutritionOutput = {
  suppressed: boolean;
  suppression_reason: string | null;
  findings: NutritionFinding[];
  combined_advice: string[];
};

export type SummaryContent = {
  headline: string;
  overview: string;
  fine_tests: string[];
  attention_tests: string[];
  next_steps: string[];
  finding_explanations: TestAdvice[];
  suggestions: TestAdvice[];
  doctor_questions: TestAdvice[];
  general_suggestions: string[];
  nutrition: NutritionOutput;
  safety_changes: string[];
};

export type FinalResult = {
  generated_at: string;
  patient: PatientMetadata;
  tests: LabTest[];
  findings: Finding[];
  suggestions: TestAdvice[];
  doctor_questions: TestAdvice[];
  general_suggestions: string[];
  nutrition: NutritionOutput;
  summary_english: SummaryContent;
  summary_roman_urdu: SummaryContent;
  english_audio_script: string;
  roman_urdu_audio_script: string;
  urdu_audio_script: string;
  safety_changes: string[];
  urgent_banner: boolean;
  escalation_flag: boolean;
  general_ranges_used: boolean;
  normal_test_ids: string[];
  concern_test_ids: string[];
  missing_fields: Array<"name" | "age" | "gender">;
  safety_note: string;
};

export type StreamEvent = {
  event: "agent_start" | "agent_done" | "need_input" | "rejected" | "error" | "final";
  agent?: string;
  preview?: string;
  message?: string;
  result?: FinalResult;
};
