"""Parse messy raw ingredient strings into a clean display name.

Raw lines from imported recipes look like:
    "1 (8-ounce) box chicken-flavored crackers for serving (optional)"
    "¾ cup hot pepper sauce (such as frank's redhot)"
    "2 (10-ounce) cans chunk chicken, drained"
    "1 ½ cups shredded cheddar cheese"

We want:
    "chicken-flavored crackers"
    "hot pepper sauce"
    "chunk chicken"
    "shredded cheddar cheese"

Good enough for dedup keys, cart search URLs, and grocery shelf display.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Optional

# Unicode fractions → ascii range. Handles common vulgar fractions.
_UNICODE_FRACTIONS = {
    "¼": "1/4", "½": "1/2", "¾": "3/4",
    "⅓": "1/3", "⅔": "2/3",
    "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8",
    "⅕": "1/5", "⅖": "2/5", "⅗": "3/5", "⅘": "4/5",
    "⅙": "1/6", "⅚": "5/6",
}

# Units we strip (only when they're standalone words in the leading quantity region)
_UNITS = {
    "teaspoon", "teaspoons", "tsp", "tsps",
    "tablespoon", "tablespoons", "tbsp", "tbsps", "tbs",
    "cup", "cups", "c",
    "pint", "pints", "pt",
    "quart", "quarts", "qt",
    "gallon", "gallons", "gal",
    "ounce", "ounces", "oz",
    "pound", "pounds", "lb", "lbs",
    "gram", "grams", "g",
    "kilogram", "kilograms", "kg",
    "milliliter", "milliliters", "ml",
    "liter", "liters", "l",
    "pinch", "pinches",
    "dash", "dashes",
    "clove", "cloves",
    "can", "cans",
    "jar", "jars",
    "package", "packages", "pkg", "pkgs",
    "box", "boxes",
    "bottle", "bottles",
    "bunch", "bunches",
    "sprig", "sprigs",
    "stick", "sticks",
    "slice", "slices",
    "head", "heads",
    "piece", "pieces",
    "bag", "bags",
    "container", "containers",
}

# Trailing preparation descriptors we drop.
_PREP_WORDS = {
    "softened", "melted", "chilled", "cold", "warm", "hot",
    "drained", "rinsed", "patted dry",
    "chopped", "diced", "minced", "sliced", "cubed", "grated", "shredded",
    "crushed", "peeled", "seeded", "cored", "stemmed",
    "room temperature", "at room temperature",
    "to taste", "plus more to taste",
    "optional", "for serving", "for garnish", "for garnishing",
    "divided", "packed", "loosely packed", "firmly packed",
}

# Paren content we always drop: "(optional)", "(such as ...)", "(about 2 oz)", etc.
_PAREN_RE = re.compile(r"\([^)]*\)")

# Leading quantity/unit region: digits, fractions, decimals, spaces, hyphens, 'x'/'X', units
_LEADING_QTY_RE = re.compile(
    r"""^\s*
        (?:                                    # one or more quantity tokens
          (?:\d+(?:[.,]\d+)?)                  # 1, 1.5, 1,5
          | (?:\d+\s*/\s*\d+)                  # 1/2
          | (?:to|or|-|–|—)                    # ranges/alternatives
        )
        (?:\s*(?:\d+(?:[.,]\d+)?|\d+\s*/\s*\d+|to|or|-|–|—))*
        \s*
    """,
    re.VERBOSE | re.IGNORECASE,
)

_LEADING_UNIT_RE = re.compile(
    r"""^\s*
        (?:of\s+)?
        ({units})\b
        \.?\s*
        (?:of\s+)?
    """.format(units="|".join(sorted(_UNITS, key=len, reverse=True))),
    re.VERBOSE | re.IGNORECASE,
)

# Trailing comma-separated modifiers: "2 cans chunk chicken, drained" → strip ", drained"
_TRAILING_MOD_RE = re.compile(r",\s*([^,]+)$")


def _normalize_fractions(text: str) -> str:
    for k, v in _UNICODE_FRACTIONS.items():
        text = text.replace(k, f" {v} ")
    return unicodedata.normalize("NFKC", text)


def clean_ingredient_name(raw: Optional[str]) -> str:
    """Extract a clean display name from a raw ingredient line.

    Returns lowercase string suitable for display and for dedup keys.
    Returns empty string for falsy/unusable input.
    """
    if not raw:
        return ""

    text = _normalize_fractions(str(raw)).strip()

    # Drop parentheticals (optional, such as ..., 8-ounce, etc.)
    text = _PAREN_RE.sub(" ", text)

    # Strip leading quantities like "1", "1 1/2", "1-2", "2 to 3"
    # Run the unit-strip and qty-strip in alternation a couple of times to catch
    # "2 (10-ounce) cans chunk chicken" → (paren already gone) → "2 cans chunk chicken"
    for _ in range(3):
        new = _LEADING_QTY_RE.sub("", text)
        new = _LEADING_UNIT_RE.sub("", new)
        if new == text:
            break
        text = new

    # Trim trailing prep descriptors after the last comma
    # (only if the trailing chunk is entirely in _PREP_WORDS; otherwise keep — it might be meaningful)
    for _ in range(2):
        m = _TRAILING_MOD_RE.search(text)
        if not m:
            break
        tail = m.group(1).strip().lower()
        # Strip only if tail is a known prep-word (or a sequence of them)
        tail_tokens = [t.strip() for t in tail.split(" ") if t.strip()]
        if tail in _PREP_WORDS or all(t in _PREP_WORDS for t in tail_tokens):
            text = text[: m.start()]
        else:
            break

    # Also drop trailing " for serving", " for garnish", etc. without a comma
    for phrase in ("for serving", "for garnish", "for garnishing", "to taste"):
        text = re.sub(rf"\b{re.escape(phrase)}\b.*$", "", text, flags=re.IGNORECASE)

    # Squash whitespace and punctuation
    text = re.sub(r"\s+", " ", text).strip(" ,.-–—")
    return text.lower()
