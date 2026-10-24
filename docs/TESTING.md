# Testing Guide

## Local Services

### Frontend

From the `frontend` directory:

```bash
npm run dev
```

### Backend

From the `backend` directory:

```bash
uv run uvicorn main:app --reload
```

Apply database migrations when needed:

```bash
uv run alembic upgrade head
```

## Manual Smoke Test

- [ ] Frontend opens successfully.
- [ ] Backend health/root endpoint responds.
- [ ] Student can sign in.
- [ ] Student sees available assessments.
- [ ] Student can open an assessment.
- [ ] Multiple-choice answers advance correctly.
- [ ] Text answers can be submitted.
- [ ] Results show correct and incorrect answers.
- [ ] Student progress/grades load.
- [ ] Teacher can sign in.
- [ ] Teacher can generate or publish an assessment.
- [ ] Teacher can view the gradebook.

## UI Review Checklist

- [ ] Works at mobile and desktop widths.
- [ ] Keyboard focus is visible.
- [ ] Buttons have clear labels.
- [ ] Loading and empty states are understandable.
- [ ] Error messages explain what to do next.
- [ ] Text does not overflow or overlap.
- [ ] Color is not the only way information is communicated.

## Test Notes

Record date, environment, scenario, result, and related bug ID here when a manual test finds a problem.
