from __future__ import annotations

import re
import unicodedata
from difflib import SequenceMatcher
from collections.abc import Sequence

from .contracts import (
    CanonicalMatch,
    EstimateDrawingProposal,
    EstimateTaxonomy,
    TaxonomyTerm,
)


_SUFFIXES = frozenset({"plan", "layout", "detail"})
_WHITESPACE = re.compile(r"\s+")
_PUNCTUATION = re.compile(r"[^\w\s]+", re.UNICODE)
_ACRONYM = re.compile(r"^(?:\s*[a-zA-Z]\s*\.?){2,}\s*$")
_FUZZY_THRESHOLD = 0.84
_WINNING_MARGIN = 0.08
_MAX_MATCH_TOKENS = 12


def normalize_drawing_title(raw: str) -> str:
    normalized = unicodedata.normalize("NFKC", raw).casefold().strip()
    if _ACRONYM.fullmatch(normalized):
        normalized = normalized.replace(".", "")
    normalized = _PUNCTUATION.sub(" ", normalized)
    normalized = _WHITESPACE.sub(" ", normalized).strip()
    tokens = normalized.split()
    while tokens and tokens[-1] in _SUFFIXES:
        tokens.pop()
    return " ".join(tokens)


def classify_estimate_drawing(
    detected_title: str,
    taxonomy: EstimateTaxonomy,
) -> EstimateDrawingProposal:
    normalized_title = normalize_drawing_title(detected_title)
    return EstimateDrawingProposal(
        detected_title=" ".join(detected_title.split()),
        room=match_taxonomy_term(normalized_title, taxonomy.rooms),
        scope=match_taxonomy_term(normalized_title, taxonomy.scopes),
    )


def match_taxonomy_term(
    normalized_title: str,
    terms: Sequence[TaxonomyTerm],
) -> CanonicalMatch:
    title = normalize_drawing_title(normalized_title)
    scored = [
        _score_term(title, term)
        for term in terms
    ]
    candidates = [candidate for candidate in scored if candidate[1] >= _FUZZY_THRESHOLD]
    if not candidates:
        return CanonicalMatch(None, 0.0, (), False)

    candidates.sort(key=lambda candidate: (-candidate[1], -candidate[2], candidate[0].id))
    winner, winning_score, winning_specificity, winning_evidence = candidates[0]
    ambiguous_candidates = tuple(
        candidate
        for candidate in candidates
        if winning_score - candidate[1] < _WINNING_MARGIN
        and candidate[2] == winning_specificity
    )
    if len(ambiguous_candidates) > 1:
        evidence = tuple(
            candidate[3]
            for candidate in ambiguous_candidates
        )
        return CanonicalMatch(None, winning_score, evidence, True)
    return CanonicalMatch(winner.id, winning_score, (winning_evidence,), False)


def _score_term(title: str, term: TaxonomyTerm) -> tuple[TaxonomyTerm, float, int, str]:
    best_score = 0.0
    best_specificity = 0
    best_evidence = ""
    for value in (term.label, *term.aliases):
        normalized = normalize_drawing_title(value)
        if not normalized:
            continue
        score, specificity = _phrase_similarity(title, normalized)
        if (
            score > best_score
            or (score == best_score and specificity > best_specificity)
            or (
                score == best_score
                and specificity == best_specificity
                and value < best_evidence
            )
        ):
            best_score = score
            best_specificity = specificity
            best_evidence = value.casefold()
    return term, best_score, best_specificity, best_evidence


def _phrase_similarity(title: str, phrase: str) -> tuple[float, int]:
    if _contains_phrase(title, phrase):
        return 1.0, len(phrase.split())
    title_tokens = title.split()
    phrase_tokens = phrase.split()[:_MAX_MATCH_TOKENS]
    if not title_tokens or not phrase_tokens:
        return 0.0, 0
    shortest = max(1, len(phrase_tokens) - 1)
    longest = min(
        len(title_tokens),
        _MAX_MATCH_TOKENS,
        len(phrase_tokens) + 1,
    )
    return max(
        SequenceMatcher(None, " ".join(title_tokens[index:index + length]), phrase).ratio()
        for length in range(shortest, longest + 1)
        for index in range(0, len(title_tokens) - length + 1)
    ), 0


def _contains_phrase(title: str, phrase: str) -> bool:
    return f" {phrase} " in f" {title} "
