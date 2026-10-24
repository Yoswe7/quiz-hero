# Decisions

Record decisions that affect architecture, UX, or long-term maintenance.

## Decision Template

```md
## DEC-001: Short decision title

- Date: YYYY-MM-DD
- Status: Accepted / Superseded

### Context

What problem or constraint led to this decision?

### Decision

What are we choosing?

### Consequences

What becomes easier, harder, or different because of this choice?
```

## DEC-001: Keep Student and Teacher Flows Separate

- Date: 2026-10-24
- Status: Accepted

### Context

Students and teachers have different goals, permissions, and information needs.

### Decision

Keep student quiz-player logic and teacher assessment-engine logic in separate feature areas while sharing only genuinely common components and types.

### Consequences

The codebase has clearer ownership boundaries and safer role-specific changes. Some UI patterns may need deliberate shared abstractions later.

## DEC-002: Use Learner-Centered Language

- Date: 2026-10-24
- Status: Accepted

### Context

The student interface used technical and institutional language that made a learning activity feel like a compliance workflow.

### Decision

Prefer plain, supportive language that explains the learner's next action and what they can learn from the result.

### Consequences

Student copy should be reviewed as part of UX work, not treated as incidental implementation text.
