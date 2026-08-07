#!/usr/bin/env node

/**
 * Letterboxd Contribution Graph Generator - CLI Entry Point
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { fetchProfileData, tryFetchMultipleYears, fetchSpecificYears, fetchAllDiaryEntries, fetchFilmDetails, imageToBase64, closeBrowser } from './fetcher.js';
import { generateSvg, generateMultiYearSvg } from './generator.js';
import { generateReviewCard, generateProfileCard, pickTopFilms, entriesForPeriod, POSTER_PIXEL_WIDTH, POSTER_PIXEL_HEIGHT, FAV_PIXEL_WIDTH, FAV_PIXEL_HEIGHT } from './cards.js';
import { svgToPng, imageBufferToThumbnail } from './exporter.js';
import { buildJsonExport, markRewatches } from './stats.js';
import { resolveYears } from './years.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  try {
    const args = process.argv.slice(2);

    let username = null;
    let years = resolveYears(''); // Default to the current year, UTC like the diary
    let weekStart = "sunday";
    let outputBasePath = path.join("images", "github-letterboxd");
    let usernameGradient = true;
    let yearGradient = true;
    let exportPng = false;
    let mode = "count"; // 'count' or 'rating'
    let animate = true; // CSS reveal animation for grid cells
    let scope = "all"; // 'all' fetches the whole diary, 'years' only the -y years
    let monthCards = 2; // recent months to also make review cards for
    let topFilms = "watched"; // 'watched' or 'released' for the card's film list

    // Parse arguments
    for (let i = 0; i < args.length; i++) {
      if (args[i].startsWith('-')) {
        const flag = args[i].substring(1).toLowerCase();
        const value = args[i + 1] || "";
        
        switch (flag) {
          case 'y':
            // A list ("2026,2025") or a relative span ("last 2")
            years = resolveYears(value);
            i++;
            break;
          case 'w':
            weekStart = ['sunday', 'monday'].includes(value) ? value : 'sunday';
            i++;
            break;
          case 'o':
            outputBasePath = path.join(path.dirname(value), path.basename(value));
            i++;
            break;
          case 'g': {
            // Accepts the original true/false as well as naming the individual
            // targets, so existing workflows keep working.
            const targets = value.toLowerCase();
            usernameGradient = ['true', 'both', 'name', ''].includes(targets);
            yearGradient = ['true', 'both', 'year', ''].includes(targets);
            i++;
            break;
          }
          case 'p':
          case '-png':
            exportPng = true;
            break;
          case 'm':
            mode = ['count', 'rating'].includes(value) ? value : 'count';
            i++;
            break;
          case 'a':
            animate = value.toLowerCase() !== 'false';
            i++;
            break;
          case 's':
            scope = ['all', 'years'].includes(value) ? value : 'all';
            i++;
            break;
          case 'r':
            topFilms = ['watched', 'released'].includes(value) ? value : 'watched';
            i++;
            break;
          case 'c': {
            const parsed = Number.parseInt(value, 10);
            monthCards = Number.isInteger(parsed) && parsed >= 0 ? parsed : 2;
            i++;
            break;
          }
          default:
            console.warn(`Unknown flag "${flag}", ignoring`);
        }
      } else if (i === 0 || !username) {
        username = args[i];
      }
    }

    if (!username) {
      console.error("Error: No username provided.");
      console.log("Usage: node src/cli.js <username> [options]");
      console.log("Options:");
      console.log("  -y <years>    Year(s): a list like 2026,2025 or a span like \"last 2\"");
      console.log("  -w <day>      Week start: sunday or monday (default: sunday)");
      console.log("  -o <path>     Output path (default: images/github-letterboxd)");
      console.log("  -g <targets>  Gradient text: true, false, name or year (default: true)");
      console.log("  -p            Also export PNG files");
      console.log("  -m <mode>     Graph mode: count or rating (default: count)");
      console.log("  -a <bool>     Cell reveal animation: true or false (default: true)");
      console.log("  -s <scope>    Diary scope: all or years (default: all)");
      console.log("  -c <count>    Recent months to also make cards for, 0 to skip (default: 2)");
      console.log("  -r <scope>    Card film list: watched or released (default: watched)");
      process.exit(1);
    }

    const outputPathDark = `${outputBasePath}-dark.svg`;
    const outputPathLight = `${outputBasePath}-light.svg`;
    const outputJsonPath = path.join(path.dirname(outputBasePath), 'letterboxd-data.json');

    console.log(`\n🎬 Letterboxd Contribution Graph Generator\n`);
    console.log(`Username: ${username}`);
    console.log(`Years: ${years.join(', ')}`);
    console.log(`Week starts on: ${weekStart}`);
    console.log(`Mode: ${mode}`);
    console.log(`Animation: ${animate ? '✓' : '✗'}`);
    console.log(`Scope: ${scope === 'all' ? 'complete diary' : `only ${years.join(', ')}`}`);
    console.log(`Month cards: ${monthCards === 0 ? '✗' : `last ${monthCards}`}`);
    console.log(`Card films: ${topFilms === 'released' ? 'releases of that year' : 'everything watched'}`);
    console.log(`Gradient: name ${usernameGradient ? '✓' : '✗'}, year ${yearGradient ? '✓' : '✗'}`);
    console.log(`PNG Export: ${exportPng ? '✓' : '✗'}`);
    console.log(`Output: ${outputPathDark}, ${outputPathLight}, ${outputJsonPath}\n`);

    // Fetch profile data
    console.log("📋 Fetching profile data...");
    const { profileImage, displayName, followers, following, totalEntries, memberStatus, favourites } = await fetchProfileData(username);
    const profileImageBase64 = profileImage ? await imageToBase64(profileImage) : null;
    console.log(`   Display Name: ${displayName}`);
    console.log(`   Followers: ${followers}, Following: ${following}`);
    console.log(`   Total Films: ${totalEntries}, Member Status: ${memberStatus || 'None'}`);
    console.log(`   Profile Image: ${profileImageBase64 ? '✓' : '✗'}`);
    console.log(`   Favourites: ${favourites.length}\n`);

    // Fetch Letterboxd logo
    console.log("🎬 Fetching Letterboxd logo...");
    const logoBase64 = await imageToBase64("https://a.ltrbxd.com/logos/letterboxd-decal-dots-pos-rgb-500px.png");
    console.log(`   Logo: ${logoBase64 ? '✓' : '✗'}\n`);

    // Fetch diary entries. In 'all' scope the whole diary is fetched once and
    // the graph years are filtered out of it, so the extra years cost nothing
    // beyond the pages they live on.
    console.log("📖 Fetching diary entries...");
    let allEntries;

    if (scope === 'all') {
      allEntries = await fetchAllDiaryEntries(username);
    } else if (years.length === 1) {
       // Single year - use tryFetchMultipleYears logic (backwards compat) or direct fetch
       // Using tryFetchMultipleYears to keep robustness if current year is empty
       allEntries = await tryFetchMultipleYears(username, years[0]);
    } else {
       // Multiple specific years
       allEntries = await fetchSpecificYears(username, years);
    }

    // Fill in the rewatches Letterboxd's hand-set flag missed, before anything
    // reads the entries, so tooltips, stats, cards and the export agree.
    allEntries = markRewatches(allEntries);

    // The graphs and the year cards only ever show the requested years
    const filmEntries = scope === 'all'
      ? allEntries.filter(entry => years.includes(entry.date.getUTCFullYear()))
      : allEntries;

    console.log(`\n📊 Found ${allEntries.length} film entries`
      + (scope === 'all' ? `, ${filmEntries.length} in ${years.join(', ')}` : '') + '\n');

    // Generate SVGs
    console.log("🎨 Generating SVG graphs...");
    
    const svgOptions = { 
      weekStart, 
      username, 
      profileImage: profileImageBase64, 
      displayName,
      logoBase64,
      usernameGradient,
      yearGradient,
      followers,
      following,
      totalEntries,
      memberStatus,
      mode,
      animate,
      topFilms
    };
    
    let svgDark, svgLight;
    
    if (years.length > 1) {
      // Multi-year generation
      const multiOptions = { ...svgOptions, years };
      svgDark = await generateMultiYearSvg(filmEntries, { ...multiOptions, theme: 'dark' });
      svgLight = await generateMultiYearSvg(filmEntries, { ...multiOptions, theme: 'light' });
    } else {
      // Single year generation
      const singleOptions = { ...svgOptions, year: years[0] };
      svgDark = await generateSvg(filmEntries, { ...singleOptions, theme: 'dark' });
      svgLight = await generateSvg(filmEntries, { ...singleOptions, theme: 'light' });
    }

    // Ensure output directory exists
    const dir = path.dirname(outputPathDark);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write SVG files
    fs.writeFileSync(outputPathDark, svgDark);
    fs.writeFileSync(outputPathLight, svgLight);

    // Write JSON export for Glance custom-api and other consumers
    const jsonExport = buildJsonExport(filmEntries, {
      username,
      year: years.length === 1 ? years[0] : null,
      years,
      weekStart,
      recentLimit: 10,
      // The graph and its cells stay scoped to the requested years; the all-time
      // block covers whatever was fetched, which in 'all' scope is the lot.
      allEntries,
      totalFilms: totalEntries,
      scope
    });
    fs.writeFileSync(outputJsonPath, JSON.stringify(jsonExport, null, 2));

    console.log(`   ✓ ${outputPathDark}`);
    console.log(`   ✓ ${outputPathLight}`);
    console.log(`   ✓ ${outputJsonPath}`);

    // Review cards. A period is a year or a single month within one; the card
    // is the same either way, so both come out of the same loop.
    console.log("\n🃏 Generating review cards...");
    const reviewCards = [];
    const sortedYears = [...years].sort((a, b) => b - a);

    // Years are named after themselves. Months are named by how recent they
    // are, not by their date: a dated file would break every embed at the turn
    // of the month, and nothing would ever delete the old ones.
    const periods = sortedYears.map(year => ({ year, slug: String(year) }));
    const now = new Date();

    for (let back = 0; back < monthCards; back++) {
      const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
      const slug = back === 0 ? 'current-month' : back === 1 ? 'previous-month' : `month-minus-${back}`;
      periods.push({ year: cursor.getUTCFullYear(), month: cursor.getUTCMonth() + 1, slug });
    }

    // Posters are only needed for the films that actually make a card, so they
    // are resolved once here rather than per theme. A missing poster is not an
    // error: the card falls back to a plain placeholder.
    const posters = new Map();
    const favouritePosters = new Map();
    const details = new Map();

    // One request per film covers the poster, the runtime and the community
    // rating, so details are cached across the year and profile cards.
    const loadFilm = async (films, target, width, height) => {
      for (const film of films) {
        if (!film.url || target.has(film.url)) continue;

        const detail = details.get(film.url) || await fetchFilmDetails(film.url);
        details.set(film.url, detail);
        if (!detail.poster) continue;

        try {
          const response = await fetch(detail.poster);
          if (!response.ok) continue;

          const thumbnail = await imageBufferToThumbnail(
            Buffer.from(await response.arrayBuffer()),
            width,
            height
          );
          if (thumbnail) target.set(film.url, thumbnail);
        } catch (error) {
          console.warn(`   Could not load poster for ${film.title}: ${error.message}`);
        }
      }
    };

    // Mirrors the card: the release filter is for year cards only.
    const listFor = (period) => {
      const inPeriod = entriesForPeriod(allEntries, period);
      return topFilms === 'released' && period.month == null
        ? inPeriod.filter(entry => String(entry.year) === String(period.year))
        : inPeriod;
    };
    const cardFilms = [
      ...periods.flatMap(period => pickTopFilms(listFor(period))),
      ...pickTopFilms(allEntries, 3)
    ];
    await loadFilm(cardFilms, posters, POSTER_PIXEL_WIDTH, POSTER_PIXEL_HEIGHT);
    await loadFilm(favourites, favouritePosters, FAV_PIXEL_WIDTH, FAV_PIXEL_HEIGHT);
    console.log(`   Posters: ${posters.size}/${new Set(cardFilms.map(f => f.url)).size}`
      + `, favourites ${favouritePosters.size}/${favourites.length}`);

    for (const period of periods) {
      for (const theme of ['dark', 'light']) {
        const cardPath = path.join(dir, `letterboxd-review-${period.slug}-${theme}.svg`);
        const card = await generateReviewCard(allEntries, {
          ...svgOptions,
          year: period.year,
          month: period.month ?? null,
          theme,
          posters,
          details
        });

        fs.writeFileSync(cardPath, card);
        reviewCards.push({ path: cardPath, svg: card });
        console.log(`   ✓ ${cardPath}`);
      }
    }

    // Anything matching the card naming scheme that this run did not write is
    // left over from an earlier configuration: dated month files, or a year
    // that has since been dropped from -y. Nothing else in the directory is
    // touched.
    const written = new Set(reviewCards.map(card => path.basename(card.path)));
    for (const name of fs.readdirSync(dir)) {
      if (!/^letterboxd-review-.+\.(svg|png)$/.test(name)) continue;
      if (written.has(name) || written.has(name.replace(/\.png$/, '.svg'))) continue;

      fs.unlinkSync(path.join(dir, name));
      console.log(`   ✗ removed stale ${name}`);
    }

    // Profile card, not tied to a single year
    const profileCardPaths = ['dark', 'light'].map(theme =>
      path.join(dir, `letterboxd-profile-${theme}.svg`));

    for (const [index, theme] of ['dark', 'light'].entries()) {
      const card = await generateProfileCard(allEntries, {
        ...svgOptions,
        theme,
        years: scope === 'all'
          ? [...new Set(allEntries.map(entry => entry.date.getUTCFullYear()))].sort((a, b) => a - b)
          : years,
        allTime: scope === 'all',
        totalEntries,
        favourites,
        posters,
        favouritePosters,
        details
      });

      fs.writeFileSync(profileCardPaths[index], card);
      reviewCards.push({ path: profileCardPaths[index], svg: card });
      console.log(`   ✓ ${profileCardPaths[index]}`);
    }

    // Export PNGs if requested
    if (exportPng) {
      console.log("\n📸 Exporting PNG files...");
      const pngPathDark = outputPathDark.replace('.svg', '.png');
      const pngPathLight = outputPathLight.replace('.svg', '.png');
      
      // Calculate scale - for multi-year we might want distinct scaling?
      // Default scale 2 is fine
      await svgToPng(svgDark, pngPathDark);
      await svgToPng(svgLight, pngPathLight);

      for (const card of reviewCards) {
        await svgToPng(card.svg, card.path.replace('.svg', '.png'));
      }
    }
    
    // Close the browser instance
    await closeBrowser();
    
    console.log(`\n✅ Done!\n`);

  } catch (error) {
    console.error("\n❌ Error:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
