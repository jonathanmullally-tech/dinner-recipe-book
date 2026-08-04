#!/usr/bin/env python3
"""Build a static RecipeTin Eats recipe bundle for the Dinner Recipe Book PWA.

The script reads the 96 public-web entries from recipes-data.js, resolves each
official RecipeTin Eats page, extracts the Schema.org Recipe JSON-LD, downloads
and resizes the main food image, and writes website-recipes.js.

It is intended to run in GitHub Actions. It does not alter the 71 cookbook-scan
recipes or any personal data saved in the browser.
"""
from __future__ import annotations

import html
import io
import json
import os
import re
import sys
import time
import unicodedata
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import quote_plus, urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "recipes-data.js"
OUTPUT_FILE = ROOT / "website-recipes.js"
ASSET_FILE = ROOT / "website-assets.js"
REPORT_FILE = ROOT / "static-build-report.json"
IMAGE_DIR = ROOT / "assets" / "website"
WEBSITE_SOURCE = "Official RecipeTin Eats public recipe page"
BASE_URL = "https://www.recipetineats.com/"
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36 RecipeBookStaticBuilder/1.0"
)
REQUEST_DELAY = float(os.getenv("RECIPE_REQUEST_DELAY", "0.65"))
TIMEOUT = 35

# Known title differences. Each URL is validated against the page's Recipe
# schema before use, so a stale override safely falls through to site search.
URL_OVERRIDES: dict[str, list[str]] = {
    "Garlic Butter Shrimp": ["https://www.recipetineats.com/garlic-buttered-prawns-shrimp/"],
    "Swedish Meatballs": ["https://www.recipetineats.com/swedish-meatballs/"],
    "Butter Chicken": ["https://www.recipetineats.com/butter-chicken/"],
    "Cashew Chicken": ["https://www.recipetineats.com/cashew-chicken/"],
    "Smoky Pork Chops": ["https://www.recipetineats.com/smoky-pork-chops/", "https://www.recipetineats.com/pork-chops/"],
    "Pumpkin Soup": ["https://www.recipetineats.com/classic-pumpkin-soup/"],
    "Chicken Fricassee": ["https://www.recipetineats.com/chicken-fricassee-quick-french-chicken-stew/"],
    "Thai Beef Salad": ["https://www.recipetineats.com/thai-beef-salad/"],
    "Steak Fajitas": ["https://www.recipetineats.com/beef-steak-fajitas/", "https://www.recipetineats.com/steak-fajitas/"],
    "Beef Enchiladas": ["https://www.recipetineats.com/beef-enchiladas/"],
    "Lime Crema": ["https://www.recipetineats.com/lime-crema/"],
    "Avocado Crema": ["https://www.recipetineats.com/avocado-crema/"],
    "Guacamole": ["https://www.recipetineats.com/best-ever-authentic-guacamole/", "https://www.recipetineats.com/guacamole/"],
    "Instant Spicy Pink Sauce": ["https://www.recipetineats.com/spicy-mayo/", "https://www.recipetineats.com/instant-spicy-pink-sauce/"],
    "Taco Sauce": ["https://www.recipetineats.com/taco-sauce/"],
    "Taco Slaw": ["https://www.recipetineats.com/taco-slaw/"],
    "Mexican Red Rice": ["https://www.recipetineats.com/mexican-red-rice/"],
    "Pico de Gallo": ["https://www.recipetineats.com/pico-de-gallo/"],
    "Quick Pickled Cabbage": ["https://www.recipetineats.com/quick-pickled-cabbage/"],
    "Warming Tortillas": ["https://www.recipetineats.com/how-to-warm-tortillas/", "https://www.recipetineats.com/warming-tortillas/"],
    "Chicken Ragu": ["https://www.recipetineats.com/chicken-ragu/"],
    "Red Wine Sauce": ["https://www.recipetineats.com/red-wine-sauce/"],
    "White Wine Sauce": ["https://www.recipetineats.com/white-wine-sauce/"],
    "Brown Butter & Lemon Butter Sauce": ["https://www.recipetineats.com/brown-butter-sauce/", "https://www.recipetineats.com/lemon-butter-sauce/"],
    "My Favorite Blue Cheese Sauce": ["https://www.recipetineats.com/blue-cheese-sauce/"],
    "Greek Chicken Gyros": ["https://www.recipetineats.com/greek-chicken-gyros-with-tzatziki/"],
    "Crunchy Baked Chicken Tenders": ["https://www.recipetineats.com/truly-golden-crunchy-baked-chicken-tenders-less-mess/"],
    "House Special Glazed Meatloaf": ["https://www.recipetineats.com/meatloaf-recipe/"],
    "One-Pot Baked Greek Chicken & Lemon Rice": ["https://www.recipetineats.com/one-pot-greek-chicken-lemon-rice/"],
    "Chicken Shawarma": ["https://www.recipetineats.com/chicken-sharwama-middle-eastern/"],
    "Naan": ["https://www.recipetineats.com/naan-recipe/"],
    "The Asian Glazed Salmon": ["https://www.recipetineats.com/asian-glazed-salmon/"],
    "Baked Fish With Lemon Cream Sauce": ["https://www.recipetineats.com/baked-fish-with-lemon-cream-sauce/"],
    "Charlie—My All-Purpose Stir-Fry Sauce": ["https://www.recipetineats.com/real-chinese-all-purpose-stir-fry-sauce/"],
    "Chilli Garlic Ginger Shrimp": ["https://www.recipetineats.com/asian-chilli-garlic-prawns-shrimp/"],
    "Vietnamese Caramel Ground Pork": ["https://www.recipetineats.com/vietnamese-caramelised-pork-bowls/"],
    "Pad Thai": ["https://www.recipetineats.com/chicken-pad-thai/"],
    "Pad See Ew": ["https://www.recipetineats.com/thai-stir-fried-noodles-pad-see-ew/"],
    "Chinese Fried Rice": ["https://www.recipetineats.com/egg-fried-rice/"],
    "Chow Mein": ["https://www.recipetineats.com/chow-mein/"],
    "Poached Chicken Breast": ["https://www.recipetineats.com/poached-chicken/"],
    "Baked Chicken Breast": ["https://www.recipetineats.com/oven-baked-chicken-breast/"],
    "Butter-Basted Steak": ["https://www.recipetineats.com/how-to-cook-steak/"],
    "Chilli con Carne": ["https://www.recipetineats.com/chilli-con-carne/"],
    "Spinach & Ricotta Cannelloni": ["https://www.recipetineats.com/spinach-ricotta-cannelloni/"],
    "My Forever Spaghetti Bolognese": ["https://www.recipetineats.com/spaghetti-bolognese/"],
    "Mac & Cheese": ["https://www.recipetineats.com/baked-mac-and-cheese/"],
    "The Rainbow—Quinoa Salad With Ginger Dressing": ["https://www.recipetineats.com/quinoa-salad/"],
    "Ms. Saigon—Vietnamese Chicken Salad": ["https://www.recipetineats.com/vietnamese-chicken-salad/"],
    "Mexican Shredded Beef": ["https://www.recipetineats.com/mexican-shredded-beef-and-tacos/"],
    "Pork Carnitas": ["https://www.recipetineats.com/pork-carnitas-mexican-slow-cooker-pulled-pork/"],
    "Nachos Cheese Sauce": ["https://www.recipetineats.com/nachos-cheese-dip-sauce/"],
    "Mango Avocado Salsa": ["https://www.recipetineats.com/mango-avocado-salsa/"],
    "Thai Chicken Satay Skewers": ["https://www.recipetineats.com/thai-chicken-satay-peanut-sauce/"],
    "San Choy Bow (Chinese Lettuce Wraps)": ["https://www.recipetineats.com/san-choy-bow-chinese-lettuce-wraps/"],
    "Vietnamese Rice Paper Rolls": ["https://www.recipetineats.com/vietnamese-rice-paper-rolls-spring-rolls/"],
    "Mum's Gyoza": ["https://www.recipetineats.com/gyoza-japanese-dumplings-potstickers/"],
    "Spring Rolls": ["https://www.recipetineats.com/spring-rolls/"],
    "Laksa": ["https://www.recipetineats.com/laksa-soup/"],
    "Chinese Noodle Soup": ["https://www.recipetineats.com/chinese-noodle-soup/"],
    "Wonton Soup": ["https://www.recipetineats.com/wonton-soup/"],
    "Christmas Baked Salmon": ["https://www.recipetineats.com/christmas-baked-salmon-easy-make-ahead/"],
    "Pork Ribs With BBQ Sauce": ["https://www.recipetineats.com/oven-baked-barbecue-pork-ribs/"],
    "The Best Ever Lamb Shoulder": ["https://www.recipetineats.com/slow-roasted-rosemary-garlic-lamb-shoulder/"],
    "Beef Brisket With BBQ Sauce": ["https://www.recipetineats.com/slow-cooker-beef-brisket-with-bbq-sauce/"],
    "Ultra-Crispy Slow-Roasted Pork Belly": ["https://www.recipetineats.com/crispy-slow-roasted-pork-belly/"],
    "Shepherd's Pie & Cottage Pie": ["https://www.recipetineats.com/shepherds-pie/"],
    "Guinness Stew": ["https://www.recipetineats.com/irish-beef-and-guinness-stew/"],
    "Beef Lasagne": ["https://www.recipetineats.com/lasagna/"],
    "Eggplant Parmigiana": ["https://www.recipetineats.com/eggplant-parmigiana/"],
    "Apple Crumble": ["https://www.recipetineats.com/apple-crumble/"],
    "My Forever Chocolate Cake": ["https://www.recipetineats.com/chocolate-cake/"],
    "My Perfect Vanilla Cake": ["https://www.recipetineats.com/my-very-best-vanilla-cake/"],
    "Creamy Mushroom Sauce": ["https://www.recipetineats.com/mushroom-sauce/"],
    "Gravy": ["https://www.recipetineats.com/gravy/"],
    "Honey Garlic Sauce": ["https://www.recipetineats.com/honey-garlic-sauce/"],
    "Sweet & Sour Sauce": ["https://www.recipetineats.com/sweet-and-sour-sauce/"],
    "Chimichurri": ["https://www.recipetineats.com/chimichurri-sauce/"],
    "Béarnaise Sauce": ["https://www.recipetineats.com/bearnaise-sauce/"],
    "Honey Mustard Sauce": ["https://www.recipetineats.com/honey-mustard-sauce/"],
    "White Rice": ["https://www.recipetineats.com/how-to-cook-rice/"],
    "Brown Rice": ["https://www.recipetineats.com/how-to-cook-brown-rice/"],
    "Jasmine Rice": ["https://www.recipetineats.com/how-to-cook-jasmine-rice/"],
    "Basmati Rice": ["https://www.recipetineats.com/how-to-cook-basmati-rice/"],
    "Cauliflower Rice": ["https://www.recipetineats.com/cauliflower-rice/"],
    "Fluffy Coconut Rice": ["https://www.recipetineats.com/fluffy-coconut-rice/"],
    "Creamy Mashed Potato": ["https://www.recipetineats.com/mashed-potato/"],
    "Creamy Mashed Cauliflower (Purée)": ["https://www.recipetineats.com/creamy-mashed-cauliflower/"],
    "Garlic Roast Potatoes": ["https://www.recipetineats.com/garlic-roasted-potatoes/"],
    "Easy Crusty Artisan Bread": ["https://www.recipetineats.com/easy-yeast-bread-recipe-no-knead/"],
    "Easy Flatbread": ["https://www.recipetineats.com/easy-soft-flatbread-yeast/"],
    "Cornbread Muffins": ["https://www.recipetineats.com/cornbread-muffins/"],
    "No-Yeast Rolls": ["https://www.recipetineats.com/no-yeast-bread-rolls/"],
    "Vegetable Broth": ["https://www.recipetineats.com/vegetable-stock/"],
    "Beef Broth": ["https://www.recipetineats.com/homemade-beef-stock/"],
    "Chicken Broth": ["https://www.recipetineats.com/homemade-chicken-stock/"],
}

TITLE_ALIASES: dict[str, list[str]] = {
    "Butter-Basted Steak": ["how to cook steak like a chef", "garlic thyme butter basted steak"],
    "Charlie—My All-Purpose Stir-Fry Sauce": ["charlie", "real chinese all purpose stir fry sauce"],
    "The Rainbow—Quinoa Salad With Ginger Dressing": ["quinoa salad", "rainbow quinoa salad"],
    "My Forever Spaghetti Bolognese": ["spaghetti bolognese"],
    "Ms. Saigon—Vietnamese Chicken Salad": ["vietnamese chicken salad"],
    "The Best Ever Lamb Shoulder": ["slow roasted lamb shoulder"],
    "My Forever Chocolate Cake": ["chocolate cake"],
    "My Perfect Vanilla Cake": ["vanilla cake"],
    "Creamy Mashed Cauliflower (Purée)": ["creamy mashed cauliflower"],
    "Mum's Gyoza": ["gyoza", "japanese dumplings"],
    "Chinese Fried Rice": ["egg fried rice", "fried rice"],
    "Chilli Garlic Ginger Shrimp": ["asian chilli garlic prawns", "chilli garlic prawns"],
    "Vietnamese Caramel Ground Pork": ["vietnamese caramelised pork bowls"],
    "Christmas Baked Salmon": ["christmas baked salmon easy make ahead"],
    "Pork Ribs With BBQ Sauce": ["oven baked barbecue pork ribs"],
    "Beef Brisket With BBQ Sauce": ["slow cooker beef brisket with bbq sauce"],
}


@dataclass
class PageRecipe:
    url: str
    schema: dict[str, Any]
    score: float


class Fetcher:
    def __init__(self) -> None:
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": USER_AGENT,
            "Accept-Language": "en-US,en;q=0.9",
            "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        })
        self.last_request = 0.0
        self.cache: dict[str, requests.Response] = {}

    def get(self, url: str, *, binary: bool = False) -> requests.Response:
        if not binary and url in self.cache:
            return self.cache[url]
        wait = REQUEST_DELAY - (time.monotonic() - self.last_request)
        if wait > 0:
            time.sleep(wait)
        error: Exception | None = None
        for attempt in range(4):
            try:
                response = self.session.get(url, timeout=TIMEOUT, allow_redirects=True)
                self.last_request = time.monotonic()
                if response.status_code in {429, 500, 502, 503, 504}:
                    raise requests.HTTPError(f"HTTP {response.status_code}")
                response.raise_for_status()
                if not binary:
                    self.cache[url] = response
                return response
            except Exception as exc:  # noqa: BLE001
                error = exc
                if attempt < 3:
                    time.sleep((attempt + 1) * 3)
        raise RuntimeError(f"Failed to fetch {url}: {error}")


FETCHER = Fetcher()
SITEMAP_URLS: list[str] | None = None


def normalized(value: Any) -> str:
    text = html.unescape(str(value or "")).lower()
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.replace("&", " and ").replace("—", " ").replace("–", " ")
    text = re.sub(r"\([^)]*\)", " ", text)
    text = re.sub(r"\b(my|the|recipe|easy|best ever|forever|perfect)\b", " ", text)
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def slugify(value: str) -> str:
    return normalized(value).replace(" ", "-")


def tokens(value: str) -> set[str]:
    stop = {"and", "with", "of", "a", "an", "to", "for", "style"}
    return {part for part in normalized(value).split() if len(part) > 1 and part not in stop}


def similarity(target: str, candidate: str) -> float:
    a = normalized(target)
    b = normalized(candidate)
    if not a or not b:
        return 0.0
    seq = SequenceMatcher(None, a, b).ratio()
    ta, tb = tokens(a), tokens(b)
    intersection = len(ta & tb)
    token_score = (2 * intersection / (len(ta) + len(tb))) if ta and tb else 0.0
    containment = intersection / max(1, min(len(ta), len(tb)))
    return max(seq, 0.65 * token_score + 0.35 * containment)


def title_score(target: str, candidate: str) -> float:
    values = [target, *TITLE_ALIASES.get(target, [])]
    return max(similarity(value, candidate) for value in values)


def load_base_recipes() -> list[dict[str, Any]]:
    text = DATA_FILE.read_text(encoding="utf-8")
    match = re.search(r"window\.RECIPE_INDEX\s*=\s*(\[.*\]);\s*$", text, re.S)
    if not match:
        raise RuntimeError("Could not parse recipes-data.js")
    recipes = json.loads(match.group(1))
    return [recipe for recipe in recipes if recipe.get("source_type") == WEBSITE_SOURCE]


def iter_json_objects(value: Any) -> Iterable[dict[str, Any]]:
    if isinstance(value, dict):
        yield value
        for key in ("@graph", "mainEntity", "itemListElement"):
            child = value.get(key)
            if child is not None:
                yield from iter_json_objects(child)
    elif isinstance(value, list):
        for item in value:
            yield from iter_json_objects(item)


def is_recipe_schema(obj: dict[str, Any]) -> bool:
    recipe_type = obj.get("@type")
    if isinstance(recipe_type, list):
        return any(str(item).lower() == "recipe" for item in recipe_type)
    return str(recipe_type).lower() == "recipe"


def extract_recipe_schemas(page_html: str) -> list[dict[str, Any]]:
    soup = BeautifulSoup(page_html, "html.parser")
    schemas: list[dict[str, Any]] = []
    for script in soup.find_all("script", attrs={"type": re.compile("ld\\+json", re.I)}):
        raw = script.string or script.get_text("", strip=False)
        if not raw.strip():
            continue
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            cleaned = re.sub(r"^\s*<!--|-->\s*$", "", raw.strip())
            try:
                data = json.loads(cleaned)
            except json.JSONDecodeError:
                continue
        for obj in iter_json_objects(data):
            if is_recipe_schema(obj):
                schemas.append(obj)
    return schemas



def extract_wprm_schemas(page_html: str) -> list[dict[str, Any]]:
    """Extract WP Recipe Maker cards as a fallback when JSON-LD is absent."""
    soup = BeautifulSoup(page_html, "html.parser")
    schemas: list[dict[str, Any]] = []
    for card in soup.select(".wprm-recipe-container, .wprm-recipe-template-recipetin-eats"):
        name_node = card.select_one(".wprm-recipe-name")
        name = name_node.get_text(" ", strip=True) if name_node else ""
        if not name:
            continue

        grouped_ingredients: list[dict[str, str]] = []
        ingredient_strings: list[str] = []
        groups = card.select(".wprm-recipe-ingredient-group")
        if not groups:
            groups = [card]
        for group in groups:
            group_name_node = group.select_one(".wprm-recipe-group-name")
            group_name = group_name_node.get_text(" ", strip=True) if group_name_node else "Ingredients"
            for node in group.select(".wprm-recipe-ingredient"):
                text = node.get_text(" ", strip=True)
                if text:
                    grouped_ingredients.append({"section": group_name or "Ingredients", "item": text})
                    ingredient_strings.append(text)

        grouped_instructions: list[dict[str, Any]] = []
        instruction_groups = card.select(".wprm-recipe-instruction-group")
        if not instruction_groups:
            instruction_groups = [card]
        for group in instruction_groups:
            group_name_node = group.select_one(".wprm-recipe-group-name")
            group_name = group_name_node.get_text(" ", strip=True) if group_name_node else ""
            for node in group.select(".wprm-recipe-instruction"):
                text_node = node.select_one(".wprm-recipe-instruction-text") or node
                text = text_node.get_text(" ", strip=True)
                if text:
                    grouped_instructions.append({
                        "step": len(grouped_instructions) + 1,
                        "heading": group_name,
                        "text": text,
                    })

        image_node = card.select_one(".wprm-recipe-image img, img.wprm-recipe-image")
        image_urls: list[str] = []
        if image_node:
            for attr in ("data-lazy-src", "data-src", "src"):
                if image_node.get(attr):
                    image_urls.append(image_node[attr])
            srcset = image_node.get("data-lazy-srcset") or image_node.get("srcset") or ""
            for part in srcset.split(","):
                candidate = part.strip().split(" ")[0]
                if candidate:
                    image_urls.append(candidate)

        def metric(selector: str) -> str:
            node = card.select_one(selector)
            return node.get_text(" ", strip=True) if node else ""

        servings = metric(".wprm-recipe-servings")
        notes_node = card.select_one(".wprm-recipe-notes")
        schema: dict[str, Any] = {
            "@type": "Recipe",
            "name": name,
            "recipeIngredient": ingredient_strings,
            "recipeInstructions": [step["text"] for step in grouped_instructions],
            "recipeYield": servings,
            "image": image_urls,
            "prepTime": metric(".wprm-recipe-prep_time"),
            "cookTime": metric(".wprm-recipe-cook_time"),
            "totalTime": metric(".wprm-recipe-total_time"),
            "_ingredient_groups": grouped_ingredients,
            "_instruction_steps": grouped_instructions,
            "_notes": [notes_node.get_text(" ", strip=True)] if notes_node else [],
        }
        schemas.append(schema)
    return schemas


def canonical_url(url: str) -> str:
    url = url.split("#", 1)[0].split("?", 1)[0]
    parsed = urlparse(url)
    if not parsed.scheme:
        url = urljoin(BASE_URL, url)
        parsed = urlparse(url)
    if not parsed.netloc.endswith("recipetineats.com"):
        return ""
    path = re.sub(r"/+", "/", parsed.path)
    if not path.endswith("/"):
        path += "/"
    return f"https://www.recipetineats.com{path}"


def parse_page(url: str, target_title: str, *, accept_low: bool = False) -> PageRecipe | None:
    try:
        response = FETCHER.get(url)
    except Exception as exc:  # noqa: BLE001
        print(f"  fetch failed: {url} ({exc})")
        return None
    final_url = canonical_url(response.url)
    if not final_url:
        return None
    schemas = extract_recipe_schemas(response.text)
    schemas.extend(extract_wprm_schemas(response.text))
    if not schemas:
        return None
    ranked = sorted(
        ((title_score(target_title, str(schema.get("name", ""))), schema) for schema in schemas),
        key=lambda item: item[0],
        reverse=True,
    )
    score, schema = ranked[0]
    if score < (0.42 if accept_low else 0.54):
        return None
    return PageRecipe(final_url, schema, score)


def direct_candidates(recipe: dict[str, Any]) -> list[str]:
    title = recipe["title"]
    slugs = {
        slugify(title),
        slugify(re.sub(r"^(the|my)\s+", "", title, flags=re.I)),
        slugify(title.replace("shrimp", "prawns")),
        slugify(title.replace("Shrimp", "Prawns")),
        slugify(title.replace("chilli", "chili")),
        slugify(title.replace("Chilli", "Chili")),
    }
    candidates = list(URL_OVERRIDES.get(title, []))
    if recipe.get("source_url"):
        candidates.append(recipe["source_url"])
    candidates.extend(urljoin(BASE_URL, f"{slug}/") for slug in slugs if slug)
    result: list[str] = []
    for url in candidates:
        clean = canonical_url(url)
        if clean and clean not in result:
            result.append(clean)
    return result


def urls_from_search_html(page_html: str, target_title: str) -> list[str]:
    soup = BeautifulSoup(page_html, "html.parser")
    scored: list[tuple[float, str]] = []
    seen: set[str] = set()
    for link in soup.find_all("a", href=True):
        url = canonical_url(link.get("href", ""))
        if not url or url in seen:
            continue
        path = urlparse(url).path.lower()
        if any(part in path for part in ("/category/", "/tag/", "/author/", "/about", "/contact", "/privacy", "/recipes/", "/blog/")):
            continue
        seen.add(url)
        anchor = link.get_text(" ", strip=True)
        slug = path.strip("/").replace("-", " ")
        score = max(title_score(target_title, anchor), title_score(target_title, slug))
        if score > 0.2:
            scored.append((score, url))
    scored.sort(reverse=True)
    return [url for _, url in scored]


def wordpress_api_candidates(title: str) -> list[str]:
    endpoints = [
        f"{BASE_URL}wp-json/wp/v2/search?search={quote_plus(title)}&per_page=20",
        f"{BASE_URL}wp-json/wp/v2/posts?search={quote_plus(title)}&per_page=20&_fields=link,title",
    ]
    result: list[str] = []
    for endpoint in endpoints:
        try:
            response = FETCHER.get(endpoint)
            data = response.json()
        except Exception:  # noqa: BLE001
            continue
        if not isinstance(data, list):
            continue
        for item in data:
            if not isinstance(item, dict):
                continue
            url = canonical_url(str(item.get("url") or item.get("link") or ""))
            if url and url not in result:
                result.append(url)
    return result


def site_search_candidates(title: str) -> list[str]:
    result: list[str] = []
    for query in [title, *TITLE_ALIASES.get(title, [])]:
        result.extend(wordpress_api_candidates(query))
        try:
            response = FETCHER.get(f"{BASE_URL}?s={quote_plus(query)}")
            result.extend(urls_from_search_html(response.text, title))
        except Exception as exc:  # noqa: BLE001
            print(f"  site search failed for {query}: {exc}")
    unique: list[str] = []
    for url in result:
        if url not in unique:
            unique.append(url)
    return unique


def load_sitemap_urls() -> list[str]:
    global SITEMAP_URLS
    if SITEMAP_URLS is not None:
        return SITEMAP_URLS
    collected: list[str] = []
    indexes = [f"{BASE_URL}wp-sitemap.xml", f"{BASE_URL}sitemap_index.xml"]
    child_maps: list[str] = []
    for index_url in indexes:
        try:
            xml = FETCHER.get(index_url).text
        except Exception:
            continue
        locs = re.findall(r"<loc>(.*?)</loc>", xml, re.I | re.S)
        for loc in locs:
            loc = html.unescape(loc.strip())
            if loc.endswith(".xml"):
                if any(word in loc.lower() for word in ("post", "recipe", "page-sitemap")):
                    child_maps.append(loc)
            else:
                clean = canonical_url(loc)
                if clean:
                    collected.append(clean)
        if locs:
            break
    for sitemap in child_maps:
        try:
            xml = FETCHER.get(sitemap).text
        except Exception:
            continue
        for loc in re.findall(r"<loc>(.*?)</loc>", xml, re.I | re.S):
            clean = canonical_url(html.unescape(loc.strip()))
            if clean:
                collected.append(clean)
    SITEMAP_URLS = list(dict.fromkeys(collected))
    return SITEMAP_URLS


def sitemap_candidates(title: str) -> list[str]:
    ranked: list[tuple[float, str]] = []
    for url in load_sitemap_urls():
        slug = urlparse(url).path.strip("/").replace("-", " ")
        score = title_score(title, slug)
        if score > 0.28:
            ranked.append((score, url))
    ranked.sort(reverse=True)
    return [url for _, url in ranked[:15]]


def resolve_recipe(recipe: dict[str, Any]) -> PageRecipe | None:
    title = recipe["title"]
    attempted: set[str] = set()
    groups = [direct_candidates(recipe), site_search_candidates(title), sitemap_candidates(title)]
    for group_index, candidates in enumerate(groups):
        for url in candidates[:20]:
            if url in attempted:
                continue
            attempted.add(url)
            found = parse_page(url, title, accept_low=group_index == 0 and url in URL_OVERRIDES.get(title, []))
            if found:
                return found
    return None


def iso_duration_minutes(value: Any) -> int | None:
    if not value:
        return None
    text = str(value)
    match = re.fullmatch(r"P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", text, re.I)
    if not match:
        numbers = re.findall(r"(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?)", text, re.I)
        minutes = 0.0
        for number, unit in numbers:
            minutes += float(number) * (60 if unit.lower().startswith(("h", "hour")) else 1)
        return round(minutes) if minutes else None
    days, hours, minutes, seconds = (int(part or 0) for part in match.groups())
    return days * 1440 + hours * 60 + minutes + round(seconds / 60)


def instruction_steps(value: Any) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []

    def add(text: Any, heading: str = "") -> None:
        cleaned = BeautifulSoup(str(text or ""), "html.parser").get_text(" ", strip=True)
        cleaned = html.unescape(re.sub(r"\s+", " ", cleaned)).strip()
        if cleaned:
            result.append({"step": len(result) + 1, "heading": heading, "text": cleaned})

    def walk(item: Any, heading: str = "") -> None:
        if isinstance(item, str):
            add(item, heading)
        elif isinstance(item, list):
            for child in item:
                walk(child, heading)
        elif isinstance(item, dict):
            item_type = item.get("@type")
            if isinstance(item_type, list):
                item_type = next((part for part in item_type if part in {"HowToStep", "HowToSection"}), "")
            if item_type == "HowToSection":
                section_name = str(item.get("name") or heading or "")
                walk(item.get("itemListElement") or item.get("steps") or [], section_name)
            else:
                text = item.get("text") or item.get("name")
                if text:
                    add(text, heading)
                elif item.get("itemListElement"):
                    walk(item["itemListElement"], heading)

    walk(value)
    return result


def image_candidates(value: Any) -> list[str]:
    found: list[str] = []

    def walk(item: Any) -> None:
        if isinstance(item, str):
            if item.startswith("http"):
                found.append(item)
        elif isinstance(item, list):
            for child in item:
                walk(child)
        elif isinstance(item, dict):
            for key in ("url", "contentUrl", "thumbnailUrl"):
                if item.get(key):
                    walk(item[key])

    walk(value)
    unique: list[str] = []
    for url in found:
        if url not in unique and re.search(r"\.(?:jpe?g|png|webp)(?:$|\?)", url, re.I):
            unique.append(url)
    return unique


def download_food_image(recipe_id: int, candidates: list[str]) -> tuple[str, str]:
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    output = IMAGE_DIR / f"{recipe_id}.webp"
    for url in candidates:
        try:
            response = FETCHER.get(url, binary=True)
            image = Image.open(io.BytesIO(response.content))
            image = ImageOps.exif_transpose(image).convert("RGB")
            image.thumbnail((1000, 1000), Image.Resampling.LANCZOS)
            image.save(output, "WEBP", quality=84, method=6)
            return f"assets/website/{recipe_id}.webp", url
        except Exception as exc:  # noqa: BLE001
            print(f"  image failed: {url} ({exc})")
    return (candidates[0] if candidates else ""), (candidates[0] if candidates else "")


def clean_text(value: Any) -> str:
    return html.unescape(BeautifulSoup(str(value or ""), "html.parser").get_text(" ", strip=True))


def schema_to_recipe(base: dict[str, Any], page: PageRecipe) -> dict[str, Any]:
    schema = page.schema
    grouped_ingredients = schema.get("_ingredient_groups")
    if isinstance(grouped_ingredients, list) and grouped_ingredients:
        ingredients = [
            {"section": clean_text(item.get("section")) or "Ingredients", "item": clean_text(item.get("item"))}
            for item in grouped_ingredients if isinstance(item, dict) and clean_text(item.get("item"))
        ]
    else:
        raw_ingredients = schema.get("recipeIngredient") or schema.get("ingredients") or []
        if isinstance(raw_ingredients, str):
            raw_ingredients = [raw_ingredients]
        ingredients = [
            {"section": "Ingredients", "item": clean_text(item)}
            for item in raw_ingredients
            if clean_text(item)
        ]
    instructions = schema.get("_instruction_steps") if isinstance(schema.get("_instruction_steps"), list) else None
    if not instructions:
        instructions = instruction_steps(schema.get("recipeInstructions") or schema.get("instructions") or [])
    image_url, original_image = download_food_image(int(base["id"]), image_candidates(schema.get("image")))

    nutrition_raw = schema.get("nutrition") if isinstance(schema.get("nutrition"), dict) else {}
    nutrition: dict[str, str] = {}
    nutrition_map = {
        "calories": "Calories", "carbohydrateContent": "Carbohydrates", "proteinContent": "Protein",
        "fatContent": "Fat", "saturatedFatContent": "Saturated Fat", "cholesterolContent": "Cholesterol",
        "sodiumContent": "Sodium", "fiberContent": "Fiber", "sugarContent": "Sugar",
    }
    for source_key, output_key in nutrition_map.items():
        if nutrition_raw.get(source_key):
            nutrition[output_key] = clean_text(nutrition_raw[source_key])

    rating = None
    rating_raw = schema.get("aggregateRating")
    if isinstance(rating_raw, dict) and rating_raw.get("ratingValue"):
        try:
            rating = {
                "value": float(rating_raw["ratingValue"]),
                "count": int(float(rating_raw.get("ratingCount") or rating_raw.get("reviewCount") or 0)),
            }
        except (TypeError, ValueError):
            rating = None

    yield_value = schema.get("recipeYield")
    if isinstance(yield_value, list):
        yield_value = yield_value[0] if yield_value else ""

    recipe = {
        **base,
        "title": base["title"],  # Keep cookbook title for page/order consistency.
        "publisher_title": clean_text(schema.get("name")),
        "source_url": page.url,
        "source_status": "Bundled from the official RecipeTin Eats public recipe page",
        "sync_status": "static-bundled",
        "transcription_quality": "Official website recipe schema",
        "ingredients": ingredients,
        "instructions": instructions,
        "notes": [clean_text(note) for note in (schema.get("_notes") or []) if clean_text(note)],
        "nutrition": nutrition,
        "image_url": image_url,
        "publisher_image_url": original_image,
        "servings": clean_text(yield_value) or base.get("servings") or "",
        "prep_minutes": iso_duration_minutes(schema.get("prepTime")) or base.get("prep_minutes"),
        "cook_minutes": iso_duration_minutes(schema.get("cookTime")) or base.get("cook_minutes"),
        "total_time_minutes": iso_duration_minutes(schema.get("totalTime")) or base.get("total_time_minutes"),
        "ingredient_count": len(ingredients),
        "website_rating": rating,
        "author": clean_text((schema.get("author") or {}).get("name") if isinstance(schema.get("author"), dict) else schema.get("author")) or "Nagi Maehashi",
        "static_match_score": round(page.score, 3),
    }
    if not ingredients or not instructions:
        raise ValueError("Recipe schema was missing ingredients or instructions")
    return recipe


def write_outputs(recipes: dict[str, Any], report: dict[str, Any]) -> None:
    ordered = {key: recipes[key] for key in sorted(recipes, key=lambda item: int(item))}
    payload = json.dumps(ordered, ensure_ascii=False, separators=(",", ":"))
    OUTPUT_FILE.write_text(
        "// Generated by tools/build_static_recipes.py — do not edit by hand.\n"
        f"window.WEBSITE_RECIPES={payload};\n",
        encoding="utf-8",
    )
    assets = [recipe.get("image_url") for recipe in ordered.values() if str(recipe.get("image_url", "")).startswith("assets/website/")]
    ASSET_FILE.write_text(
        "// Generated by tools/build_static_recipes.py — do not edit by hand.\n"
        f"window.WEBSITE_ASSETS={json.dumps(assets, ensure_ascii=False, separators=(',', ':'))};\n",
        encoding="utf-8",
    )
    REPORT_FILE.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> int:
    base_recipes = load_base_recipes()
    existing: dict[str, Any] = {}
    if OUTPUT_FILE.exists():
        text = OUTPUT_FILE.read_text(encoding="utf-8")
        match = re.search(r"window\.WEBSITE_RECIPES\s*=\s*(\{.*\});?\s*$", text, re.S)
        if match:
            try:
                existing = json.loads(match.group(1))
            except json.JSONDecodeError:
                existing = {}

    built: dict[str, Any] = {}
    failures: list[dict[str, Any]] = []
    results: list[dict[str, Any]] = []
    print(f"Building static data for {len(base_recipes)} website recipes")
    for position, base in enumerate(base_recipes, 1):
        recipe_id = str(base["id"])
        title = base["title"]
        print(f"[{position:02d}/{len(base_recipes)}] {title}")
        try:
            page = resolve_recipe(base)
            if not page:
                raise RuntimeError("No matching official recipe page found")
            recipe = schema_to_recipe(base, page)
            built[recipe_id] = recipe
            results.append({
                "id": base["id"], "title": title, "status": "built",
                "url": page.url, "publisher_title": recipe.get("publisher_title"),
                "match_score": page.score,
            })
            print(f"  -> {page.url} ({page.score:.2f})")
        except Exception as exc:  # noqa: BLE001
            print(f"  FAILED: {exc}")
            if recipe_id in existing and existing[recipe_id].get("ingredients") and existing[recipe_id].get("instructions"):
                built[recipe_id] = existing[recipe_id]
                status = "kept-existing"
            else:
                status = "failed"
                failures.append({"id": base["id"], "title": title, "error": str(exc)})
            results.append({"id": base["id"], "title": title, "status": status, "error": str(exc)})

        # Save progress after every recipe so a cancelled workflow keeps useful output.
        write_outputs(built, {
            "generated_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "target_count": len(base_recipes),
            "built_count": len(built),
            "failed_count": len(failures),
            "results": results,
            "failures": failures,
        })

    print(f"Finished: {len(built)}/{len(base_recipes)} bundled; {len(failures)} unresolved")
    # Commit partial successes. A later rerun can fill unresolved recipes while
    # preserving already-built entries.
    return 0


if __name__ == "__main__":
    sys.exit(main())
