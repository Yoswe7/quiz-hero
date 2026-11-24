"""Verify: overshoot (41 -> 40) trims; undershoot (38 -> 40) tops up; count preserved."""
import asyncio

import app.services.ai_generator as ag
from app.services.ai_generator import generate_quiz
from app.schemas.ai import GeneratedQuiz


def run(coro):
    return asyncio.run(coro)


def mc(i, sec=None):
    d = {
        "question": f"Q{i} about the topic?",
        "quiz_type": "Multiple Choice",
        "options": ["a", "b", "c", "d"],
        "answer": "a",
    }
    if sec:
        d["section_name"] = sec
    return d


def tf(i, sec=None):
    d = {
        "question": f"T{i} statement?",
        "quiz_type": "True or False",
        "options": ["True", "False"],
        "answer": "True",
    }
    if sec:
        d["section_name"] = sec
    return d


# --- Test 1: overshoot (41 -> 40) ---------------------------------------
def test_overshoot():
    items = [mc(i) for i in range(41)]
    out = ag.validate_quiz_data([dict(i) for i in items], "Multiple Choice", question_count=40)
    print("overshoot via validate_quiz_data raises?", out is None)
    # validate_quiz_data raises; emulate the generate_quiz flow with fakes
    calls = {"n": 0}
    orig = ag.generate_structured

    async def fake(prompt, schema, task, **kw):
        calls["n"] += 1
        return GeneratedQuiz(items=[dict(i) for i in items])

    ag.generate_structured = fake
    try:
        qs = run(generate_quiz(topic="t", question_count=40, quiz_type="Multiple Choice"))
        assert len(qs) == 40, len(qs)
        assert all("question_number" not in q for q in qs)
        print(f"overshoot: OK len={len(qs)} calls={calls['n']}")
    finally:
        ag.generate_structured = orig


# --- Test 2: undershoot (38 -> 40, top-up of 2) --------------------------
def test_undershoot():
    calls = {"n": 0}
    orig = ag.generate_structured

    async def fake(prompt, schema, task, **kw):
        calls["n"] += 1
        if calls["n"] == 1:
            return GeneratedQuiz(items=[mc(i) for i in range(38)])
        # Top-up call: the two missing questions (39, 40 in expected order).
        return GeneratedQuiz(items=[mc(38), mc(39)])

    ag.generate_structured = fake
    try:
        qs = run(generate_quiz(topic="t", question_count=40, quiz_type="Multiple Choice"))
        assert len(qs) == 40, len(qs)
        assert calls["n"] == 2, calls
        assert all("question_number" not in q for q in qs)
        print(f"undershoot: OK len={len(qs)} calls={calls['n']}")
    finally:
        ag.generate_structured = orig


# --- Test 3: undershoot that stays short (fail after retries) ------------
def test_undershoot_unrecoverable():
    calls = {"n": 0}
    orig = ag.generate_structured

    async def fake(prompt, schema, task, **kw):
        calls["n"] += 1
        items = [mc(i) for i in range(38)]
        items[7]["question"] = ""  # invalid item inside the valid prefix
        return GeneratedQuiz(items=items)

    ag.generate_structured = fake
    try:
        try:
            run(generate_quiz(topic="t", question_count=40, quiz_type="Multiple Choice"))
            print("undershoot-stuck: ERROR expected failure")
        except ValueError as e:
            print(f"undershoot-stuck: OK -> {e}")
        print(f"undershoot-stuck: calls={calls['n']}")
    finally:
        ag.generate_structured = orig


# --- Test 4: mixed undershoot top-up --------------------------------------
def test_mixed_undershoot():
    calls = {"n": 0}
    orig = ag.generate_structured

    async def fake(prompt, schema, task, **kw):
        calls["n"] += 1
        if calls["n"] == 1:
            # 10 MC + 8 TF = 18 for an expected 20
            items = [mc(i, sec="Part I: Multiple Choice") for i in range(10)] + [
                tf(i, sec="Part II: True or False") for i in range(8)
            ]
            return GeneratedQuiz(items=items)
        # Top-up: the 2 missing TF items for Part II.
        return GeneratedQuiz(items=[
            tf(8, sec="Part II: True or False"),
            tf(9, sec="Part II: True or False"),
        ])

    ag.generate_structured = fake
    sections = [
        {"quiz_type": "Multiple Choice", "question_count": 10},
        {"quiz_type": "True or False", "question_count": 10},
    ]
    try:
        qs = run(generate_quiz(topic="t", question_count=20, quiz_type="Mixed Assessment", sections=sections))
        assert len(qs) == 20, len(qs)
        assert calls["n"] == 2, calls
        assert sum(1 for q in qs if q["quiz_type"] == "True or False") == 10
        assert all("question_number" not in q for q in qs)
        print(f"mixed undershoot: OK len={len(qs)} calls={calls['n']}")
    finally:
        ag.generate_structured = orig


if __name__ == "__main__":
    test_overshoot()
    test_undershoot()
    test_undershoot_unrecoverable()
    test_mixed_undershoot()
    print("all done")
