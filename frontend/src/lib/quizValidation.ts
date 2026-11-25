export interface TimerValidationResult {
  valid: boolean;
  value: number | null;
  error: string | null;
}

/**
 * Validates an optional per-question timer input string as a positive integer (>= 1).
 * Empty strings are valid and represent an untimed assessment (null).
 */
export function validateQuestionTimeLimitSeconds(
  raw: string,
  hasBadInput = false
): TimerValidationResult {
  if (hasBadInput) {
    return {
      valid: false,
      value: null,
      error: "Error: Enter a whole number of 1 or more seconds, or leave blank for untimed.",
    };
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return { valid: true, value: null, error: null };
  }

  if (!/^\d+$/.test(trimmed)) {
    return {
      valid: false,
      value: null,
      error: "Error: Time limit must be a positive whole number of seconds (1 or more).",
    };
  }

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return {
      valid: false,
      value: null,
      error: "Error: Time limit must be at least 1 second, or leave blank for untimed.",
    };
  }

  return { valid: true, value: parsed, error: null };
}
