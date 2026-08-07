(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const DINNER_INDEX = window.RECIPE_INDEX || [];
  const TONIGHT_INDEX = window.TONIGHT_INDEX || [];
  const BASE = [...DINNER_INDEX, ...TONIGHT_INDEX];
  const STATIC_WEBSITE = window.WEBSITE_RECIPES || {};
  const STATIC_ASSETS = window.WEBSITE_ASSETS || [];
  const WEBSITE_SOURCE = 'Official RecipeTin Eats public recipe page';
  const WEB_COUNT = BASE.filter(recipe => recipe.source_type === WEBSITE_SOURCE).length;
  const staticFor = recipeOrId => STATIC_WEBSITE[String(typeof recipeOrId === 'object' ? recipeOrId.id : recipeOrId)] || null;
  const hasWebsiteData = recipeOrId => !!staticFor(recipeOrId) || !!synced[String(typeof recipeOrId === 'object' ? recipeOrId.id : recipeOrId)];

  const KEYS = {
    synced: 'rt_synced_v3',
    prefs: 'rt_prefs_v3',
    shopping: 'rt_shopping_v3',
    shoppingChecked: 'rt_checked_v3',
    ingredientChecked: 'rt_recipe_checked_v4',
    publicImages: 'rt_public_food_images_v3',
    publicImageChecks: 'rt_public_food_image_checks_v22',
    publicImageCredits: 'rt_public_food_image_credits_v22',
    publicImageFailures: 'rt_public_food_image_failures_v22'
  };

  const load = (key, fallback) => {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  };
  const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));

  let synced = load(KEYS.synced, {});
  let prefs = load(KEYS.prefs, {});
  let shopping = load(KEYS.shopping, {});
  let shoppingChecked = load(KEYS.shoppingChecked, {});
  let ingredientChecked = load(KEYS.ingredientChecked, {});
  let publicImages = load(KEYS.publicImages, {});
  let publicImageChecks = load(KEYS.publicImageChecks, {});
  let publicImageCredits = load(KEYS.publicImageCredits, {});
  let publicImageFailures = load(KEYS.publicImageFailures, {});
  let publicImageLookupRunning = false;
  let cancelSync = false;
  let syncRunning = false;
  let currentRecipe = null;
  let activeFetchController = null;
  let lastReaderRequest = 0;
  let mealPhotoUrls = {};

  const COOKBOOK_FOOD_CROPS = {"118":"assets/book-crops/118.jpg","57":"assets/book-crops/57.jpg","45":"assets/book-crops/45.jpg","128":"assets/book-crops/128.jpg","56":"assets/book-crops/56.jpg","143":"assets/book-crops/143.jpg","120":"assets/book-crops/120.jpg","71":"assets/book-crops/71.jpg","69":"assets/book-crops/69.jpg","140":"assets/book-crops/140.jpg","32":"assets/book-crops/32.jpg","64":"assets/book-crops/64.jpg","65":"assets/book-crops/65.jpg","78":"assets/book-crops/78.jpg","61":"assets/book-crops/61.jpg","130":"assets/book-crops/130.jpg","26":"assets/book-crops/26.jpg","48":"assets/book-crops/48.jpg","60":"assets/book-crops/60.jpg","94":"assets/book-crops/94.jpg","52":"assets/book-crops/52.jpg","79":"assets/book-crops/79.jpg","44":"assets/book-crops/44.jpg","75":"assets/book-crops/75.jpg","43":"assets/book-crops/43.jpg","121":"assets/book-crops/121.jpg","38":"assets/book-crops/38.jpg","86":"assets/book-crops/86.jpg","35":"assets/book-crops/35.jpg","144":"assets/book-crops/144.jpg","116":"assets/book-crops/116.jpg","122":"assets/book-crops/122.jpg","14":"assets/book-crops/14.jpg","91":"assets/book-crops/91.jpg","92":"assets/book-crops/92.jpg","131":"assets/book-crops/131.jpg","53":"assets/book-crops/53.jpg","34":"assets/book-crops/34.jpg"};


  // Local prepared-food images generated from the digitized recipe content.
  // These are not photographs of the cookbook pages and are used only when
  // a verified publisher food photograph is unavailable.
  const GENERATED_FOOD_IMAGES = {
    "179": "food-179.jpg",
    "178": "food-178.jpg",
    "1001": "food-1001.jpg",
    "1002": "food-1002.jpg",
    "1008": "food-1008.jpg",
    "1009": "food-1009.jpg",
    "1039": "food-1039.jpg",
    "1041": "food-1041.jpg",
    "1084": "food-1084.jpg",
    "1123": "food-1123.jpg"
  };

  // Official RecipeTin Eats pages whose public title differs from the TONIGHT
  // book title. These are used only for prepared-food images. Local cookbook
  // photographs are never considered for TONIGHT cards or galleries.
  const PUBLIC_IMAGE_URL_HINTS = {
    "1007": ["https://www.recipetineats.com/avocado-crema/"],
    "1013": ["https://www.recipetineats.com/how-to-cook-basmati-rice/"],
    "1017": ["https://www.recipetineats.com/how-to-cook-brown-rice/"],
    "1019": ["https://www.recipetineats.com/cauliflower-rice/"],
    "1020": ["https://www.recipetineats.com/real-chinese-all-purpose-stir-fry-sauce/"],
    "1037": ["https://www.recipetineats.com/mashed-potato/"],
    "1053": ["https://www.recipetineats.com/easy-yeast-bread-recipe-no-knead/"],
    "1055": ["https://www.recipetineats.com/easy-soft-flatbread-yeast/"],
    "1059": ["https://www.recipetineats.com/fluffy-coconut-rice/"],
    "1081": ["https://www.recipetineats.com/how-to-cook-jasmine-rice/"],
    "1118": ["https://www.recipetineats.com/vietnamese-rice-paper-rolls-spring-rolls/"],
    "1163": ["https://www.recipetineats.com/how-to-cook-rice/"]
  };



  normalizePreferences();
  sanitizeSavedRecipes();
  sanitizePublicPhotoCache();
  discardReplacedDeviceCopies();

  function normalizePreferences() {
    prefs.favorites ??= {};
    prefs.ratings ??= {};
    prefs.notes ??= {};
    prefs.cooked ??= {};
    prefs.labels ??= {};
    prefs.difficulty ??= {};
  }

  function sanitizeSavedRecipes() {
    let changed = false;
    for (const recipe of Object.values(synced)) {
      if (!recipe || typeof recipe !== 'object') continue;
      if (Array.isArray(recipe.ingredients)) {
        recipe.ingredients = recipe.ingredients.map(item => {
          const original = typeof item === 'string' ? item : item.item;
          const cleaned = cleanIngredientText(original);
          if (cleaned !== original) changed = true;
          return typeof item === 'string' ? { section: 'Ingredients', item: cleaned } : { ...item, item: cleaned };
        });
      }
      if (recipe.image_url && isSuspiciousImage(recipe.image_url)) {
        delete recipe.image_url;
        changed = true;
      }
    }
    if (changed) save(KEYS.synced, synced);
  }

  function discardReplacedDeviceCopies() {
    let changed = false;
    for (const id of Object.keys(STATIC_WEBSITE)) {
      if (Object.prototype.hasOwnProperty.call(synced, id)) {
        delete synced[id];
        changed = true;
      }
    }
    if (changed) save(KEYS.synced, synced);
  }

  function sanitizePublicPhotoCache() {
    let changed = false;
    for (const [id, value] of Object.entries(publicImages)) {
      if (!value || isSuspiciousImage(value)) {
        delete publicImages[id];
        delete publicImageCredits[id];
        delete publicImageChecks[id];
        changed = true;
        continue;
      }
      const credit = publicImageCredits[id] || {};
      const source = String(credit.source || '');
      const landing = String(credit.landing_url || '');
      const trusted = /RecipeTin Eats|Publisher page/i.test(source) || /recipetineats\.com/i.test(landing);
      if (!trusted && /^https?:/i.test(String(value))) {
        delete publicImages[id];
        delete publicImageCredits[id];
        delete publicImageChecks[id];
        changed = true;
      }
    }
    if (changed) {
      save(KEYS.publicImages, publicImages);
      save(KEYS.publicImageChecks, publicImageChecks);
      save(KEYS.publicImageCredits, publicImageCredits);
    }
  }

  function mergeRecipe(recipe) {
    const userLabels = prefs.labels[recipe.id] || {};
    const websiteVersion = staticFor(recipe) || synced[String(recipe.id)] || {};
    return {
      ...recipe,
      ...websiteVersion,
      favorite: !!prefs.favorites[recipe.id],
      user_rating: prefs.ratings[recipe.id] ?? null,
      user_notes: prefs.notes[recipe.id] || '',
      times_cooked: prefs.cooked[recipe.id]?.count || 0,
      last_cooked: prefs.cooked[recipe.id]?.last || '',
      user_labels: userLabels,
      user_difficulty: prefs.difficulty[recipe.id] || ''
    };
  }

  const allRecipes = () => BASE.map(mergeRecipe);
  const isWebsiteRecipe = recipe => recipe.source_type === WEBSITE_SOURCE;
  const isDownloaded = recipe => !isWebsiteRecipe(recipe) || hasWebsiteData(recipe);

  function toast(message) {
    const element = $('#toast');
    element.textContent = message;
    element.classList.remove('hidden');
    clearTimeout(element._hideTimer);
    element._hideTimer = setTimeout(() => element.classList.add('hidden'), 2600);
  }

  function esc(value = '') {
    return String(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function slugify(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function fmtTime(value) {
    if (value == null || value === '') return '';
    const minutes = Number(value);
    if (!Number.isFinite(minutes)) return '';
    return minutes >= 60
      ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}`
      : `${minutes}m`;
  }

  function cleanIngredientText(value) {
    let text = String(value || '').replace(/\u00a0/g, ' ').trim();
    for (let pass = 0; pass < 5; pass += 1) {
      const before = text;
      text = text
        .replace(/^\s*[-*+]\s*/, '')
        .replace(/^\s*\[(?:x|X|\s)?\]\s*/, '')
        .replace(/^\s*[☐☑☒✓✔]\s*/, '')
        .trim();
      if (before === text) break;
    }
    return text.replace(/\s{2,}/g, ' ').trim();
  }

  const UNICODE_FRACTIONS = {
    '⅛': 1 / 8,
    '¼': 1 / 4,
    '⅓': 1 / 3,
    '⅜': 3 / 8,
    '½': 1 / 2,
    '⅝': 5 / 8,
    '⅔': 2 / 3,
    '¾': 3 / 4,
    '⅞': 7 / 8
  };

  function fractionValue(value) {
    const text = String(value || '').trim();
    if (text in UNICODE_FRACTIONS) return UNICODE_FRACTIONS[text];
    const unicodeMixed = text.match(/^(\d+)\s*([⅛¼⅓⅜½⅝⅔¾⅞])$/);
    if (unicodeMixed) return Number(unicodeMixed[1]) + UNICODE_FRACTIONS[unicodeMixed[2]];
    const mixed = text.match(/^(\d+)\s+(\d+)\/(\d+)$/);
    if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
    const fraction = text.match(/^(\d+)\/(\d+)$/);
    if (fraction) return Number(fraction[1]) / Number(fraction[2]);
    return Number(text);
  }

  function niceNumber(value) {
    if (!Number.isFinite(value)) return '';
    if (Math.abs(value - Math.round(value)) < 0.015) return String(Math.round(value));
    const whole = Math.floor(value + 1e-8);
    const fraction = value - whole;
    const common = [
      [1 / 8, '1/8'], [1 / 4, '1/4'], [1 / 3, '1/3'], [3 / 8, '3/8'],
      [1 / 2, '1/2'], [5 / 8, '5/8'], [2 / 3, '2/3'], [3 / 4, '3/4'], [7 / 8, '7/8']
    ];
    const closest = common.reduce((best, candidate) =>
      Math.abs(fraction - candidate[0]) < Math.abs(fraction - best[0]) ? candidate : best,
    [0, '']);
    if (Math.abs(fraction - closest[0]) < 0.035) {
      return `${whole || ''}${whole && closest[1] ? ' ' : ''}${closest[1]}`.trim() || String(whole);
    }
    return String(Math.round(value * 100) / 100);
  }

  function scaleIngredient(value, factor) {
    const text = cleanIngredientText(value);
    const multiplier = Number(factor) || 1;
    if (multiplier === 1) return text;
    const quantity = String.raw`(?:\d+\s+[⅛¼⅓⅜½⅝⅔¾⅞]|\d+[⅛¼⅓⅜½⅝⅔¾⅞]|\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|[⅛¼⅓⅜½⅝⅔¾⅞])`;
    const rangePattern = new RegExp(`^(\\s*)(${quantity})(?:\\s*(–|—|-|to)\\s*(${quantity}))?`, 'i');
    return text.replace(rangePattern, (match, spacing, first, separator, second) => {
      const firstValue = fractionValue(first);
      if (!Number.isFinite(firstValue)) return match;
      const firstScaled = niceNumber(firstValue * multiplier);
      if (!second) return spacing + firstScaled;
      const secondValue = fractionValue(second);
      if (!Number.isFinite(secondValue)) return spacing + firstScaled;
      return `${spacing}${firstScaled} ${separator === 'to' ? 'to' : '–'} ${niceNumber(secondValue * multiplier)}`;
    });
  }

  function parseYieldNumber(value) {
    const match = String(value || '').match(/\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
  }

  function scaledServingText(servings, factor) {
    const original = String(servings || '').trim();
    if (!original) return '';
    const base = parseYieldNumber(original);
    if (!base) return original;
    return original.replace(/\d+(?:\.\d+)?/, niceNumber(base * factor));
  }

  function recipeText(recipe) {
    return [
      recipe.title,
      recipe.book_section,
      recipe.book_name,
      recipe.cuisine,
      recipe.protein_type,
      ...(recipe.dietary_tags || []),
      ...(recipe.ingredients || []).map(item => cleanIngredientText(item.item || item)),
      ...(recipe.instructions || []).map(step => step.text || step),
      ...(recipe.notes || []),
      recipe.leftovers
    ].join(' ').toLowerCase();
  }

  function tokenSet(value) {
    return new Set(slugify(value).split('-').filter(token => token.length > 2));
  }

  function overlapScore(left, right) {
    const a = tokenSet(left);
    const b = tokenSet(right);
    let hits = 0;
    for (const token of a) if (b.has(token)) hits += 1;
    return hits / Math.max(1, a.size);
  }

  function isSuspiciousImage(url) {
    return /(?:dozer|headshot|portrait|profile|author|avatar|about[-_ ]?me|logo|icon|favicon|newsletter|email-signup|placeholder|sprite|badge|tracking|pixel|book[-_ ]?cover|cookbook[-_ ]?cover)/i.test(String(url || ''));
  }

  function publisherFoodImageFor(recipe) {
    const candidates = [recipe.image_url, recipe.publisher_image_url, publicImages[String(recipe.id)]];
    return candidates.find(url => url && !isSuspiciousImage(url)) || '';
  }

  function cookbookFoodImageFor(recipe) {
    return COOKBOOK_FOOD_CROPS[String(recipe.id)] || '';
  }

  function generatedFoodImageFor(recipe) {
    return GENERATED_FOOD_IMAGES[String(recipe.id)] || '';
  }

  // Full-library photo resolver (v21): correctness-first.
  // Only accept RecipeTin Eats/publisher images that match the recipe title
  // strongly enough. Never fall back to generic web photos.

  function recipeTitleFallbackImage(recipe) {
    const title = String(recipe.title || 'Recipe').replace(/[<>&"']/g, '').slice(0, 48);
    const lower = title.toLowerCase();
    const icon = /cake|pudding|cookie|brownie|dessert|sweet|tart|pie|loaf/.test(lower) ? '🍰'
      : /salad|slaw|vegetable|veggie|greens/.test(lower) ? '🥗'
      : /pasta|noodle|spaghetti|linguine|macaroni/.test(lower) ? '🍝'
      : /soup|stew|curry|chili/.test(lower) ? '🍲'
      : /fish|salmon|prawn|shrimp|seafood|tuna/.test(lower) ? '🐟'
      : /chicken|turkey/.test(lower) ? '🍗'
      : /beef|steak|lamb|pork|sausage|kofta/.test(lower) ? '🍽️'
      : /pizza|bread|flatbread/.test(lower) ? '🍕' : '🍴';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420"><rect width="640" height="420" fill="#eee5da"/><text x="320" y="178" text-anchor="middle" font-size="92">${icon}</text><text x="320" y="265" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="28" fill="#392f2a">${title}</text><text x="320" y="305" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" fill="#6f625b">Looking for the correct recipe photo…</text></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }
  function imageFor(recipe) {
    // Priority: exact publisher/official public photo -> bundled generated meal image.
    // A neutral title card is temporary while the public-photo resolver runs.
    return publisherFoodImageFor(recipe) || generatedFoodImageFor(recipe) || recipeTitleFallbackImage(recipe);
  }

  function displayedImageFor(recipe) {
    return mealPhotoUrls[recipe.id] || imageFor(recipe);
  }

  function imageKindFor(recipe) {
    if (mealPhotoUrls[recipe.id]) return 'mine';
    if (publisherFoodImageFor(recipe)) return 'publisher';
    if (generatedFoodImageFor(recipe)) return 'generated';
    return '';
  }

  function decodeHtml(value) {
    const area = document.createElement('textarea');
    area.innerHTML = String(value || '');
    return area.value;
  }

  function publicImageCandidates(recipe) {
    const title = String(recipe.title || '');
    const withoutParentheses = title.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
    const beforeSubtitle = title.split(/[—–:]/)[0].trim();
    const articleTrimmed = beforeSubtitle.replace(/^(the|my)\s+/i, '').trim();
    const raw = slugify(title);
    const variants = [
      raw,
      slugify(withoutParentheses),
      slugify(beforeSubtitle),
      slugify(articleTrimmed),
      raw.replace(/^(the|my)-/, '')
    ].filter(Boolean);
    const officialGuesses = variants.map(slug => ({ url: `https://www.recipetineats.com/${slug}/`, trusted: false }));
    const hints = (PUBLIC_IMAGE_URL_HINTS[String(recipe.id)] || []).map(url => ({ url, trusted: true }));
    const explicit = recipe.source_url ? [{ url: recipe.source_url, trusted: true }] : [];
    const deduped = [];
    const seen = new Set();
    for (const candidate of [...explicit, ...hints, ...officialGuesses]) {
      if (!candidate?.url || seen.has(candidate.url)) continue;
      seen.add(candidate.url);
      deduped.push(candidate);
    }
    return deduped;
  }

  function urlScore(url, title) {
    const left = slugify(url);
    const right = slugify(title);
    if (!left || !right) return 0;
    if (left.includes(right)) return 1;
    const titleTokens = right.split('-').filter(Boolean);
    const urlTokens = new Set(left.split('-').filter(Boolean));
    let hits = 0;
    for (const token of titleTokens) if (urlTokens.has(token)) hits += 1;
    return hits / Math.max(1, titleTokens.length);
  }

  function recipeTitleMatchScore(recipe, candidateTitle, candidateUrl = '') {
    const titleScore = overlapScore(recipe.title, decodeHtml(candidateTitle));
    const pathScore = urlScore(candidateUrl, recipe.title);
    return Math.max(titleScore, pathScore, (titleScore * 0.65) + (pathScore * 0.35));
  }

  function extractWpImage(post) {
    const yoast = post?.yoast_head_json?.og_image;
    if (Array.isArray(yoast)) {
      const image = yoast.find(item => /^https?:\/\//i.test(String(item?.url || '')) && !isSuspiciousImage(item.url));
      if (image?.url) return image.url;
    }
    const embedded = post?._embedded?.['wp:featuredmedia'];
    if (Array.isArray(embedded)) {
      const media = embedded.find(item => /^https?:\/\//i.test(String(item?.source_url || '')) && !isSuspiciousImage(item.source_url));
      if (media?.source_url) return media.source_url;
    }
    const jetpack = post?.jetpack_featured_media_url;
    if (/^https?:\/\//i.test(String(jetpack || '')) && !isSuspiciousImage(jetpack)) return jetpack;
    return '';
  }

  async function recipeTinWordPressFoodImage(recipe) {
    const query = String(recipe.title || '').replace(/\([^)]*\)/g, ' ').replace(/[—–:]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!query) return null;
    const searchUrl = `https://www.recipetineats.com/wp-json/wp/v2/search?search=${encodeURIComponent(query)}&per_page=10&_fields=id,title,url,subtype`;
    const response = await fetch(searchUrl, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`RecipeTin search failed (${response.status})`);
    const results = await response.json();
    let best = null;
    for (const result of Array.isArray(results) ? results : []) {
      const resultTitle = decodeHtml(result?.title || '');
      const resultUrl = String(result?.url || '');
      if (!/recipetineats\.com/i.test(resultUrl)) continue;
      const score = recipeTitleMatchScore(recipe, resultTitle, resultUrl);
      if (!best || score > best.score) best = { result, score, resultTitle, resultUrl };
    }
    if (!best || best.score < 0.56) return null;

    const subtype = String(best.result?.subtype || 'post').replace(/[^a-z0-9_-]/gi, '') || 'post';
    const route = subtype === 'page' ? 'pages' : `${subtype}s`;
    const postUrl = `https://www.recipetineats.com/wp-json/wp/v2/${route}/${best.result.id}?_embed=wp:featuredmedia`;
    const postResponse = await fetch(postUrl, { cache: 'force-cache' });
    if (!postResponse.ok) throw new Error(`RecipeTin post lookup failed (${postResponse.status})`);
    const post = await postResponse.json();
    const postTitle = decodeHtml(post?.title?.rendered || best.resultTitle);
    const postLink = String(post?.link || best.resultUrl);
    const verifiedScore = recipeTitleMatchScore(recipe, postTitle, postLink);
    if (verifiedScore < 0.56) return null;
    const imageUrl = extractWpImage(post);
    if (!imageUrl) return null;
    return { url: imageUrl, landingUrl: postLink || best.resultUrl, title: postTitle, score: verifiedScore };
  }

  async function metadataFoodImage(recipe, candidate) {
    const endpoint = `https://api.microlink.io/?url=${encodeURIComponent(candidate.url)}&palette=false&audio=false&video=false`;
    const response = await fetch(endpoint, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`Metadata request failed (${response.status})`);
    const payload = await response.json();
    const data = payload?.data || {};
    const pageTitle = decodeHtml(data.title || '');
    const image = data.image || {};
    const imageUrl = String(image.url || '');
    const finalUrl = String(data.url || candidate.url || '');
    if (!/^https?:\/\//i.test(imageUrl) || isSuspiciousImage(imageUrl)) return '';
    if (/404|not found|page not found/i.test(pageTitle)) return '';
    const score = recipeTitleMatchScore(recipe, pageTitle, finalUrl);
    const largeEnough = !image.width || !image.height || Math.max(Number(image.width), Number(image.height)) >= 500;
    const required = /recipetineats\.com/i.test(finalUrl) ? 0.52 : 0.68;
    return largeEnough && score >= required ? imageUrl : '';
  }

  async function resolvePublicFoodImages() {
    if (publicImageLookupRunning || !navigator.onLine) return;
    const retryAfterMs = 6 * 60 * 60 * 1000;
    const now = Date.now();
    const allMissing = BASE.filter(baseRecipe => {
      const recipe = mergeRecipe(baseRecipe);
      if (publisherFoodImageFor(recipe) || generatedFoodImageFor(recipe)) return false;
      const id = String(recipe.id);
      const brokenUntil = Number(publicImageFailures[id] || 0);
      if (brokenUntil && now < brokenUntil) return false;
      const lastCheck = Number(publicImageChecks[id] || 0);
      return !lastCheck || now - lastCheck >= retryAfterMs;
    }).sort((leftBase, rightBase) => {
      const left = mergeRecipe(leftBase);
      const right = mergeRecipe(rightBase);
      const leftDinner = bookIdFor(left) === 'dinner' ? 0 : 1;
      const rightDinner = bookIdFor(right) === 'dinner' ? 0 : 1;
      const leftPriority = left.source_url || PUBLIC_IMAGE_URL_HINTS[String(left.id)] ? 0 : 1;
      const rightPriority = right.source_url || PUBLIC_IMAGE_URL_HINTS[String(right.id)] ? 0 : 1;
      return leftDinner - rightDinner || leftPriority - rightPriority || Number(left.book_page || 9999) - Number(right.book_page || 9999);
    });
    if (!allMissing.length) return;

    const queue = allMissing.slice(0, 48);
    publicImageLookupRunning = true;
    let nextIndex = 0;
    let added = 0;

    const worker = async () => {
      while (nextIndex < queue.length) {
        const baseRecipe = queue[nextIndex++];
        const recipe = mergeRecipe(baseRecipe);
        const id = String(recipe.id);
        let found = false;

        // First choice: RecipeTin's own WordPress data. This avoids generic
        // image-search guesses and gives us the featured/OG image for the
        // exact matching recipe page.
        try {
          const official = await recipeTinWordPressFoodImage(recipe);
          if (official?.url) {
            publicImages[id] = official.url;
            publicImageCredits[id] = { source: 'RecipeTin Eats', landing_url: official.landingUrl || '' };
            publicImageChecks[id] = Date.now();
            delete publicImageFailures[id];
            added += 1;
            found = true;
          }
        } catch (error) {
          console.warn(`RecipeTin WordPress image lookup failed for ${recipe.title}`, error);
        }

        // Backup only for verified/likely publisher pages. No generic stock
        // image or Openverse fallback: a missing image is preferable to a
        // wrong image.
        if (!found) {
          for (const candidate of publicImageCandidates(recipe)) {
            try {
              const imageUrl = await metadataFoodImage(recipe, candidate);
              if (imageUrl) {
                publicImages[id] = imageUrl;
                publicImageCredits[id] = {
                  source: /recipetineats\.com/i.test(candidate.url) ? 'RecipeTin Eats' : 'Publisher page',
                  landing_url: candidate.url
                };
                publicImageChecks[id] = Date.now();
                delete publicImageFailures[id];
                added += 1;
                found = true;
                break;
              }
            } catch (error) {
              console.warn(`Verified publisher image lookup failed for ${recipe.title}`, candidate.url, error);
            }
          }
        }

        if (!found) publicImageChecks[id] = Date.now();
      }
    };

    try {
      await Promise.all(Array.from({ length: Math.min(4, queue.length) }, () => worker()));
      save(KEYS.publicImages, publicImages);
      save(KEYS.publicImageChecks, publicImageChecks);
      save(KEYS.publicImageCredits, publicImageCredits);
      save(KEYS.publicImageFailures, publicImageFailures);
      if (added) {
        render();
        toast(`${added} verified recipe photo${added === 1 ? '' : 's'} added`);
      }
    } finally {
      publicImageLookupRunning = false;
      const remaining = BASE.some(baseRecipe => {
        const recipe = mergeRecipe(baseRecipe);
        return !publisherFoodImageFor(recipe) && !generatedFoodImageFor(recipe) && !publicImageChecks[String(recipe.id)];
      });
      if (remaining && navigator.onLine) setTimeout(resolvePublicFoodImages, 3500);
    }
  }

  function rememberBrokenPublicImage(id, url) {
    const key = String(id);
    if (!url) return;
    if (publicImages[key] && publicImages[key] === url) {
      delete publicImages[key];
      delete publicImageCredits[key];
      delete publicImageChecks[key];
      publicImageFailures[key] = Date.now() + 30 * 60 * 1000;
      save(KEYS.publicImages, publicImages);
      save(KEYS.publicImageChecks, publicImageChecks);
      save(KEYS.publicImageCredits, publicImageCredits);
      save(KEYS.publicImageFailures, publicImageFailures);
      setTimeout(() => { if (navigator.onLine) resolvePublicFoodImages(); }, 1500);
    }
  }

  function mealTypesFor(recipe) {
    const text = recipeText(recipe);
    const section = String(recipe.book_section || '').toLowerCase();
    const result = new Set();
    if (/breakfast|brunch|pancake|waffle|omelet|omelette|granola|porridge|morning/.test(text)) result.add('Breakfast');
    if (/dessert|cake|cookie|brownie|pudding|tart|sweet pie|ice cream|cheesecake/.test(text) || /dessert|sweet/.test(section)) result.add('Dessert');
    if (/snack|finger food|appeti[sz]er|nibble|dip\b/.test(text) || /snack|starter/.test(section)) result.add('Snack');
    if (/sauce|dressing|condiment|marinade|seasoning/.test(recipe.title.toLowerCase()) || /sauce|dressing/.test(section)) result.add('Sauce / condiment');
    if (/side|salad|vegetable|bread/.test(section) || /\bside dish\b/.test(text)) result.add('Side');
    if (/soup|salad|sandwich|wrap|noodle|rice bowl|lunch/.test(text)) result.add('Lunch');
    if (!result.size || !result.has('Dessert')) result.add('Dinner');
    return [...result];
  }

  function mainIngredientsFor(recipe) {
    const result = new Set();
    const existing = String(recipe.protein_type || '').trim();
    if (existing && !/^(other|general)$/i.test(existing)) result.add(existing);
    const text = [recipe.title, ...(recipe.ingredients || []).slice(0, 10).map(item => item.item || item)].join(' ').toLowerCase();
    const matches = [
      ['Chicken', /\bchicken\b/], ['Beef', /\bbeef|steak\b/], ['Pork', /\bpork|bacon|ham\b/],
      ['Lamb', /\blamb\b/], ['Seafood', /\bseafood|fish|salmon|tuna|cod\b/], ['Shellfish', /\bshrimp|prawn|crab|lobster|mussel|clam\b/],
      ['Pasta', /\bpasta|spaghetti|linguine|penne|noodle\b/], ['Rice', /\brice\b/], ['Eggs', /\begg\b/],
      ['Tofu', /\btofu\b/], ['Legumes', /\bbean|lentil|chickpea\b/], ['Vegetables', /\bvegetable|zucchini|eggplant|cauliflower|broccoli|mushroom\b/]
    ];
    for (const [label, pattern] of matches) if (pattern.test(text)) result.add(label);
    return [...result];
  }

  function methodsFor(recipe) {
    const text = recipeText(recipe);
    const result = new Set();
    if (/\b(oven|bake|baked|roast|roasted|broil)\b/.test(text)) result.add('Oven');
    if (/\b(stovetop|stove|skillet|frying pan|saucepan|sauté|saute|simmer|boil|wok)\b/.test(text)) result.add('Stovetop');
    if (/\bslow cooker|crockpot|crock pot\b/.test(text)) result.add('Slow cooker');
    if (/\bair fryer|air-fryer\b/.test(text)) result.add('Air fryer');
    if (/\bbarbecue|barbeque|bbq|grill|grilled\b/.test(text)) result.add('Barbecue / grill');
    if (/\bpressure cooker|instant pot\b/.test(text)) result.add('Pressure cooker');
    if (/\bno[- ]cook|uncooked|without cooking\b/.test(text)) result.add('No-cook');
    if (/\bone[- ]pot|one[- ]pan|sheet pan|tray bake|single skillet\b/.test(text) || recipe.user_labels?.onePot) result.add('One-pot / one-pan');
    return [...result];
  }

  function difficultyFor(recipe) {
    if (recipe.user_difficulty) return recipe.user_difficulty;
    const ingredients = Number(recipe.ingredient_count ?? recipe.ingredients?.length ?? 0);
    const steps = recipe.instructions?.length || 0;
    const total = totalMinutes(recipe);
    if ((ingredients >= 18 && steps >= 7) || steps >= 10 || total >= 150) return 'Advanced';
    if (ingredients <= 10 && steps <= 5 && (!total || total <= 45)) return 'Easy';
    return 'Moderate';
  }

  function nutritionProtein(recipe) {
    const value = recipe.nutrition?.Protein || recipe.nutrition?.protein || '';
    const match = String(value).match(/(\d+(?:\.\d+)?)\s*g/i);
    return match ? Number(match[1]) : 0;
  }

  function dietaryFor(recipe) {
    const tags = new Set((recipe.dietary_tags || []).map(tag => String(tag).toLowerCase()));
    const result = new Set();
    if (tags.has('vegetarian') || tags.has('meat-free') || /^vegetarian$/i.test(recipe.protein_type || '')) result.add('Vegetarian');
    if (tags.has('vegan')) result.add('Vegan');
    if (tags.has('gluten-free') || tags.has('gluten free')) result.add('Gluten-free');
    if (tags.has('dairy-free') || tags.has('dairy free')) result.add('Dairy-free');
    if (tags.has('low-carb') || tags.has('low carb') || /\bketo\b|low[- ]carb/i.test(recipe.title || '')) result.add('Low-carb');
    if (tags.has('high-protein') || tags.has('high protein') || nutritionProtein(recipe) >= 25) result.add('High-protein');
    if (tags.has('nut-free') || tags.has('nut free')) result.add('Nut-free');
    return [...result];
  }

  function practicalFor(recipe) {
    const text = recipeText(recipe);
    const labels = recipe.user_labels || {};
    const result = new Set();
    const leftovers = String(recipe.leftovers || '').toLowerCase();
    if (labels.freezerFriendly || (/freez/.test(leftovers) && !/not suitable|do not freeze|doesn't freeze|does not freeze/.test(leftovers))) result.add('Freezer-friendly');
    if (labels.mealPrepFriendly || /meal prep|make ahead|prep ahead|prepare ahead|keeps? (?:well|for)/.test(text)) result.add('Meal-prep friendly');
    if (labels.onePot || methodsFor(recipe).includes('One-pot / one-pan')) result.add('One-pot / one-pan');
    if (labels.budgetFriendly || /budget|inexpensive|economical|cheap meal/.test(text)) result.add('Budget-friendly');
    if (labels.kidFriendly || /kid[- ]friendly|children love|family friendly/.test(text)) result.add('Kid-friendly');
    if (labels.usesLeftovers || /\bleftover|cooked rice,? cold|use up/.test(text)) result.add('Uses leftovers');
    return [...result];
  }

  function bookIdFor(recipe) {
    if (recipe.book_id) return recipe.book_id;
    // All original 167 entries belong to the Dinner cookbook, including the
    // entries whose full text comes from the publisher website.
    return 'dinner';
  }

  function authorFor(recipe) {
    if (isWebsiteRecipe(recipe)) return 'RecipeTin Eats website';
    if (bookIdFor(recipe) === 'tonight') return 'RecipeTin Eats: TONIGHT cookbook';
    return 'RecipeTin: Dinner cookbook';
  }

  function totalMinutes(recipe) {
    const stored = Number(recipe.total_time_minutes);
    if (Number.isFinite(stored) && stored > 0) return stored;
    const prep = Number(recipe.prep_minutes) || 0;
    const cook = Number(recipe.cook_minutes) || 0;
    const additional = Number(recipe.additional_time_minutes) || 0;
    return prep + cook + additional || 0;
  }

  function populateFilters() {
    const recipes = allRecipes();
    const optionMaps = [
      ['#mainIngredientFilter', new Set(recipes.flatMap(mainIngredientsFor))],
      ['#cuisineFilter', new Set(recipes.map(recipe => recipe.cuisine).filter(Boolean))],
      ['#sectionFilter', new Set(recipes.map(recipe => recipe.book_section).filter(Boolean))],
      ['#authorFilter', new Set(recipes.map(authorFor).filter(Boolean))]
    ];
    for (const [selector, values] of optionMaps) {
      const select = $(selector);
      [...values].sort((a, b) => a.localeCompare(b)).forEach(value => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        select.append(option);
      });
    }
  }

  function selectedValues(selector) {
    return $$(selector).filter(input => input.checked).map(input => input.value);
  }

  function filterState() {
    return {
      query: $('#searchInput').value.trim().toLowerCase(),
      source: $('#sourceFilter').value,
      book: $('#bookFilter').value,
      mealType: $('#mealTypeFilter').value,
      mainIngredient: $('#mainIngredientFilter').value,
      cuisine: $('#cuisineFilter').value,
      totalTime: $('#totalTimeFilter').value,
      difficulty: $('#difficultyFilter').value,
      method: $('#methodFilter').value,
      servings: $('#servingsFilter').value,
      section: $('#sectionFilter').value,
      author: $('#authorFilter').value,
      ingredientsOnHand: $('#ingredientsOnHand').value.split(',').map(value => value.trim().toLowerCase()).filter(Boolean),
      dietary: selectedValues('[data-diet-filter]'),
      practical: selectedValues('[data-practical-filter]'),
      personal: selectedValues('[data-personal-filter]'),
      rating: Number($('#ratingFilter').value || 0),
      ingredientCount: $('#ingredientFilter').value,
      prep: Number($('#prepFilter').value || 0),
      cook: Number($('#cookFilter').value || 0)
    };
  }

  function matchesFilters(recipe, filters) {
    const text = recipeText(recipe);
    if (filters.query && !text.includes(filters.query)) return false;
    if (filters.book && bookIdFor(recipe) !== filters.book) return false;
    if (filters.source === 'bundled' && isWebsiteRecipe(recipe)) return false;
    if (filters.source === 'website' && !isWebsiteRecipe(recipe)) return false;
    if (filters.source === 'synced' && (!isWebsiteRecipe(recipe) || !isDownloaded(recipe))) return false;
    if (filters.mealType && !mealTypesFor(recipe).includes(filters.mealType)) return false;
    if (filters.mainIngredient && !mainIngredientsFor(recipe).includes(filters.mainIngredient)) return false;
    if (filters.cuisine && recipe.cuisine !== filters.cuisine) return false;
    if (filters.section && recipe.book_section !== filters.section) return false;
    if (filters.author && authorFor(recipe) !== filters.author) return false;
    if (filters.difficulty && difficultyFor(recipe) !== filters.difficulty) return false;
    if (filters.method && !methodsFor(recipe).includes(filters.method)) return false;

    const total = totalMinutes(recipe);
    if (filters.totalTime) {
      if (filters.totalTime === 'over60' && (!total || total <= 60)) return false;
      if (filters.totalTime !== 'over60' && (!total || total > Number(filters.totalTime))) return false;
    }

    const servings = parseYieldNumber(recipe.servings);
    if (filters.servings === 'le2' && (!servings || servings > 2)) return false;
    if (filters.servings === '3to4' && (!servings || servings < 3 || servings > 4)) return false;
    if (filters.servings === 'ge5' && (!servings || servings < 5)) return false;

    if (filters.ingredientsOnHand.length) {
      const ingredientText = (recipe.ingredients || []).map(item => cleanIngredientText(item.item || item)).join(' ').toLowerCase();
      if (!filters.ingredientsOnHand.every(item => ingredientText.includes(item))) return false;
    }

    const dietary = dietaryFor(recipe);
    if (!filters.dietary.every(tag => dietary.includes(tag))) return false;
    const practical = practicalFor(recipe);
    if (!filters.practical.every(tag => practical.includes(tag))) return false;

    const labels = recipe.user_labels || {};
    for (const status of filters.personal) {
      if (status === 'favorite' && !prefs.favorites[recipe.id]) return false;
      if (status === 'wantTry' && !labels.wantTry) return false;
      if (status === 'madeBefore' && !recipe.times_cooked) return false;
      if (status === 'familyFavorite' && !labels.familyFavorite) return false;
      if (status === 'specialOccasion' && !labels.specialOccasion) return false;
    }

    const rating = Number(prefs.ratings[recipe.id] || 0);
    if (filters.rating === 1 && !rating) return false;
    if (filters.rating > 1 && rating < filters.rating) return false;

    if (filters.ingredientCount) {
      const count = Number(recipe.ingredient_count || recipe.ingredients?.length || 0);
      const threshold = Number(filters.ingredientCount.slice(2));
      if (!count) return false;
      if (filters.ingredientCount.startsWith('eq') && count !== threshold) return false;
      if (filters.ingredientCount.startsWith('le') && count > threshold) return false;
    }
    if (filters.prep && (recipe.prep_minutes == null || recipe.prep_minutes > filters.prep)) return false;
    if (filters.cook && (recipe.cook_minutes == null || recipe.cook_minutes > filters.cook)) return false;
    return true;
  }

  function filteredRecipes() {
    const filters = filterState();
    return allRecipes().filter(recipe => matchesFilters(recipe, filters));
  }

  function activeFilterTotal() {
    const state = filterState();
    return [
      state.query, state.source, state.book, state.mealType, state.mainIngredient, state.cuisine,
      state.totalTime, state.difficulty, state.method, state.servings, state.section,
      state.author, state.rating, state.ingredientCount, state.prep, state.cook
    ].filter(Boolean).length + state.ingredientsOnHand.length + state.dietary.length + state.practical.length + state.personal.length;
  }

  function photoMarkup(recipe, className = '') {
    const image = displayedImageFor(recipe);
    const finalBackup = recipeTitleFallbackImage(recipe);
    const backupAttr = image && image !== finalBackup ? ` data-backup-image="${esc(finalBackup)}"` : '';
    return image
      ? `<img class="${esc(className)}" loading="lazy" src="${esc(image)}" alt="${esc(recipe.title)}" data-image-fallback${backupAttr}>`
      : `<img class="${esc(className)}" loading="lazy" src="${esc(finalBackup)}" alt="${esc(recipe.title)}">`;
  }

  function recipeCard(recipe) {
    const statusBadge = recipe.index_only
      ? `<span class="badge ${recipe.source_url ? 'orange' : ''}">${recipe.source_url ? 'Online only' : 'TONIGHT index'}</span>`
      : (isWebsiteRecipe(recipe)
        ? (staticFor(recipe) ? '<span class="badge green">Included</span>' : (synced[String(recipe.id)] ? '<span class="badge green">Downloaded</span>' : '<span class="badge orange">Not bundled yet</span>'))
        : `<span class="badge green">${bookIdFor(recipe) === 'tonight' ? 'TONIGHT cookbook' : 'Dinner cookbook'}</span>`);
    const rating = prefs.ratings[recipe.id];
    const labels = recipe.user_labels || {};
    return `
      <article class="recipe-card" data-id="${recipe.id}">
        <div class="photo">${photoMarkup(recipe)}</div>
        <div class="card-body">
          <div class="card-title">${esc(recipe.title)}</div>
          <div class="badges">
            ${statusBadge}
            ${recipe.protein_type ? `<span class="badge">${esc(recipe.protein_type)}</span>` : ''}
            ${rating ? `<span class="badge">★ ${rating}/10</span>` : ''}
            ${labels.familyFavorite ? '<span class="badge">Family favourite</span>' : ''}
          </div>
          <div class="meta">
            <span>p. ${esc(recipe.book_page)}</span>
            ${recipe.prep_minutes != null ? `<span>Prep ${fmtTime(recipe.prep_minutes)}</span>` : ''}
            ${recipe.cook_minutes != null ? `<span>Cook ${fmtTime(recipe.cook_minutes)}</span>` : ''}
            ${recipe.ingredient_count ? `<span>${recipe.ingredient_count} ingredients</span>` : ''}
          </div>
          <div class="card-actions">
            <button class="open-btn" data-open="${recipe.id}">${recipe.index_only ? 'Open index entry' : (isDownloaded(recipe) ? 'Open recipe' : 'Download recipe')}</button>
            <button class="heart-btn" data-heart="${recipe.id}" aria-label="Favorite">${prefs.favorites[recipe.id] ? '❤️' : '🤍'}</button>
          </div>
        </div>
      </article>`;
  }

  function render() {
    const recipes = filteredRecipes();
    $('#resultCount').textContent = `${recipes.length} recipe${recipes.length === 1 ? '' : 's'}`;
    const downloaded = BASE.filter(recipe => isWebsiteRecipe(recipe) && isDownloaded(recipe)).length;
    $('#downloadCount').textContent = `${downloaded}/${WEB_COUNT} website recipes available`;
    $('#recipeGrid').innerHTML = recipes.length
      ? recipes.map(recipeCard).join('')
      : '<div class="empty">No recipes match those filters.</div>';
    const filterCount = activeFilterTotal();
    $('#activeFilterCount').textContent = filterCount ? `${filterCount} selected` : 'None selected';
    renderGallery(recipes);
    renderFavorites();
    renderShopping();
    renderStats();
    bindRecipeCards();
  }

  function renderGallery(recipes = filteredRecipes()) {
    const photoSource = $('#gallerySourceFilter')?.value || '';
    const galleryRecipes = recipes.filter(recipe => {
      const kind = imageKindFor(recipe);
      return kind && (!photoSource || kind === photoSource);
    });
    $('#galleryCount').textContent = `${galleryRecipes.length} photo${galleryRecipes.length === 1 ? '' : 's'}`;
    $('#galleryGrid').innerHTML = galleryRecipes.length
      ? galleryRecipes.map(recipe => `
        <button class="gallery-card" data-open="${recipe.id}">
          ${photoMarkup(recipe)}
          <span class="gallery-caption"><strong>${esc(recipe.title)}</strong><small>${esc(imageKindFor(recipe) === 'mine' ? 'My meal photo' : imageKindFor(recipe) === 'publisher' ? 'Website photo' : imageKindFor(recipe) === 'generated' ? 'Recipe-specific food image' : 'Food image')}</small></span>
        </button>`).join('')
      : '<div class="empty">No food photos match those filters. Cookbook page scans are kept inside each recipe for reference and are not used as cover photos.</div>';
    bindRecipeCards();
  }

  function bindRecipeCards() {
    $$('[data-open]').forEach(button => {
      button.onclick = () => openRecipe(Number(button.dataset.open));
    });
    $$('[data-heart]').forEach(button => {
      button.onclick = event => {
        event.stopPropagation();
        toggleFavorite(Number(button.dataset.heart));
      };
    });
    $$('[data-image-fallback]').forEach(image => {
      image.onerror = () => {
        const backup = image.dataset.backupImage;
        if (backup && image.dataset.backupTried !== '1') {
          image.dataset.backupTried = '1';
          image.src = backup;
          return;
        }
        const finalBackup = image.dataset.finalBackupImage;
        if (finalBackup && image.dataset.finalBackupTried !== '1') {
          image.dataset.finalBackupTried = '1';
          image.src = finalBackup;
          return;
        }
        const parent = image.parentElement;
        image.remove();
        if (parent && !parent.querySelector('.emoji')) parent.insertAdjacentHTML('beforeend', '<span class="emoji">🍲</span>');
      };
    });
  }

  function toggleFavorite(id) {
    prefs.favorites[id] = !prefs.favorites[id];
    save(KEYS.prefs, prefs);
    render();
    toast(prefs.favorites[id] ? 'Added to favorites' : 'Removed from favorites');
  }

  async function openRecipe(id) {
    const baseRecipe = BASE.find(recipe => recipe.id === id);
    if (!baseRecipe) return;
    let recipe = mergeRecipe(baseRecipe);
    if (isWebsiteRecipe(recipe) && !hasWebsiteData(id)) {
      showSyncPanel();
      $('#syncLabel').textContent = `Downloading ${recipe.title}`;
      $('#syncDetail').textContent = 'Finding the publisher recipe card…';
      try {
        const downloaded = await syncOne(recipe);
        synced[String(id)] = downloaded;
        save(KEYS.synced, synced);
        recipe = mergeRecipe(baseRecipe);
        toast('Recipe downloaded for offline use');
        render();
      } catch (error) {
        console.warn(recipe.title, error);
        toast(`Download failed: ${friendlySyncError(error)}`);
        hideSyncPanel();
        return;
      }
      hideSyncPanel();
    }
    currentRecipe = recipe;
    renderModal(recipe);
    $('#modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function scanSourceFor(recipe, filename) {
    if (recipe.source_image_base === 'embedded-tonight-index') {
      return window.TONIGHT_INDEX_IMAGES?.[filename] || '';
    }
    return `assets/book/${filename}`;
  }

  function sourceScans(recipe) {
    if (!recipe.source_images?.length) return '';
    const label = recipe.index_only ? 'Cookbook index source' : 'Cookbook source scans';
    const help = recipe.index_only
      ? 'This photograph verifies the recipe title and page number. Upload the full recipe page later to add ingredients and directions.'
      : 'Tap a scan to open it full size and verify the transcription.';
    return `
      <div class="panel scan-source">
        <h3>${label}</h3>
        <p class="muted">${help}</p>
        <div class="scan-strip">
          ${recipe.source_images.map(filename => {
            const source = scanSourceFor(recipe, filename);
            return source ? `<a href="${source}" target="_blank"><img loading="lazy" src="${source}" alt="Cookbook page"></a>` : '';
          }).join('')}
        </div>
      </div>`;
  }

  function ingredientListMarkup(recipe, factor) {
    const ingredients = recipe.ingredients || [];
    const savedChecks = ingredientChecked[recipe.id] || {};
    let previousSection = '';
    return ingredients.map((ingredient, index) => {
      const section = ingredient.section || 'Ingredients';
      const sectionMarkup = section !== previousSection ? `<li class="ingredient-section">${esc(section)}</li>` : '';
      previousSection = section;
      const raw = cleanIngredientText(ingredient.item || ingredient);
      const isChecked = !!savedChecks[index];
      return `${sectionMarkup}<li class="ingredient-row ${isChecked ? 'is-checked' : ''}">
        <label class="ingredient-check">
          <input type="checkbox" data-recipe-ingredient="${index}" ${isChecked ? 'checked' : ''}>
          <span data-ingredient-text="${index}" data-raw="${esc(raw)}">${esc(scaleIngredient(raw, factor))}</span>
        </label>
      </li>`;
    }).join('');
  }

  function personalLabelMarkup(recipe) {
    const labels = recipe.user_labels || {};
    const options = [
      ['wantTry', 'Want to try'],
      ['familyFavorite', 'Family favourite'],
      ['specialOccasion', 'Special occasion'],
      ['freezerFriendly', 'Freezer-friendly'],
      ['mealPrepFriendly', 'Meal-prep friendly'],
      ['onePot', 'One-pot / one-pan'],
      ['budgetFriendly', 'Budget-friendly'],
      ['kidFriendly', 'Kid-friendly'],
      ['usesLeftovers', 'Uses leftovers']
    ];
    return options.map(([key, label]) => `<label><input type="checkbox" data-user-label="${key}" ${labels[key] ? 'checked' : ''}> ${label}</label>`).join('');
  }

  function renderModal(recipe) {
    const factor = shopping[recipe.id]?.factor || 1;
    const steps = recipe.instructions || [];
    const nutrition = recipe.nutrition && Object.keys(recipe.nutrition).length
      ? Object.entries(recipe.nutrition).map(([key, value]) => `<div><strong>${esc(key)}:</strong> ${esc(value)}</div>`).join('')
      : `<p class="muted">${esc(recipe.nutrition_status || 'Nutrition information is not available for this entry.')}</p>`;
    const sourceLink = recipe.source_url ? `<a href="${esc(recipe.source_url)}" target="_blank" rel="noopener">Publisher page</a>` : '';
    const heroImage = displayedImageFor(recipe);
    const heroFinalBackup = recipeTitleFallbackImage(recipe);
    const heroBackupAttr = heroImage && heroImage !== heroFinalBackup ? ` data-backup-image="${esc(heroFinalBackup)}"` : '';
    const hero = heroImage
      ? `<img src="${esc(heroImage)}" alt="${esc(recipe.title)}" data-image-fallback${heroBackupAttr}>`
      : `<img src="${esc(heroFinalBackup)}" alt="${esc(recipe.title)}">`;

    const photoCredit = publicImageCredits[String(recipe.id)] || null;
    const photoCreditMarkup = photoCredit && imageKindFor(recipe) === 'publisher'
      ? `<div class="muted" style="padding:6px 18px 0;font-size:12px">Photo: ${esc(photoCredit.creator || photoCredit.source || 'public source')}${photoCredit.license ? ` · ${esc(String(photoCredit.license).toUpperCase())}` : ''}${photoCredit.landing_url ? ` · <a href="${esc(photoCredit.landing_url)}" target="_blank" rel="noopener">source</a>` : ''}</div>`
      : '';

    $('#modalContent').innerHTML = `
      <div class="detail-hero">${hero}</div>${photoCreditMarkup}
      <div class="detail">
        <h2>${esc(recipe.title)}</h2>
        <div class="badges">
          <span class="badge">Book p. ${esc(recipe.book_page)}</span>
          ${recipe.book_section ? `<span class="badge">${esc(recipe.book_section)}</span>` : ''}
          ${recipe.protein_type ? `<span class="badge">${esc(recipe.protein_type)}</span>` : ''}
          ${recipe.cuisine ? `<span class="badge">${esc(recipe.cuisine)}</span>` : ''}
          <span class="badge">${esc(difficultyFor(recipe))}</span>
        </div>
        <div class="meta" style="margin-top:10px">
          ${recipe.servings ? `<span id="servingDisplay">Serves ${esc(scaledServingText(recipe.servings, factor))}</span>` : ''}
          ${recipe.prep_minutes != null ? `<span>Prep ${fmtTime(recipe.prep_minutes)}</span>` : ''}
          ${recipe.cook_minutes != null ? `<span>Cook ${fmtTime(recipe.cook_minutes)}</span>` : ''}
        </div>
        ${recipe.index_only ? `<p class="warning"><strong>${recipe.source_url ? 'Online-only entry' : 'TONIGHT index entry'}:</strong> ${recipe.source_url ? `This recipe is listed on page ${esc(recipe.book_page)}, but its ingredients and directions are not included offline. Open the publisher page above.` : `This recipe is on page ${esc(recipe.book_page)}. Its title and page number are saved offline, but no full recipe photograph was supplied.`}</p>` : ''}
        ${recipe.transcription_quality?.includes('OCR') ? '<p class="warning"><strong>OCR draft:</strong> Check unclear quantities or wording against your original cookbook photograph.</p>' : ''}
        <div class="detail-toolbar">
          <button id="favDetail">${prefs.favorites[recipe.id] ? '❤️ Favorite' : '🤍 Add favorite'}</button>
          <button id="shareRecipe">Share</button>
          <button id="printRecipe">Print / PDF</button>
          ${sourceLink}
          <a target="_blank" rel="noopener" href="https://www.google.com/search?tbm=isch&q=${encodeURIComponent(recipe.title)}">Google food photos</a>
        </div>

        <div class="detail-grid">
          <div>
            <div class="panel">
              ${recipe.index_only ? '' : `<div class="serving-control">
                <label><strong>Serving multiplier</strong><input id="servingFactor" type="number" min="0.25" max="12" step="0.25" value="${factor}"></label>
                <div class="multiplier-buttons"><button type="button" data-factor="0.5">½×</button><button type="button" data-factor="1">1×</button><button type="button" data-factor="2">2×</button><button type="button" data-factor="3">3×</button></div>
              </div>`}
              <div class="ingredient-heading"><h3>Ingredients</h3>${recipe.index_only ? '' : '<button id="clearIngredientChecks" class="text-button">Clear checks</button>'}</div>
              <ul class="ingredients" id="ingredientList">${recipe.index_only ? `<li class="muted">${recipe.source_url ? 'Ingredients are available from the publisher page linked above.' : 'Ingredients are not available because no full recipe photograph was supplied.'}</li>` : ingredientListMarkup(recipe, factor)}</ul>
              ${recipe.index_only ? '' : `<button id="addShopping" class="primary full-width">${shopping[recipe.id] ? 'Update shopping list' : 'Add to shopping list'}</button>`}
            </div>
            <div class="panel"><h3>Nutrition</h3>${nutrition}</div>
          </div>

          <div>
            <div class="panel">
              <h3>Directions</h3>
              <ol class="steps">${steps.map(step => `<li>${step.heading ? `<span class="step-head">${esc(step.heading)} — </span>` : ''}${esc(step.text || step)}</li>`).join('') || `<li class="muted">${recipe.index_only ? (recipe.source_url ? 'Directions are available from the publisher page linked above.' : `Directions are on page ${esc(recipe.book_page)} of TONIGHT, but no full recipe photograph was supplied.`) : 'Download this website recipe to view the directions.'}</li>`}</ol>
            </div>
            ${recipe.notes?.length ? `<div class="panel"><h3>Recipe notes</h3><ul>${recipe.notes.map(note => `<li>${esc(note)}</li>`).join('')}</ul>${recipe.leftovers ? `<p><strong>Leftovers:</strong> ${esc(recipe.leftovers)}</p>` : ''}</div>` : ''}
            <div class="panel personal">
              <h3>Your copy</h3>
              <div class="personal-grid">
                <label>Rating (1–10)<input id="personalRating" type="number" min="1" max="10" value="${prefs.ratings[recipe.id] || ''}"></label>
                <label>Difficulty<select id="personalDifficulty"><option value="">Automatic (${esc(difficultyFor({ ...recipe, user_difficulty: '' }))})</option><option value="Easy" ${recipe.user_difficulty === 'Easy' ? 'selected' : ''}>Easy</option><option value="Moderate" ${recipe.user_difficulty === 'Moderate' ? 'selected' : ''}>Moderate</option><option value="Advanced" ${recipe.user_difficulty === 'Advanced' ? 'selected' : ''}>Advanced</option></select></label>
                <label>Favorite<br><button id="personalFavorite" class="quiet">${prefs.favorites[recipe.id] ? 'Remove favorite' : 'Add favorite'}</button></label>
                <label>Cooking history<br><button id="markCooked" class="quiet">Mark cooked today</button><small id="cookingHistoryText" class="muted">${recipe.times_cooked ? `${recipe.times_cooked} time${recipe.times_cooked === 1 ? '' : 's'} cooked${recipe.last_cooked ? ` · last ${esc(recipe.last_cooked)}` : ''}` : 'Not cooked yet'}</small></label>
                <div class="personal-labels"><strong>Labels</strong><div class="check-filter-grid">${personalLabelMarkup(recipe)}</div></div>
                <label class="full-span">Notes<textarea id="personalNotes" placeholder="Changes, family feedback, what to do next time…">${esc(prefs.notes[recipe.id] || '')}</textarea></label>
                <label class="full-span">Meal photo<input id="mealPhotoInput" type="file" accept="image/*" capture="environment"></label>
                <div id="mealPhoto" class="full-span"></div>
              </div>
            </div>
            ${sourceScans(recipe)}
          </div>
        </div>
      </div>`;

    bindModalEvents(recipe);
    bindRecipeCards();
    loadMealPhoto(recipe.id);
  }

  function bindModalEvents(recipe) {
    const updateScaledIngredients = factor => {
      $$('[data-ingredient-text]').forEach(span => {
        span.textContent = scaleIngredient(span.dataset.raw, factor);
      });
      const servingDisplay = $('#servingDisplay');
      if (servingDisplay) servingDisplay.textContent = `Serves ${scaledServingText(recipe.servings, factor)}`;
    };

    $('#favDetail').onclick = () => {
      toggleFavorite(recipe.id);
      renderModal(mergeRecipe(BASE.find(item => item.id === recipe.id)));
    };
    $('#personalFavorite').onclick = $('#favDetail').onclick;

    $('#personalRating').onchange = event => {
      const value = Number(event.target.value);
      if (value >= 1) prefs.ratings[recipe.id] = Math.min(10, value);
      else delete prefs.ratings[recipe.id];
      save(KEYS.prefs, prefs);
      render();
    };

    $('#personalDifficulty').onchange = event => {
      if (event.target.value) prefs.difficulty[recipe.id] = event.target.value;
      else delete prefs.difficulty[recipe.id];
      save(KEYS.prefs, prefs);
      render();
    };

    $('#personalNotes').oninput = event => {
      prefs.notes[recipe.id] = event.target.value;
      save(KEYS.prefs, prefs);
    };

    $$('[data-user-label]').forEach(input => {
      input.onchange = () => {
        prefs.labels[recipe.id] ??= {};
        prefs.labels[recipe.id][input.dataset.userLabel] = input.checked;
        save(KEYS.prefs, prefs);
        render();
      };
    });

    $('#markCooked').onclick = () => {
      const history = prefs.cooked[recipe.id] || { count: 0, last: '' };
      history.count += 1;
      history.last = new Date().toISOString().slice(0, 10);
      prefs.cooked[recipe.id] = history;
      save(KEYS.prefs, prefs);
      $('#cookingHistoryText').textContent = `${history.count} time${history.count === 1 ? '' : 's'} cooked · last ${history.last}`;
      render();
      toast('Cooking history updated');
    };

    const servingFactorInput = $('#servingFactor');
    if (servingFactorInput) servingFactorInput.oninput = event => {
      const factor = Math.max(0.25, Number(event.target.value) || 1);
      updateScaledIngredients(factor);
    };
    $$('[data-factor]').forEach(button => {
      button.onclick = () => {
        const factor = Number(button.dataset.factor);
        if ($('#servingFactor')) $('#servingFactor').value = factor;
        updateScaledIngredients(factor);
      };
    });

    $$('[data-recipe-ingredient]').forEach(input => {
      input.onchange = () => {
        ingredientChecked[recipe.id] ??= {};
        ingredientChecked[recipe.id][input.dataset.recipeIngredient] = input.checked;
        save(KEYS.ingredientChecked, ingredientChecked);
        input.closest('.ingredient-row')?.classList.toggle('is-checked', input.checked);
      };
    });

    const clearIngredientChecks = $('#clearIngredientChecks');
    if (clearIngredientChecks) clearIngredientChecks.onclick = () => {
      ingredientChecked[recipe.id] = {};
      save(KEYS.ingredientChecked, ingredientChecked);
      $$('[data-recipe-ingredient]').forEach(input => {
        input.checked = false;
        input.closest('.ingredient-row')?.classList.remove('is-checked');
      });
    };

    const addShopping = $('#addShopping');
    if (addShopping) addShopping.onclick = () => {
      const factor = Math.max(0.25, Number($('#servingFactor').value) || 1);
      shopping[recipe.id] = { factor };
      save(KEYS.shopping, shopping);
      renderShopping();
      toast('Shopping list updated');
      addShopping.textContent = 'Update shopping list';
    };

    $('#shareRecipe').onclick = () => shareRecipe(recipe, Number($('#servingFactor')?.value) || 1);
    $('#printRecipe').onclick = () => window.print();
    $('#mealPhotoInput').onchange = event => saveMealPhoto(recipe.id, event.target.files[0]);
  }

  function shareRecipe(recipe, factor) {
    const text = [
      recipe.title,
      `Book page ${recipe.book_page}`,
      '',
      ...(recipe.ingredients || []).map(item => `• ${scaleIngredient(item.item || item, factor)}`),
      '',
      'Directions:',
      ...(recipe.instructions || []).map((step, index) => `${index + 1}. ${step.heading ? `${step.heading} — ` : ''}${step.text || step}`),
      recipe.source_url ? `Source: ${recipe.source_url}` : ''
    ].join('\n');
    if (navigator.share) navigator.share({ title: recipe.title, text }).catch(() => {});
    else navigator.clipboard.writeText(text).then(() => toast('Recipe copied'));
  }

  function renderFavorites() {
    const recipes = allRecipes().filter(recipe => prefs.favorites[recipe.id]);
    $('#favoriteGrid').innerHTML = recipes.length
      ? recipes.map(recipeCard).join('')
      : '<div class="empty">No favorites yet.</div>';
  }

  const UNITS = ['tsp', 'tbsp', 'cup', 'cups', 'oz', 'lb', 'lbs', 'g', 'kg', 'ml', 'l', 'clove', 'cloves', 'can', 'cans', 'slice', 'slices', 'piece', 'pieces'];

  function parseShopIngredient(value, factor) {
    const scaled = scaleIngredient(value, factor);
    const match = scaled.match(/^\s*(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s+([A-Za-z]+)?\s*(.*)$/);
    if (!match) return { key: scaled.toLowerCase(), display: scaled, qty: null, unit: '', name: scaled };
    const qty = fractionValue(match[1]);
    let unit = (match[2] || '').toLowerCase();
    let name = (match[3] || '').trim();
    if (!UNITS.includes(unit)) {
      name = `${match[2] || ''} ${name}`.trim();
      unit = '';
    }
    const key = `${unit}|${name.toLowerCase().replace(/\([^)]*\)/g, '').replace(/,.*$/, '').trim()}`;
    return { key, display: scaled, qty: Number.isFinite(qty) ? qty : null, unit, name };
  }

  function compileShopping() {
    const combined = new Map();
    for (const [id, selection] of Object.entries(shopping)) {
      const baseRecipe = BASE.find(recipe => recipe.id === Number(id));
      if (!baseRecipe) continue;
      const recipe = mergeRecipe(baseRecipe);
      for (const ingredient of recipe.ingredients || []) {
        const parsed = parseShopIngredient(ingredient.item || ingredient, selection.factor || 1);
        if (!combined.has(parsed.key)) combined.set(parsed.key, { ...parsed, recipes: [recipe.title] });
        else {
          const existing = combined.get(parsed.key);
          if (existing.qty != null && parsed.qty != null) existing.qty += parsed.qty;
          else existing.display += ` + ${parsed.display}`;
          existing.recipes.push(recipe.title);
        }
      }
    }
    return [...combined.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(item => ({
        ...item,
        display: item.qty != null ? `${niceNumber(item.qty)} ${item.unit} ${item.name}`.replace(/\s+/g, ' ').trim() : item.display
      }));
  }

  function renderShopping() {
    const ids = Object.keys(shopping);
    $('#shopCount').textContent = ids.length;
    $('#shoppingRecipes').innerHTML = ids.length
      ? ids.map(id => {
        const baseRecipe = BASE.find(recipe => recipe.id === Number(id));
        if (!baseRecipe) return '';
        const recipe = mergeRecipe(baseRecipe);
        return `<div class="shopping-recipe"><strong style="flex:1">${esc(recipe.title)}</strong><label>× <input type="number" min=".25" step=".25" value="${shopping[id].factor || 1}" data-shop-factor="${id}"></label><button class="danger" data-shop-remove="${id}">Remove</button></div>`;
      }).join('')
      : '<div class="empty">Add recipes from a recipe page to build a combined list.</div>';

    const items = compileShopping();
    $('#shoppingList').innerHTML = items.length
      ? items.map(item => `<label class="shop-item ${shoppingChecked[item.key] ? 'checked' : ''}"><input type="checkbox" data-check="${esc(item.key)}" ${shoppingChecked[item.key] ? 'checked' : ''}><span><strong>${esc(item.display)}</strong><br><small class="muted">${esc([...new Set(item.recipes)].join(', '))}</small></span></label>`).join('')
      : '<p class="muted">No ingredients yet.</p>';

    $$('[data-shop-factor]').forEach(input => {
      input.onchange = () => {
        shopping[input.dataset.shopFactor].factor = Math.max(0.25, Number(input.value) || 1);
        save(KEYS.shopping, shopping);
        renderShopping();
      };
    });
    $$('[data-shop-remove]').forEach(button => {
      button.onclick = () => {
        delete shopping[button.dataset.shopRemove];
        save(KEYS.shopping, shopping);
        renderShopping();
      };
    });
    $$('[data-check]').forEach(input => {
      input.onchange = () => {
        shoppingChecked[input.dataset.check] = input.checked;
        save(KEYS.shoppingChecked, shoppingChecked);
        renderShopping();
      };
    });
  }

  function shoppingText() {
    return ['Shopping list', '', ...compileShopping().map(item => `${shoppingChecked[item.key] ? '☑' : '☐'} ${item.display}`)].join('\n');
  }

  function showView(view) {
    $$('.view').forEach(element => element.classList.toggle('active', element.id === `${view}View`));
    $$('.tab').forEach(element => element.classList.toggle('active', element.dataset.view === view));
    $('#browseTools').classList.toggle('hidden', !['recipes', 'gallery'].includes(view));
    if (view === 'shopping') renderShopping();
    if (view === 'gallery') renderGallery();
  }

  function showSyncPanel() {
    const panel = $('#syncPanel');
    panel.hidden = false;
    panel.classList.remove('hidden');
  }

  function hideSyncPanel() {
    const panel = $('#syncPanel');
    panel.hidden = true;
    panel.classList.add('hidden');
  }

  function resetSyncUI() {
    cancelSync = false;
    syncRunning = false;
    activeFetchController = null;
    hideSyncPanel();
    $('#syncLabel').textContent = 'Preparing sync…';
    $('#syncProgress').value = 0;
    $('#syncDetail').textContent = '';
    setSyncButtons(false);
  }

  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

  async function paceReaderRequest(url) {
    try {
      const host = new URL(url).hostname;
      if (host !== 'r.jina.ai' && host !== 's.jina.ai') return;
      const wait = Math.max(0, 3200 - (Date.now() - lastReaderRequest));
      if (wait) await sleep(wait);
      lastReaderRequest = Date.now();
    } catch {}
  }

  function canonicalizeUrl(url) {
    return String(url || '')
      .replace(/\\/g, '')
      .replace(/[)>\],.;]+$/, '')
      .replace(/\/comment-page-\d+\/?$/, '/')
      .split('#')[0]
      .split('?')[0];
  }

  function urlScore(url, title) {
    const titleTokens = tokenSet(title);
    const lastPathPart = url.split('/').filter(Boolean).pop() || '';
    const pathTokens = new Set(lastPathPart.split('-'));
    let hits = 0;
    for (const token of titleTokens) if (pathTokens.has(token)) hits += 1;
    return hits / Math.max(1, titleTokens.size);
  }

  function isRetryableStatus(status) {
    return status === 408 || status === 425 || status === 429 || status >= 500;
  }

  function friendlySyncError(error) {
    const message = String(error?.message || error || 'temporary network problem');
    if (/429|rate limit/i.test(message)) return 'the reader service is busy; tap sync again in a few minutes';
    if (/abort|timeout/i.test(message)) return 'the request timed out; tap sync again';
    if (/No publisher URL/i.test(message)) return 'the publisher page could not be located';
    if (/incomplete/i.test(message)) return 'the publisher recipe card was incomplete';
    return 'temporary network problem — tap sync again';
  }

  async function fetchText(url, timeout = 60000, retries = 2) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      if (cancelSync) throw new Error('Sync cancelled');
      await paceReaderRequest(url);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      activeFetchController = controller;
      try {
        const response = await fetch(url, { signal: controller.signal, cache: 'no-store', headers: { Accept: 'text/plain' } });
        if (!response.ok) {
          const error = new Error(`HTTP ${response.status}`);
          error.retryable = isRetryableStatus(response.status);
          throw error;
        }
        const text = await response.text();
        if (!text.trim()) throw new Error('Empty response');
        if (/rate limit|too many requests|temporarily unavailable/i.test(text.slice(0, 500))) throw new Error('Rate limit response');
        return text;
      } catch (error) {
        lastError = error;
        if (cancelSync) {
          const stopped = new Error('Sync cancelled');
          stopped.retryable = false;
          throw stopped;
        }
        if (attempt >= retries || error.retryable === false) break;
        await sleep([1800, 5000, 11000][attempt] || 11000);
      } finally {
        clearTimeout(timer);
        if (activeFetchController === controller) activeFetchController = null;
      }
    }
    throw lastError || new Error('Request failed');
  }

  function looksLikeRecipe(markdown) {
    return /#{2,4}\s+Ingredients\b/i.test(markdown) && /#{2,4}\s+(?:Instructions|Directions)\b/i.test(markdown);
  }

  function recipeUrlsFromText(text) {
    const urls = [...text.matchAll(/https:\/\/(?:www\.)?recipetineats\.com\/[A-Za-z0-9_?=&%./#-]+/g)]
      .map(match => canonicalizeUrl(match[0]))
      .filter(url => {
        try {
          const parsed = new URL(url);
          const path = parsed.pathname.toLowerCase();
          return parsed.hostname.endsWith('recipetineats.com')
            && path !== '/'
            && !/(\/category\/|\/tag\/|\/recipes\/?$|\/cookbook\/?$|\/author\/|\/comment-page-|\/my-recipetin\/|\/about\/|\/privacy|\/contact)/.test(path);
        } catch {
          return false;
        }
      });
    return [...new Set(urls)];
  }

  function directUrlCandidates(recipe) {
    const raw = slugify(recipe.title);
    const trimmed = raw.replace(/^(the|my)-/, '');
    return [...new Set([
      recipe.source_url,
      `https://www.recipetineats.com/${raw}/`,
      trimmed !== raw ? `https://www.recipetineats.com/${trimmed}/` : null
    ].filter(Boolean).map(canonicalizeUrl))];
  }

  async function readRecipeUrl(url, base, quick = false) {
    const markdown = await fetchText(`https://r.jina.ai/${url}`, quick ? 32000 : 60000, quick ? 0 : 2);
    if (!looksLikeRecipe(markdown)) throw new Error('Recipe card not found');
    return { url, markdown, recipe: parseWebRecipe(markdown, url, base) };
  }

  async function findRecipeUrl(recipe) {
    for (const guess of directUrlCandidates(recipe)) {
      if (cancelSync) throw new Error('Sync cancelled');
      try {
        return await readRecipeUrl(guess, recipe, true);
      } catch (error) {
        if (cancelSync) throw error;
      }
    }

    const siteSearch = `https://www.recipetineats.com/?s=${encodeURIComponent(recipe.title)}`;
    try {
      const resultMarkdown = await fetchText(`https://r.jina.ai/${siteSearch}`, 60000, 2);
      const urls = recipeUrlsFromText(resultMarkdown).sort((a, b) => urlScore(b, recipe.title) - urlScore(a, recipe.title));
      for (const url of urls.slice(0, 8)) {
        if (cancelSync) throw new Error('Sync cancelled');
        try {
          return await readRecipeUrl(url, recipe, false);
        } catch (error) {
          if (cancelSync) throw error;
        }
      }
    } catch (error) {
      if (cancelSync) throw error;
      console.warn('Publisher search failed', recipe.title, error);
    }

    try {
      const query = `site:recipetineats.com "${recipe.title}" RecipeTin Eats`;
      const searchMarkdown = await fetchText(`https://s.jina.ai/${encodeURIComponent(query)}`, 60000, 1);
      const urls = recipeUrlsFromText(searchMarkdown).sort((a, b) => urlScore(b, recipe.title) - urlScore(a, recipe.title));
      for (const url of urls.slice(0, 6)) {
        if (cancelSync) throw new Error('Sync cancelled');
        try {
          return await readRecipeUrl(url, recipe, false);
        } catch (error) {
          if (cancelSync) throw error;
        }
      }
    } catch (error) {
      if (cancelSync) throw error;
      console.warn('Fallback search failed', recipe.title, error);
    }
    throw new Error('No publisher URL found');
  }

  function section(markdown, startPattern, endPatterns) {
    const start = markdown.search(startPattern);
    if (start < 0) return '';
    const tail = markdown.slice(start).replace(startPattern, '');
    let end = tail.length;
    for (const pattern of endPatterns) {
      const position = tail.search(pattern);
      if (position >= 0 && position < end) end = position;
    }
    return tail.slice(0, end).trim();
  }

  function minsFromText(value) {
    if (!value) return null;
    let minutes = 0;
    let match = String(value).match(/(\d+(?:\.\d+)?)\s*(?:hrs?|hours?)/i);
    if (match) minutes += Number(match[1]) * 60;
    match = String(value).match(/(\d+(?:\.\d+)?)\s*(?:mins?|minutes?)/i);
    if (match) minutes += Number(match[1]);
    return minutes ? Math.round(minutes) : null;
  }

  function collectImageCandidates(markdown) {
    const candidates = [];
    const seen = new Set();
    const add = (url, alt = '', index = 0) => {
      const cleaned = String(url || '').replace(/&amp;/g, '&').replace(/[)>\],.;]+$/, '');
      if (!/^https?:\/\//i.test(cleaned) || seen.has(cleaned)) return;
      if (!/\.(?:jpg|jpeg|png|webp)(?:[?#]|$)/i.test(cleaned)) return;
      seen.add(cleaned);
      candidates.push({ url: cleaned, alt: String(alt || ''), index });
    };

    for (const match of markdown.matchAll(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+[^)]*)\)/gi)) add(match[2], match[1], match.index);
    for (const match of markdown.matchAll(/\[Image\s*\d*:?\s*([^\]]*)\]\((https?:\/\/[^)]+)\)/gi)) add(match[2], match[1], match.index);
    for (const match of markdown.matchAll(/(?:^|\n)(?:Image|Thumbnail|Featured image)\s*:\s*(https?:\/\/\S+)/gi)) add(match[1], '', match.index);
    for (const match of markdown.matchAll(/https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp)(?:\?[^\s"'<>)]*)?/gi)) add(match[0], '', match.index);
    return candidates;
  }

  function chooseFoodImage(markdown, title) {
    const ingredientPosition = markdown.search(/#{2,4}\s+Ingredients\b/i);
    const candidates = collectImageCandidates(markdown);
    const scored = candidates.map(candidate => {
      const combined = `${candidate.alt} ${candidate.url}`.toLowerCase();
      let score = 0;
      if (/wp-content|recipetineats/i.test(candidate.url)) score += 3;
      score += overlapScore(title, candidate.alt) * 18;
      score += overlapScore(title, candidate.url.split('/').pop() || '') * 12;
      if (slugify(candidate.alt).includes(slugify(title)) || slugify(candidate.url).includes(slugify(title))) score += 10;
      if (/recipe|food|dish|dinner|salad|chicken|beef|pork|pasta|rice|shrimp|prawn|soup|cake|bread/i.test(candidate.alt)) score += 2;
      if (ingredientPosition > 0 && candidate.index < ingredientPosition) score += 1.5;
      const size = candidate.url.match(/-(\d{2,4})x(\d{2,4})(?=\.|-)/);
      if (size) {
        const width = Number(size[1]);
        const height = Number(size[2]);
        if (width <= 300 && height <= 300) score -= 5;
        if (width >= 600 || height >= 600) score += 2;
      }
      if (isSuspiciousImage(combined)) score -= 40;
      return { ...candidate, score };
    }).sort((a, b) => b.score - a.score);
    return scored[0]?.score > 0 ? scored[0].url : '';
  }

  function parseWebRecipe(markdown, url, base) {
    const ingredientSection = section(markdown, /#{2,4}\s+Ingredients\s*/i, [
      /#{2,4}\s+Instructions/i,
      /#{2,4}\s+Directions/i,
      /#{2,4}\s+Recipe Notes/i
    ]);
    const ingredients = [];
    let currentIngredientSection = 'Ingredients';
    for (const rawLine of ingredientSection.split('\n')) {
      let line = rawLine.trim();
      if (!line) continue;
      const heading = line.match(/^#{4,6}\s+(.+)/);
      const boldHeading = line.match(/^\*{1,2}([^*]{1,60}):?\*{1,2}$/);
      if (heading || boldHeading) {
        currentIngredientSection = cleanIngredientText((heading || boldHeading)[1]).replace(/:$/, '');
        continue;
      }
      line = cleanIngredientText(line.replace(/^\[Input\]\s*/i, ''));
      if (/^[A-Za-z][A-Za-z &/()-]{1,45}:$/.test(line)) {
        currentIngredientSection = line.replace(/:$/, '');
        continue;
      }
      if (!line || /^#{1,6}\s/.test(line) || /^Cook Mode/i.test(line) || /^Image:/i.test(line) || /^Servings?\b/i.test(line)) continue;
      if (line.length < 240) ingredients.push({ section: currentIngredientSection, item: line });
    }

    const instructionSection = section(markdown, /#{2,4}\s+(?:Instructions|Directions)\s*/i, [
      /#{2,4}\s+Recipe Notes/i,
      /#{2,4}\s+Notes/i,
      /#{2,4}\s+Nutrition/i,
      /Did you make/i
    ]);
    const instructions = [];
    let currentInstructionSection = '';
    for (const rawLine of instructionSection.split('\n')) {
      let line = rawLine.trim();
      if (!line) continue;
      const heading = line.match(/^#{4,6}\s+(.+)/);
      if (heading) {
        currentInstructionSection = heading[1].trim();
        continue;
      }
      line = line
        .replace(/^\s*[*+-]\s*/, '')
        .replace(/^\d+[.)]\s*/, '')
        .replace(/^\[Input\]\s*/, '')
        .replace(/^\[(?:x|X|\s)?\]\s*/, '')
        .replace(/^[☐☑☒✓✔]\s*/, '')
        .trim();
      if (line.length > 8 && !/^Image:/i.test(line)) {
        instructions.push({ step: instructions.length + 1, heading: currentInstructionSection, text: line });
      }
    }

    const noteSection = section(markdown, /#{2,4}\s+Recipe Notes:?\s*/i, [
      /#{2,4}\s+Nutrition/i,
      /Keywords:/i,
      /Did you make/i
    ]);
    const notes = noteSection
      .split(/\n\s*\n|\n\s*\d+[.)]\s*/)
      .map(value => value.replace(/\s+/g, ' ').trim())
      .filter(value => value.length > 15 && value.length < 800);

    const findMeta = label => {
      const match = markdown.match(new RegExp(`(?:^|\\n)${label}\\s*:?\\s*([^\\n]+)`, 'i'));
      return match ? match[1].trim() : '';
    };
    const prepText = findMeta('Prep');
    const cookText = findMeta('Cook');
    const totalText = findMeta('Total');
    let servings = '';
    const servingMatch = markdown.match(/Servings\s+([^\n]+)/i);
    if (servingMatch) servings = servingMatch[1].replace(/Tap or hover.*$/i, '').trim();

    const nutrition = {};
    const nutritionSection = section(markdown, /#{2,4}\s+Nutrition Information:?\s*/i, [
      /Keywords:/i,
      /Did you make/i,
      /First published/i
    ]);
    const nutritionKeys = ['Calories', 'Carbohydrates', 'Protein', 'Fat', 'Saturated Fat', 'Cholesterol', 'Sodium', 'Potassium', 'Fiber', 'Sugar', 'Vitamin A', 'Vitamin C', 'Calcium', 'Iron'];
    for (const key of nutritionKeys) {
      const pattern = new RegExp(`${key.replace(' ', '\\s*')}\\s*:?\\s*([^\\n]+?)(?=(?:${nutritionKeys.join('|')})\\s*:|$)`, 'i');
      const match = nutritionSection.match(pattern);
      if (match) nutrition[key] = match[1].trim();
    }

    const image = chooseFoodImage(markdown, base.title);
    let websiteRating = null;
    const ratingMatch = markdown.match(/([0-5](?:\.\d+)?)\s+from\s+([\d,]+)\s+votes/i);
    if (ratingMatch) websiteRating = { value: Number(ratingMatch[1]), count: Number(ratingMatch[2].replace(/,/g, '')) };

    if (ingredients.length < 2 || instructions.length < 1) throw new Error('Parsed recipe is incomplete');
    return {
      ...base,
      source_url: url,
      source_status: 'Downloaded from the official RecipeTin Eats public recipe page and stored on this device',
      sync_status: 'synced',
      ingredients,
      instructions,
      notes,
      nutrition,
      image_url: image || '',
      servings: servings || base.servings || '',
      prep_minutes: minsFromText(prepText) ?? base.prep_minutes,
      cook_minutes: minsFromText(cookText) ?? base.cook_minutes,
      total_time_minutes: minsFromText(totalText) ?? base.total_time_minutes,
      ingredient_count: ingredients.length,
      website_rating: websiteRating,
      transcription_quality: 'Official website recipe card'
    };
  }

  async function syncOne(recipe) {
    const found = await findRecipeUrl(recipe);
    return found.recipe || parseWebRecipe(found.markdown, found.url, recipe);
  }

  function setSyncButtons(disabled) {
    const counts = websiteLibraryCounts();
    $('#syncBtn').disabled = disabled || counts.missing === 0;
    $('#syncMissing').disabled = disabled || counts.missing === 0;
    $('#refreshSynced').disabled = disabled || counts.deviceCount === 0;
    $('#clearSynced').disabled = disabled || counts.deviceCount === 0;
  }

  async function getWakeLock() {
    try {
      return 'wakeLock' in navigator ? await navigator.wakeLock.request('screen') : null;
    } catch {
      return null;
    }
  }

  async function syncPass(targets, labelPrefix = 'Downloading') {
    let saved = 0;
    const failed = [];
    $('#syncProgress').max = Math.max(1, targets.length);
    $('#syncProgress').value = 0;
    for (let index = 0; index < targets.length; index += 1) {
      if (cancelSync) break;
      const recipe = targets[index];
      $('#syncLabel').textContent = `${labelPrefix} ${index + 1} of ${targets.length}`;
      $('#syncDetail').textContent = `${recipe.title} · ${websiteLibraryCounts().available}/${WEB_COUNT} available`;
      try {
        synced[String(recipe.id)] = await syncOne(recipe);
        save(KEYS.synced, synced);
        saved += 1;
      } catch (error) {
        failed.push(recipe);
        console.warn(recipe.title, error);
      }
      $('#syncProgress').value = index + 1;
      renderStats();
      await sleep(900);
    }
    return { saved, failed };
  }

  async function syncRecipes(mode = 'missing') {
    if (syncRunning) return;
    syncRunning = true;
    cancelSync = false;
    setSyncButtons(true);
    showSyncPanel();
    $('#syncLabel').textContent = 'Preparing sync…';
    $('#syncDetail').textContent = 'Checking which recipes need to be downloaded…';
    let wakeLock = null;
    getWakeLock().then(lock => { wakeLock = lock; }).catch(() => {});
    let totalSaved = 0;
    let remaining = [];
    try {
      const targets = BASE.filter(recipe => {
        if (!isWebsiteRecipe(recipe)) return false;
        if (mode === 'missing') return !hasWebsiteData(recipe);
        if (mode === 'downloaded') return !staticFor(recipe) && !!synced[String(recipe.id)];
        return true;
      });
      if (!targets.length) {
        toast(mode === 'missing' ? 'All website recipes are already available' : 'There are no old device downloads to refresh');
        return;
      }
      const first = await syncPass(targets, mode === 'downloaded' ? 'Refreshing' : 'Downloading');
      totalSaved += first.saved;
      remaining = first.failed;
      if (remaining.length && !cancelSync) {
        $('#syncLabel').textContent = `Retrying ${remaining.length} temporary failures`;
        $('#syncDetail').textContent = 'Waiting briefly so the reader service can recover…';
        await sleep(8000);
        if (!cancelSync) {
          const second = await syncPass(remaining, 'Retrying');
          totalSaved += second.saved;
          remaining = second.failed;
        }
      }
      render();
      if (cancelSync) toast(`Sync stopped. ${totalSaved} saved this time.`);
      else if (remaining.length) toast(`Sync saved ${totalSaved}; ${remaining.length} can be retried later.`);
      else toast(`${mode === 'downloaded' ? 'Refresh' : 'Sync'} complete: ${totalSaved} saved.`);
    } finally {
      try { await wakeLock?.release(); } catch {}
      hideSyncPanel();
      setSyncButtons(false);
      syncRunning = false;
      activeFetchController = null;
    }
  }

  async function cacheBundledFoodPhotos() {
    if (!('caches' in window)) {
      toast('Offline photo caching is not available in this browser');
      return;
    }
    const button = $('#cacheStaticPhotos');
    const status = $('#photoCacheStatus');
    const recipePhotos = allRecipes().map(recipe => imageFor(recipe)).filter(Boolean);
    const photoAssets = [...new Set([...STATIC_ASSETS, ...recipePhotos])];
    button.disabled = true;
    let cached = 0;
    try {
      const cache = await caches.open('dinner-recipes-v19-recipe-specific-food-photos');
      for (let index = 0; index < photoAssets.length; index += 6) {
        const batch = photoAssets.slice(index, index + 6);
        await Promise.allSettled(batch.map(async path => {
          const remote = /^https?:\/\//i.test(path);
          const request = new Request(path, { cache: 'reload', mode: remote ? 'no-cors' : 'same-origin' });
          const existing = await cache.match(request);
          if (!existing) {
            const response = await fetch(request);
            if (response.ok || response.type === 'opaque') await cache.put(request, response.clone());
          }
          cached += 1;
        }));
        status.textContent = `Saving food photos ${Math.min(index + batch.length, photoAssets.length)} of ${photoAssets.length}…`;
      }
      status.textContent = `${cached} food photos are ready for offline use.`;
      toast('Food photos saved for offline use');
    } catch (error) {
      status.textContent = 'Photo caching was interrupted. Tap the button to resume.';
      toast('Could not finish caching every photo');
      console.warn(error);
    } finally {
      button.disabled = false;
    }
  }

  function websiteLibraryCounts() {
    const staticCount = BASE.filter(recipe => isWebsiteRecipe(recipe) && !!staticFor(recipe)).length;
    const deviceCount = BASE.filter(recipe => isWebsiteRecipe(recipe) && !staticFor(recipe) && !!synced[String(recipe.id)]).length;
    return { staticCount, deviceCount, available: staticCount + deviceCount, missing: Math.max(0, WEB_COUNT - staticCount - deviceCount) };
  }

  function renderStats() {
    const dinnerCount = DINNER_INDEX.filter(recipe => !isWebsiteRecipe(recipe)).length;
    const tonightCount = TONIGHT_INDEX.length;
    const tonightComplete = TONIGHT_INDEX.filter(recipe => !recipe.index_only).length;
    const tonightMissing = tonightCount - tonightComplete;
    const counts = websiteLibraryCounts();
    $('#libraryStats').innerHTML = `<strong>${BASE.length}</strong> indexed recipes<br><strong>${dinnerCount}</strong> Dinner cookbook recipes bundled<br><strong>${tonightComplete} of ${tonightCount}</strong> TONIGHT entries include offline ingredients and directions${tonightMissing ? `<br><strong>${tonightMissing}</strong> TONIGHT entries remain online-only or index-only` : ''}<br><strong>${counts.staticCount} of ${WEB_COUNT}</strong> website recipes bundled with the app${counts.deviceCount ? `<br><strong>${counts.deviceCount}</strong> additional device-downloaded recipes` : ''}`;
    const headerSummary = $('#headerSummary');
    if (headerSummary) headerSummary.textContent = `${BASE.length} recipes · Dinner + TONIGHT + website library`;
    $('#syncBtn').textContent = counts.missing ? `Get ${counts.missing} unresolved recipes` : 'Website library included';
    $('#syncMissing').textContent = counts.missing ? `Download ${counts.missing} unresolved recipes` : 'All website recipes are bundled';
    $('#syncBtn').disabled = counts.missing === 0 || syncRunning;
    $('#syncMissing').disabled = counts.missing === 0 || syncRunning;
    $('#refreshSynced').hidden = counts.deviceCount === 0;
    $('#clearSynced').hidden = counts.deviceCount === 0;
    const buildStatus = $('#staticBuildStatus');
    if (buildStatus) buildStatus.textContent = counts.staticCount === WEB_COUNT
      ? 'The recipe text and exact publisher links are already part of this website. No phone-by-phone recipe sync is required.'
      : `${counts.staticCount} recipes are in the generated library. GitHub is still building or ${counts.missing} recipes need review.`;
    const cacheButton = $('#cacheStaticPhotos');
    if (cacheButton) cacheButton.disabled = STATIC_ASSETS.length === 0;
    const photoStatus = $('#photoCacheStatus');
    if (photoStatus && !/Saving|ready|interrupted/i.test(photoStatus.textContent)) photoStatus.textContent = `${allRecipes().length} recipe photos are available; save them once for full offline coverage.`;
  }


  function renderTonightBookCard() {
    const images = window.TONIGHT_INDEX_IMAGES || {};
    const cover = $('#tonightCover');
    if (cover && images['cover.jpg']) cover.innerHTML = `<img src="${images['cover.jpg']}" alt="RecipeTin Eats TONIGHT cookbook cover">`;
    const scans = $('#tonightIndexScans');
    if (scans) scans.innerHTML = Object.entries(images)
      .filter(([name]) => name !== 'cover.jpg')
      .map(([name, source]) => `<a href="${source}" target="_blank"><img loading="lazy" src="${source}" alt="TONIGHT cookbook index page ${esc(name)}"></a>`)
      .join('');
  }

  function exportBackup() {
    const backup = {
      version: 4,
      exported: new Date().toISOString(),
      synced,
      prefs,
      shopping,
      checked: shoppingChecked,
      ingredientChecked
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'Dinner_Recipe_Book_Backup.json';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function importBackup(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const backup = JSON.parse(reader.result);
        synced = backup.synced || {};
        prefs = backup.prefs || prefs;
        shopping = backup.shopping || {};
        shoppingChecked = backup.checked || {};
        ingredientChecked = backup.ingredientChecked || {};
        normalizePreferences();
        sanitizeSavedRecipes();
  discardReplacedDeviceCopies();
        save(KEYS.synced, synced);
        save(KEYS.prefs, prefs);
        save(KEYS.shopping, shopping);
        save(KEYS.shoppingChecked, shoppingChecked);
        save(KEYS.ingredientChecked, ingredientChecked);
        render();
        toast('Backup imported');
      } catch {
        toast('That backup file could not be read');
      }
    };
    reader.readAsText(file);
  }

  function openPhotoDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('rt_photos', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('photos');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function saveMealPhoto(id, file) {
    if (!file) return;
    const database = await openPhotoDB();
    const transaction = database.transaction('photos', 'readwrite');
    transaction.objectStore('photos').put(file, id);
    transaction.oncomplete = () => {
      if (mealPhotoUrls[id]) URL.revokeObjectURL(mealPhotoUrls[id]);
      mealPhotoUrls[id] = URL.createObjectURL(file);
      toast('Meal photo saved');
      loadMealPhoto(id);
      render();
    };
  }

  async function loadMealPhoto(id) {
    const box = $('#mealPhoto');
    if (!box) return;
    try {
      const database = await openPhotoDB();
      const transaction = database.transaction('photos');
      const request = transaction.objectStore('photos').get(id);
      request.onsuccess = () => {
        if (request.result) {
          if (!mealPhotoUrls[id]) mealPhotoUrls[id] = URL.createObjectURL(request.result);
          box.innerHTML = `<img src="${mealPhotoUrls[id]}" alt="Your meal photo" class="meal-photo-preview">`;
        }
      };
    } catch {}
  }

  async function loadAllMealPhotos() {
    try {
      const database = await openPhotoDB();
      const transaction = database.transaction('photos');
      const store = transaction.objectStore('photos');
      const keysRequest = store.getAllKeys();
      const valuesRequest = store.getAll();
      await new Promise(resolve => { transaction.oncomplete = resolve; transaction.onerror = resolve; });
      const keys = keysRequest.result || [];
      const values = valuesRequest.result || [];
      keys.forEach((key, index) => {
        if (!mealPhotoUrls[key] && values[index]) mealPhotoUrls[key] = URL.createObjectURL(values[index]);
      });
      renderGallery();
    } catch {}
  }

  function printShopping() {
    const items = compileShopping();
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`<html><head><title>Shopping list</title><style>body{font-family:system-ui;margin:30px}li{font-size:18px;margin:10px}</style></head><body><h1>Shopping list</h1><ul>${items.map(item => `<li>${esc(item.display)}</li>`).join('')}</ul><script>setTimeout(()=>print(),300)<\/script></body></html>`);
    printWindow.document.close();
  }

  function clearFilters() {
    $('#searchInput').value = '';
    ['bookFilter', 'sourceFilter', 'mealTypeFilter', 'mainIngredientFilter', 'cuisineFilter', 'totalTimeFilter', 'difficultyFilter', 'methodFilter', 'servingsFilter', 'sectionFilter', 'authorFilter', 'ratingFilter', 'ingredientFilter', 'prepFilter', 'cookFilter', 'gallerySourceFilter'].forEach(id => {
      const element = $(`#${id}`);
      if (element) element.value = '';
    });
    $('#ingredientsOnHand').value = '';
    $$('[data-diet-filter], [data-practical-filter], [data-personal-filter]').forEach(input => { input.checked = false; });
    render();
  }

  function bindFilterEvents() {
    const inputIds = ['searchInput', 'ingredientsOnHand'];
    const selectIds = ['bookFilter', 'sourceFilter', 'mealTypeFilter', 'mainIngredientFilter', 'cuisineFilter', 'totalTimeFilter', 'difficultyFilter', 'methodFilter', 'servingsFilter', 'sectionFilter', 'authorFilter', 'ratingFilter', 'ingredientFilter', 'prepFilter', 'cookFilter', 'gallerySourceFilter'];
    inputIds.forEach(id => $(`#${id}`).addEventListener('input', render));
    selectIds.forEach(id => $(`#${id}`).addEventListener('change', render));
    $$('[data-diet-filter], [data-practical-filter], [data-personal-filter]').forEach(input => input.addEventListener('change', render));
  }

  function requestMissingSync() {
    if (syncRunning) return;
    if (confirm('Try downloading only the unresolved website recipes? The generated library is used first.')) syncRecipes('missing');
  }

  function requestRefreshSync() {
    if (syncRunning) return;
    if (confirm('Refresh the remaining old device-downloaded recipes? Bundled recipes are not affected.')) syncRecipes('downloaded');
  }

  function init() {
    resetSyncUI();
    populateFilters();
    renderTonightBookCard();
    bindFilterEvents();

    $('#clearFilters').onclick = clearFilters;
    $('#randomBtn').onclick = () => {
      const recipes = filteredRecipes();
      if (recipes.length) openRecipe(recipes[Math.floor(Math.random() * recipes.length)].id);
    };
    $$('.tab').forEach(button => { button.onclick = () => showView(button.dataset.view); });
    $('#closeModal').onclick = () => {
      $('#modal').classList.add('hidden');
      document.body.style.overflow = '';
    };
    $('#modal').onclick = event => {
      if (event.target === $('#modal')) $('#closeModal').click();
    };

    $('#syncBtn').onclick = requestMissingSync;
    $('#cacheStaticPhotos').onclick = cacheBundledFoodPhotos;
    $('#syncMissing').onclick = requestMissingSync;
    $('#refreshSynced').onclick = requestRefreshSync;
    $('#cancelSync').onclick = () => {
      cancelSync = true;
      activeFetchController?.abort();
      $('#syncLabel').textContent = 'Stopping sync…';
      $('#syncDetail').textContent = 'The current request is being cancelled.';
    };
    $('#clearSynced').onclick = () => {
      if (confirm('Remove old device-downloaded recipe text? Bundled website recipes will remain available. Your favorites, notes and labels will remain.')) {
        synced = {};
        save(KEYS.synced, synced);
        render();
      }
    };

    $('#exportBackup').onclick = exportBackup;
    $('#importBackup').onchange = event => importBackup(event.target.files[0]);
    $('#clearShopping').onclick = () => {
      shopping = {};
      shoppingChecked = {};
      save(KEYS.shopping, shopping);
      save(KEYS.shoppingChecked, shoppingChecked);
      renderShopping();
    };
    $('#shareShopping').onclick = () => {
      const text = shoppingText();
      if (navigator.share) navigator.share({ title: 'Shopping list', text }).catch(() => {});
      else navigator.clipboard.writeText(text).then(() => toast('Shopping list copied'));
    };
    $('#printShopping').onclick = printShopping;

    render();
    loadAllMealPhotos();
    resolvePublicFoodImages();
    window.addEventListener('pageshow', () => { if (!syncRunning) resetSyncUI(); });
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js?v=18').catch(console.warn);
  }

  init();
})();
