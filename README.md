# Dinner Recipe Book — static website library (version 9)

This version keeps the 71 cookbook-photo recipes and the version 8 Gallery, filters, checkboxes and serving multiplier. It replaces the slow phone-by-phone website sync with a generated static library.

## How the static library works

After these files are uploaded, the included GitHub Actions workflow runs once in the repository. It:

1. Reads the 96 public RecipeTin Eats entries from `recipes-data.js`.
2. Finds and validates each official publisher page.
3. Extracts the recipe card data from Schema.org JSON-LD or the visible WP Recipe Maker card.
4. Downloads and resizes the main food photo.
5. Commits `website-recipes.js`, `website-assets.js`, `static-build-report.json`, and the food photos back to the repository.

After that commit is published by GitHub Pages, recipe text and exact publisher links are part of the website itself. The phone does not need to search and parse 96 pages.

## Install over the current repository

1. Extract the version 9 ZIP.
2. Upload **everything inside the extracted folder** to the root of the existing `dinner-recipe-book` repository, including the `.github` and `tools` folders.
3. Replace files when GitHub reports duplicate names, and commit directly to `main`.
4. Open the repository's **Actions** tab. The workflow named **Build static website recipe library** should start automatically.
5. Wait until the workflow has a green check. It will make a second commit named **Build static website recipe library**.
6. Wait for GitHub Pages to publish that commit, then open `/update.html` once on the phone.

The app's Settings page will show how many of the 96 website recipes are in the generated library. When it reaches 96 of 96, the old sync buttons are disabled.

## Offline food photos

Recipe text is bundled and available with the app. In Settings, use **Save all bundled food photos offline** to cache the generated food-photo files on the phone. Gallery images also cache as they are viewed.

## Personal data

Favourites, ratings, notes, shopping selections, ingredient checkmarks, personal labels and meal photos remain in browser storage. The app removes old device-downloaded copies only when an equivalent static recipe is present, preventing older incorrect photos or recipe text from overriding the generated library.

## Build report

`static-build-report.json` lists the exact URL and title match used for every recipe. If any recipe cannot be resolved, the app still retains the old on-device fallback for only those unresolved entries, and rerunning the workflow preserves completed entries while trying the failures again.
