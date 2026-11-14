# Parked: idea 5, meeting decision graph (checked 2026-11-14)

Status: parked (D-001). Kept in case the claims-and-evidence engine gets reused.

## Already shipping

- Acta (acta.ai): a decision log across meetings that records when a later
  meeting changes or reverses a decision ("decision drift"). Fields: decided by,
  owner, why, status, replaces. Says 4,000+ users and 27,000+ meetings.
- Sentra (sentra.app): "managed organization memory" from meetings, Slack,
  email, code and deals. "Maps who said what, why decisions shifted, and what
  commitments remain open." Flags contested decisions. Says it's built on MIT
  and Caltech research. Funding not found.
- PILOT (withpilot.ai): an executive decision log with alternatives, rationale
  and trade-offs. A newer decision on the same subject replaces the older one.
- Argumentree (argumentree.com): pro/con argument trees, but people type their
  arguments in before the meeting; it doesn't extract them from transcripts.
- Fireflies AskFred and Read AI search across meetings; Read AI builds a
  personal knowledge graph.
- Do-it-yourself versions: a Claude "decision-logger" skill (flags conflicts
  with past decisions), a "Meeting Contradiction Detector" skill, and prompts.

## Research

- MeetMap: real-time dialogue mapping with LLMs, arXiv 2502.01564.
- Anastasiou and De Liddo, "A Hybrid Human-AI Approach for Argument Map
  Creation From Transcripts", DELITE 2024 (aclanthology.org/2024.delite-1.6).

## Gaps we saw (limited search)

- Objections that were raised and never answered.
- Decisions whose underlying evidence later changed.
- Chinese-language meetings (Feishu, Tencent Meeting): searches returned nothing.
