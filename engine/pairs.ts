import { round } from "./text";
import type { ClaimRelation, PairClaimSummary, PairVerdict, ResponseInput } from "./types";

/** Aggregate claim-level relations into one summary per response pair. */
export function summarizePairs(responses: ResponseInput[], relations: ClaimRelation[]): PairClaimSummary[] {
  const out: PairClaimSummary[] = [];
  for (let i = 0; i < responses.length; i++) {
    for (let j = i + 1; j < responses.length; j++) {
      const a = responses[i].id, b = responses[j].id;
      const rel = relations.filter(
        (r) => (r.responseAId === a && r.responseBId === b) || (r.responseAId === b && r.responseBId === a)
      );
      const count = (k: ClaimRelation["relation"]) => rel.filter((r) => r.relation === k).length;
      const agreement = count("agreement");
      const partial = count("partial_agreement");
      const contradiction = count("contradiction");
      const other = rel.length - agreement - partial - contradiction;
      const decisive = agreement + partial + contradiction;
      const agreementScore = decisive === 0 ? null : round((agreement + 0.5 * partial) / decisive, 4);
      let verdict: PairVerdict = "no_decisive_evidence";
      if (contradiction > 0) verdict = "contradiction";
      else if (agreement > 0) verdict = "agreement";
      else if (partial > 0) verdict = "partial";
      out.push({ responseAId: a, responseBId: b, agreement, partial, contradiction, other, agreementScore, verdict });
    }
  }
  return out;
}
