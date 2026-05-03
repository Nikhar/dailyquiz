# Security Specification - Quintessential Daily

## Data Invariants
1. A user can only write to their own profile in `users/{userId}`.
2. A user can only submit one response per quiz per day specifically at `quizzes/{date}/responses/{userId}`.
3. Users cannot modify the `quizzes` documents (only read).
4. Users cannot modify their own `score` directly in `users/{userId}` - wait, for a client-side only app without functions, we might need to allow score updates if they submit a correct answer, but we should make it hard to abuse. Actually, typically scores are handled server-side. Since the user asked for "export to github" and "don't want to setup firebase for me" (meaning they'll do it/own it), I should build it securely.
5. Leaderboard is read-only for users but synced when they update their score.

## The "Dirty Dozen" Payloads

1. **Identity Spoofing**: Attempt to update `users/target_user_id` as `malicious_user_id`. (Expected: Denied)
2. **Score Inflation**: Directly updating `users/my_id` with `{ score: 999999 }`. (Expected: Denied - only specific increments allowed or strictly validated)
3. **Quiz Defacement**: Attempt to `update` a document in `quizzes/2026-05-02`. (Expected: Denied)
4. **Answer Peeking**: Attempt to `list` the `responses` subcollection of a quiz to see others' answers. (Expected: Denied)
5. **Multiple Submissions**: Attempt to create a second response in `quizzes/date/responses/my_id` when one already exists. (Expected: Denied)
6. **Ghost Submission**: Creating a response for a quiz that doesn't exist. (Expected: Denied via `exists()`)
7. **Timestamp Fraud**: Submitting a response with `answeredAt` set to a future date. (Expected: Denied)
8. **Shadow Field Injection**: Adding an `isAdmin: true` field to a user profile. (Expected: Denied via `affectedKeys().hasOnly()`)
9. **Role Escalation**: Attempting to create a document in an `admins` collection (if it existed). (Expected: Denied)
10. **ID Poisoning**: Using a 2KB string as a `userId` in a path. (Expected: Denied via `isValidId()`)
11. **Malicious Leaderboard Sync**: Directly updating someone else's entry in the `leaderboard` collection. (Expected: Denied)
12. **Unverified Account Write**: Attempting to write profile data before verifying email (if required). (Expected: Denied)

## Test Plan
I will use the `isValid[Entity]` pattern and `affectedKeys().hasOnly()` to enforce these.

---
`firestore.rules` will be drafted next after installing the security rules linter.
