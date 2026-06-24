---
description: "Recursively review the new spec for inconsistencies and fix the unambiguous ones until clean or blocked on the user"
---

# Specify Review Loop

Run after `/speckit-specify`. Recursively review the just-written `spec.md` for
inconsistencies, ambiguity, and gaps, fixing the **unambiguous** issues on each
pass, and **stop** when either nothing fixable remains or an issue needs the
user's direct attention.

See the `speckit-specify-review-loop` skill for the full procedure. In short:

1. Review the spec (internal consistency, vague/placeholder language, missing
   acceptance criteria, terminology drift, constitution alignment).
2. Fix every issue that has a single obvious correct resolution.
3. Repeat from step 1 on the updated spec.
4. **Terminate** when a pass finds no new unambiguous fixes, OR when the only
   remaining issues need a product/user decision — then surface those for the
   user. Always terminate (bounded passes); never loop indefinitely.
