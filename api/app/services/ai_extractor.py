"""AI-powered recipe extraction using Claude API.

Extracts structured recipe data from HTML pages when structured data (schema.org)
is not available. Also handles recipe enrichment (auto-tagging proteins, cuisine, etc.)
"""

import json
import logging
from typing import Optional
import anthropic
from app.config import get_settings

logger = logging.getLogger("dukecook.services.ai_extractor")


async def extract_recipe_from_html(html: str, url: str) -> Optional[dict]:
    """Use Claude to extract recipe data from raw HTML.

    Returns a dict matching our recipe schema, or None on failure.
    """
    settings = get_settings()
    if not settings.anthropic_api_key:
        logger.error("ANTHROPIC_API_KEY not configured — cannot extract recipe from HTML")
        return None

    logger.info(f"AI extracting recipe from URL: {url}", extra={
        "extra_data": {"url": url, "html_length": len(html)}
    })

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    # Truncate HTML to avoid token limits
    max_html = 50000
    truncated_html = html[:max_html] if len(html) > max_html else html
    if len(html) > max_html:
        logger.info(f"Truncated HTML from {len(html)} to {max_html} chars")

    prompt = f"""Extract the recipe from this webpage HTML. Return a JSON object with these fields:

{{
  "title": "Recipe title",
  "description": "Full description of the dish — include what makes it special, flavor notes, etc.",
  "prep_time_min": 15,
  "cook_time_min": 30,
  "total_time_min": 45,
  "servings": 4,
  "cuisine": "Italian",
  "difficulty": "easy|medium|hard",
  "image_url": "URL of the main recipe image",
  "notes": "All tips, author notes, variations, make-ahead instructions, storage tips, serving suggestions — everything beyond the core recipe",
  "ingredients": [
    {{"raw_text": "2 cups all-purpose flour", "quantity": 2, "unit": "cups", "name": "all-purpose flour", "preparation": "", "group": ""}},
    {{"raw_text": "1 lb chicken breast, diced", "quantity": 1, "unit": "lb", "name": "chicken breast", "preparation": "diced", "group": ""}}
  ],
  "steps": [
    {{"instruction": "Preheat oven to 375°F.", "duration_minutes": null, "timer_label": ""}},
    {{"instruction": "In a large skillet, heat olive oil over medium-high heat. Sear chicken for 3 minutes per side until golden brown. Don't move the chicken while it sears — you want a good crust.", "duration_minutes": 6, "timer_label": "Sear chicken"}}
  ],
  "tags": ["italian", "chicken", "easy", "weeknight"]
}}

CRITICAL RULES — TRANSCRIBE, DO NOT REWRITE:

You are a TRANSCRIBER, not an editor. Your job is to faithfully copy the recipe, NOT to clean it up or make it concise.

INGREDIENTS:
- Extract EVERY ingredient exactly as written, including optional items, garnishes, "for serving" items, and "to taste" mentions.
- Keep every parenthetical and qualifier ("(such as Frank's RedHot)", "(8-ounce)", "softened", "drained", "at room temperature"). These belong in raw_text.
- Preserve ingredient groupings ("For the sauce", "For the topping") in the "group" field.

STEPS — THIS IS WHERE EXTRACTION FAILS MOST OFTEN:
- Transcribe EVERY step with FULL DETAIL. Treat the original as canonical — if the source has 12 numbered steps, you output 12 steps. NEVER merge two source steps into one.
- Keep the EXACT wording. Do NOT paraphrase. Do NOT shorten.
- Preserve EVERY temperature ("preheat to 375°F"), time ("cook for 4 minutes"), and quantity ("add the remaining 2 tablespoons").
- Preserve EVERY visual cue ("until golden brown", "until the edges pull away from the pan", "until a toothpick comes out clean"), texture cue ("smooth and elastic", "soft peaks form", "shaggy dough"), and technique tip ("don't overmix", "work quickly while the dough is cold", "don't move the chicken while it sears").
- Preserve EVERY parenthetical aside, warning, and "tip" embedded in a step. They are NOT optional.
- If a source step contains multiple sentences, keep ALL of them. Example: "Season the chicken with salt. Let it rest for 10 minutes. This dry-brine step makes a huge difference." → all three sentences must be in the same step.
- Do NOT collapse "Combine A, B, C in a bowl. Whisk until smooth. Set aside." into "Whisk A, B, C together." — keep the original three sentences.
- Do NOT drop "set aside", "reserve for later", "meanwhile", or other connective instructions.
- Do NOT drop encouragement or tone ("don't worry if it looks runny — it'll set up", "this is the most important step!").

NOTES:
- Include ALL author headnotes, variations, substitutions, make-ahead instructions, storage instructions, freezing instructions, reheating instructions, equipment notes, and serving suggestions in the "notes" field. These usually appear above the ingredient list or below the steps. Capture them verbatim.

OTHER:
- Parse quantities as numbers (1.5, 0.25, etc.)
- If a step has a clear timer (e.g., "cook for 10 minutes"), set duration_minutes and timer_label.
- Tags should include: cuisine, primary protein, difficulty, and any other relevant categories.
- If info is missing, use null.
- Return ONLY the JSON, no other text.

SELF-CHECK BEFORE RESPONDING:
- Count the numbered/bulleted steps in the source. Your "steps" array length must match (within ±1 if the source uses sub-bullets).
- Reread your steps. If any source detail is missing, add it back before returning.

URL: {url}

HTML:
{truncated_html}"""

    try:
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=16384,
            messages=[{"role": "user", "content": prompt}],
        )

        text = response.content[0].text.strip()

        # Strip markdown code fences if present
        if text.startswith("```"):
            text = text.split("\n", 1)[1]  # Remove first line
            if text.endswith("```"):
                text = text[:-3]
            elif "```" in text:
                text = text[:text.rfind("```")]
            text = text.strip()

        recipe_data = json.loads(text)

        logger.info(
            f"AI extracted recipe: {recipe_data.get('title', 'Unknown')}",
            extra={
                "extra_data": {
                    "url": url,
                    "title": recipe_data.get("title"),
                    "ingredient_count": len(recipe_data.get("ingredients", [])),
                    "step_count": len(recipe_data.get("steps", [])),
                    "tokens_in": response.usage.input_tokens,
                    "tokens_out": response.usage.output_tokens,
                }
            },
        )
        return recipe_data

    except json.JSONDecodeError as e:
        logger.error(f"AI returned invalid JSON: {e}", extra={
            "extra_data": {"url": url, "response_text": text[:500] if text else ""}
        })
        return None
    except anthropic.APIError as e:
        logger.error(f"Anthropic API error: {e}", exc_info=True, extra={
            "extra_data": {"url": url}
        })
        return None
    except Exception as e:
        logger.error(f"Unexpected error in AI extraction: {e}", exc_info=True, extra={
            "extra_data": {"url": url}
        })
        return None


def _compress_image_for_api(image_data: bytes, media_type: str, max_base64_bytes: int = 4_800_000) -> tuple[bytes, str]:
    """Resize/compress an image so its base64 encoding stays under the API limit.

    Anthropic's API has a 5MB base64 limit. We target 4.8MB to leave headroom.
    Returns (compressed_bytes, media_type).
    """
    import base64
    from io import BytesIO
    from PIL import Image

    # Check if already small enough
    encoded_size = len(image_data) * 4 // 3  # base64 inflation estimate
    if encoded_size <= max_base64_bytes:
        return image_data, media_type

    img = Image.open(BytesIO(image_data))

    # Convert RGBA/palette to RGB for JPEG output
    if img.mode in ("RGBA", "P", "LA"):
        img = img.convert("RGB")

    # Iteratively reduce: first try quality reduction, then resize
    for quality in (85, 70, 55):
        buf = BytesIO()
        img.save(buf, format="JPEG", quality=quality, optimize=True)
        data = buf.getvalue()
        if len(data) * 4 // 3 <= max_base64_bytes:
            logger.info(f"Compressed image: quality={quality}, {len(image_data)} → {len(data)} bytes")
            return data, "image/jpeg"

    # Still too big — resize down while maintaining aspect ratio
    for scale in (0.75, 0.5, 0.35):
        resized = img.resize((int(img.width * scale), int(img.height * scale)), Image.LANCZOS)
        buf = BytesIO()
        resized.save(buf, format="JPEG", quality=75, optimize=True)
        data = buf.getvalue()
        if len(data) * 4 // 3 <= max_base64_bytes:
            logger.info(f"Resized image: scale={scale}, {img.width}x{img.height} → {resized.width}x{resized.height}, {len(image_data)} → {len(data)} bytes")
            return data, "image/jpeg"

    # Final fallback — aggressive resize
    resized = img.resize((int(img.width * 0.25), int(img.height * 0.25)), Image.LANCZOS)
    buf = BytesIO()
    resized.save(buf, format="JPEG", quality=60, optimize=True)
    data = buf.getvalue()
    logger.warning(f"Aggressively resized image: {img.width}x{img.height} → {resized.width}x{resized.height}, {len(image_data)} → {len(data)} bytes")
    return data, "image/jpeg"


async def extract_recipe_from_image(image_data: bytes, media_type: str, filename: str = "") -> Optional[dict]:
    """Use Claude Vision to extract recipe data from a photo.

    Handles photos of cookbook pages, handwritten recipes, recipe cards,
    magazine clippings, screenshots, etc.

    Returns a dict matching our recipe schema, or None on failure.
    """
    settings = get_settings()
    if not settings.anthropic_api_key:
        logger.error("ANTHROPIC_API_KEY not configured — cannot extract recipe from image")
        return None

    import base64

    # Compress image if needed to stay under Anthropic's 5MB base64 limit
    image_data, media_type = _compress_image_for_api(image_data, media_type)
    encoded = base64.standard_b64encode(image_data).decode("utf-8")

    logger.info(f"AI extracting recipe from image: {filename} ({len(image_data)} bytes, {media_type})")

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    prompt = """Look at this image of a recipe. Extract ALL the recipe information you can see and return it as a JSON object.

{
  "title": "Recipe title",
  "description": "Full description of the dish",
  "prep_time_min": 15,
  "cook_time_min": 30,
  "total_time_min": 45,
  "servings": 4,
  "cuisine": "Italian",
  "difficulty": "easy|medium|hard",
  "notes": "All tips, author notes, variations, storage tips, serving suggestions — everything beyond the core recipe",
  "ingredients": [
    {"raw_text": "2 cups all-purpose flour", "quantity": 2, "unit": "cups", "name": "all-purpose flour", "preparation": "", "group": ""},
    {"raw_text": "1 lb chicken breast, diced", "quantity": 1, "unit": "lb", "name": "chicken breast", "preparation": "diced", "group": ""}
  ],
  "steps": [
    {"instruction": "Preheat oven to 375°F.", "duration_minutes": null, "timer_label": ""},
    {"instruction": "In a large skillet, heat olive oil over medium-high heat. Sear chicken for 3 minutes per side until golden brown. Don't move the chicken while it sears — you want a good crust.", "duration_minutes": 6, "timer_label": "Sear chicken"}
  ],
  "tags": ["italian", "chicken", "easy", "weeknight"]
}

CRITICAL RULES — TRANSCRIBE, DO NOT REWRITE:

You are a TRANSCRIBER, not an editor. Your job is to faithfully copy the recipe, NOT to clean it up or make it concise.

INGREDIENTS:
- Transcribe EVERY ingredient EXACTLY as written, including optional items, garnishes, "for serving" items, and "to taste" mentions.
- Keep every parenthetical and qualifier ("(such as Frank's RedHot)", "(8-ounce)", "softened", "drained", "at room temperature") in raw_text.
- Preserve ingredient groupings ("For the sauce") in the "group" field.

STEPS — THIS IS WHERE EXTRACTION FAILS MOST OFTEN:
- Transcribe EVERY step with FULL DETAIL. If the source has 12 numbered steps, output 12 steps. NEVER merge two source steps into one.
- Keep the EXACT wording. Do NOT paraphrase. Do NOT shorten.
- Preserve EVERY temperature, time, and quantity reference inside a step.
- Preserve EVERY visual cue ("until golden brown"), texture cue ("smooth and elastic"), and technique tip ("don't overmix", "work quickly").
- Preserve EVERY parenthetical aside, warning, or "tip" embedded in a step. They are NOT optional.
- Multi-sentence steps stay multi-sentence. All sentences from one source step belong in the same output step.
- Do NOT drop "set aside", "reserve", "meanwhile", or other connective instructions.

NOTES:
- Include ALL author headnotes, variations, substitutions, make-ahead, storage, freezing, reheating, equipment notes, and serving suggestions in the "notes" field — verbatim.

OTHER:
- Parse quantities as numbers (1.5, 0.25, etc.)
- Preserve ingredient groupings in the "group" field
- If a step has a timer, set duration_minutes and timer_label
- For handwritten recipes, do your best to read the handwriting
- If the image shows multiple recipes, extract only the main/first one
- If something is unclear, make your best guess and note it in the "notes" field
- If info is missing (no servings listed, etc.), use reasonable defaults
- Tags should include: cuisine, primary protein, difficulty, and any relevant categories
- Return ONLY the JSON, no other text

SELF-CHECK BEFORE RESPONDING:
- Count the numbered/bulleted steps visible in the image. Your "steps" array length must match.
- Reread your steps. If any source detail is missing, add it back before returning."""

    try:
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=16384,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": encoded,
                        },
                    },
                    {
                        "type": "text",
                        "text": prompt,
                    },
                ],
            }],
        )

        text = response.content[0].text.strip()

        # Strip markdown code fences if present
        if text.startswith("```"):
            text = text.split("\n", 1)[1]
            if text.endswith("```"):
                text = text[:-3]
            elif "```" in text:
                text = text[:text.rfind("```")]
            text = text.strip()

        recipe_data = json.loads(text)

        logger.info(
            f"AI extracted recipe from image: {recipe_data.get('title', 'Unknown')}",
            extra={
                "extra_data": {
                    "filename": filename,
                    "title": recipe_data.get("title"),
                    "ingredient_count": len(recipe_data.get("ingredients", [])),
                    "step_count": len(recipe_data.get("steps", [])),
                    "tokens_in": response.usage.input_tokens,
                    "tokens_out": response.usage.output_tokens,
                }
            },
        )
        return recipe_data

    except json.JSONDecodeError as e:
        logger.error(f"AI returned invalid JSON from image: {e}", extra={
            "extra_data": {"filename": filename, "response_text": text[:500] if 'text' in dir() else ""}
        })
        return None
    except anthropic.APIError as e:
        logger.error(f"Anthropic API error (image): {e}", exc_info=True)
        return None
    except Exception as e:
        logger.error(f"Unexpected error in image extraction: {e}", exc_info=True)
        return None


async def enrich_recipe_tags(recipe_data: dict) -> list[str]:
    """Use AI to generate appropriate tags for a recipe.

    Analyzes ingredients and title to auto-detect proteins, cuisine, dietary info.
    """
    settings = get_settings()
    if not settings.anthropic_api_key:
        logger.warning("No API key — skipping AI tag enrichment")
        return recipe_data.get("tags", [])

    title = recipe_data.get("title", "")
    ingredients = [i.get("raw_text", "") for i in recipe_data.get("ingredients", [])]

    logger.info(f"Enriching tags for: {title}")

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    try:
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=256,
            messages=[{
                "role": "user",
                "content": f"""Given this recipe, return a JSON array of tags. Include:
- Primary protein (chicken, beef, pork, salmon, shrimp, tofu, none/vegetarian)
- Cuisine (italian, mexican, thai, japanese, american, mediterranean, indian, etc.)
- Meal type (weeknight, weekend, date-night, meal-prep)
- Effort (easy, medium, hard)
- Any dietary labels (vegetarian, vegan, gluten-free, dairy-free, low-carb)
- Season (summer, winter, fall, spring) if clearly seasonal

Title: {title}
Ingredients: {', '.join(ingredients[:20])}

Return ONLY a JSON array of lowercase strings, nothing else."""
            }],
        )

        tags = json.loads(response.content[0].text.strip())
        logger.info(f"AI generated tags: {tags}", extra={
            "extra_data": {"title": title, "tags": tags}
        })
        return tags

    except Exception as e:
        logger.error(f"Tag enrichment failed: {e}", exc_info=True)
        return recipe_data.get("tags", [])


async def generate_taste_insights(
    user_name: str,
    ratings: list[dict],
    cooking_history: list[dict],
    preferences: dict,
) -> list[dict]:
    """Generate AI insights about a user's taste profile.

    Returns observations like "You love Mediterranean but rarely cook it."
    """
    settings = get_settings()
    if not settings.anthropic_api_key:
        logger.warning("No API key — cannot generate taste insights")
        return []

    logger.info(f"Generating taste insights for {user_name}", extra={
        "extra_data": {
            "rating_count": len(ratings),
            "history_count": len(cooking_history),
        }
    })

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    try:
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=512,
            messages=[{
                "role": "user",
                "content": f"""You're analyzing cooking preferences for {user_name}. Based on their data, generate 3-5 fun, actionable insights.

Taste Preferences (0-1 scores):
{json.dumps(preferences, indent=2)}

Recent Ratings (newest first):
{json.dumps(ratings[:20], indent=2)}

Cooking History (last 30 days):
{json.dumps(cooking_history[:20], indent=2)}

Return a JSON array of objects:
[
  {{"category": "observation|suggestion|trend", "message": "You both love Thai food but only cooked it twice this month!", "data": {{}}}}
]

Be specific, friendly, and reference actual data. Return ONLY the JSON array."""
            }],
        )

        insights = json.loads(response.content[0].text.strip())
        logger.info(f"Generated {len(insights)} taste insights for {user_name}")
        return insights

    except Exception as e:
        logger.error(f"Taste insight generation failed: {e}", exc_info=True)
        return []
