from datetime import date, timedelta

def calculate_next_review(
    quality: int, ease_factor: float, interval_days: int, repetitions: int
) -> tuple[float, int, int, date]:
    """Standard SM-2. quality is 0-5."""
    new_ef = ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    new_ef = max(new_ef, 1.3)

    if quality < 3:
        new_repetitions = 0
        new_interval = 1
    else:
        new_repetitions = repetitions + 1
        if repetitions == 0:
            new_interval = 1
        elif repetitions == 1:
            new_interval = 6
        else:
            new_interval = round(interval_days * new_ef)    

    next_date = date.today() + timedelta(days=new_interval)
    return new_ef, new_interval, new_repetitions, next_date


def correctness_to_quality(is_correct: bool) -> int:
    """Simplest mapping until confidence rating exists."""
    return 5 if is_correct else 2