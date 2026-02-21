"""AI-powered menu theme generation using Claude API.

Generates complete visual theme configurations for guest menu pages,
including fonts, colors, gradients, and decorative elements.
"""

import json
import logging
from typing import Optional
import anthropic
from app.config import get_settings

logger = logging.getLogger("dukecook.services.theme_generator")


async def generate_menu_theme(
    theme_prompt: str,
    menu_title: str,
    recipe_titles: list[str],
) -> Optional[dict]:
    """Generate a complete visual theme for a guest menu page.

    Returns a dict with all CSS-ready theme values, or None on failure.
    """
    settings = get_settings()
    if not settings.anthropic_api_key:
        logger.error("ANTHROPIC_API_KEY not configured — cannot generate theme")
        return None

    logger.info(f"Generating theme for menu: {menu_title}", extra={
        "extra_data": {"title": menu_title, "prompt": theme_prompt, "recipe_count": len(recipe_titles)}
    })

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    recipes_str = "\n".join(f"- {t}" for t in recipe_titles)

    prompt = f"""You are a world-class restaurant menu designer. Create a complete visual theme for a dinner party menu page that looks like an elegant PHYSICAL RESTAURANT MENU — not a web app.

MENU TITLE: {menu_title}
THEME DESCRIPTION: {theme_prompt or "Elegant dinner party"}
RECIPES ON THE MENU:
{recipes_str}

Generate a JSON object with these exact keys. The design should feel like a beautiful printed menu: single column, decorative borders, elegant typography, themed dividers between sections.

{{
  "title_font": "A dramatic/script Google Font for the menu title — e.g. Great Vibes, Dancing Script, Cinzel Decorative, Playfair Display SC, Cormorant SC. This should be the showpiece.",
  "heading_font": "A Google Font for section headers — e.g. Cormorant Garamond, Playfair Display SC, Cinzel, EB Garamond. Should complement the title font with small-caps feel.",
  "body_font": "A Google Font for dish names and body text — e.g. EB Garamond, Crimson Text, Cormorant, Lora, Spectral. Readable and elegant.",

  "background_color": "#hex — fallback solid background color for the outer page",
  "background_gradient": "CSS gradient for the full viewport behind the menu paper",
  "pattern_css": "Subtle CSS repeating pattern overlay for texture, or empty string",

  "menu_bg": "Background for the menu paper area — solid color, subtle gradient, or light texture. Should feel like quality paper.",
  "menu_border": "CSS border for the outer menu frame — e.g. 2px solid #8B7355",
  "menu_border_inset": "CSS box-shadow for an inset decorative line — e.g. inset 0 0 0 4px #faf6f0, inset 0 0 0 5px #8B7355. Creates a double-frame effect.",
  "menu_shadow": "CSS box-shadow for the menu paper — e.g. 0 10px 40px rgba(0,0,0,0.3)",
  "menu_max_width": "Max width for the menu paper — between 500px and 650px",

  "text_color": "#hex — main dish name text color",
  "heading_color": "#hex — section header and title color",
  "accent_color": "#hex — accent for dividers, checkmarks, highlights",
  "muted_color": "#hex — subtle text for descriptions, attribution",

  "divider_char": "Unicode character(s) for section divider decoration — e.g. ❋, ✦, ❅, ✿, ◆, ❧, ✤, ⚜, ★",
  "divider_line_css": "CSS for the horizontal lines flanking the divider — e.g. 1px solid #c4a67a",

  "tagline": "A short evocative phrase (5-10 words) that captures the evening's mood — specific to this menu",
  "decorative_emoji": "One main emoji that represents this theme",

  "sections": [
    {{ "title": "SECTION NAME", "items": ["exact recipe title 1", "exact recipe title 2"] }},
    {{ "title": "SECTION NAME", "items": ["exact recipe title 3"] }}
  ],

  "checkbox_border": "CSS border color for unchecked selection indicator",
  "checkbox_checked_bg": "Background color when a dish is selected",
  "checkbox_checked_color": "Checkmark/icon color when selected",

  "button_bg": "Submit button background — solid or gradient",
  "button_text": "#hex — submit button text color",
  "button_border": "Submit button border CSS"
}}

RULES:
- Use REAL Google Font names that actually exist on Google Fonts
- The title_font should be dramatic and eye-catching (script, decorative, or display)
- The heading_font should work well in uppercase/small-caps for section headers
- The body_font should be highly readable at body size
- Create a menu_bg that feels like quality paper (cream, ivory, linen, parchment — or a dark elegant surface for dark themes)
- The menu_border + menu_border_inset together should create a decorative double-frame effect
- All colors must have sufficient contrast against the menu_bg for readability
- The background_gradient (behind the menu) should contrast with the menu paper — dark bg for light paper, or rich color behind cream paper
- SECTIONS: Categorize ALL recipes into 2-5 logical sections (e.g. Starters, Mains, Sides, Desserts, Drinks, Salads). Every recipe title MUST appear in exactly one section. Use the EXACT recipe titles as provided — do not rename or modify them.
- divider_char should match the theme vibe (florals for garden themes, stars for elegant, snowflakes for winter, etc.)
- The tagline should be evocative and specific to this menu's theme, not generic
- Return ONLY the JSON object, no other text"""

    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
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

        theme = json.loads(text)

        # Validate that all recipes appear in sections
        if "sections" in theme:
            section_items = set()
            for section in theme["sections"]:
                section_items.update(section.get("items", []))
            missing = set(recipe_titles) - section_items
            if missing:
                # Add missing recipes to an "Other" section
                theme["sections"].append({"title": "MORE", "items": list(missing)})

        logger.info(
            f"Generated theme for: {menu_title}",
            extra={
                "extra_data": {
                    "title": menu_title,
                    "title_font": theme.get("title_font"),
                    "heading_font": theme.get("heading_font"),
                    "tagline": theme.get("tagline"),
                    "section_count": len(theme.get("sections", [])),
                    "tokens_in": response.usage.input_tokens,
                    "tokens_out": response.usage.output_tokens,
                }
            },
        )
        return theme

    except json.JSONDecodeError as e:
        logger.error(f"AI returned invalid JSON for theme: {e}", extra={
            "extra_data": {"title": menu_title, "response_text": text[:500] if text else ""}
        })
        return None
    except anthropic.APIError as e:
        logger.error(f"Anthropic API error generating theme: {e}", exc_info=True)
        return None
    except Exception as e:
        logger.error(f"Unexpected error in theme generation: {e}", exc_info=True)
        return None
