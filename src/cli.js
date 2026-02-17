#!/usr/bin/env node

/**
 * Letterboxd Contribution Graph Generator - CLI Entry Point
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { fetchProfileData, tryFetchMultipleYears, fetchSpecificYears, imageToBase64, closeBrowser } from './fetcher.js';
import { generateSvg, generateMultiYearSvg } from './generator.js';
import { svgToPng } from './exporter.js';
import { buildJsonExport } from './stats.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  try {
    const args = process.argv.slice(2);

    let username = null;
    let years = [new Date().getFullYear()]; // Default to current year
    let weekStart = "sunday";
    let outputBasePath = path.join("images", "github-letterboxd");
    let usernameGradient = true;
    let exportPng = false;
    let mode = "count"; // 'count' or 'rating'

    // Parse arguments
    for (let i = 0; i < args.length; i++) {
      if (args[i].startsWith('-')) {
        const flag = args[i].substring(1).toLowerCase();
        const value = args[i + 1] || "";
        
        switch (flag) {
          case 'y':
            // Handle comma-separated years (e.g. 2024,2023)
            if (value.includes(',')) {
              years = value.split(',').map(y => parseInt(y.trim())).filter(y => !isNaN(y));
            } else {
              years = [Number.parseInt(value) || new Date().getFullYear()];
            }
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
          case 'g':
            usernameGradient = value.toLowerCase() !== 'false';
            i++;
            break;
          case 'p':
          case '-png':
            exportPng = true;
            break;
          case 'm':
            mode = ['count', 'rating'].includes(value) ? value : 'count';
            i++;
            break;
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
      console.log("  -y <years>    Specify year(s), comma-separated (e.g. 2024,2023)");
      console.log("  -w <day>      Week start: sunday or monday (default: sunday)");
      console.log("  -o <path>     Output path (default: images/github-letterboxd)");
      console.log("  -g <bool>     Username gradient: true or false (default: true)");
      console.log("  -p            Also export PNG files");
      console.log("  -m <mode>     Graph mode: count or rating (default: count)");
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
    console.log(`Gradient: ${usernameGradient ? '✓' : '✗'}`);
    console.log(`PNG Export: ${exportPng ? '✓' : '✗'}`);
    console.log(`Output: ${outputPathDark}, ${outputPathLight}, ${outputJsonPath}\n`);

    // Fetch profile data
    console.log("📋 Fetching profile data...");
    const { profileImage, displayName, followers, following, totalEntries, memberStatus } = await fetchProfileData(username);
    const profileImageBase64 = profileImage ? await imageToBase64(profileImage) : null;
    console.log(`   Display Name: ${displayName}`);
    console.log(`   Followers: ${followers}, Following: ${following}`);
    console.log(`   Total Films: ${totalEntries}, Member Status: ${memberStatus || 'None'}`);
    console.log(`   Profile Image: ${profileImageBase64 ? '✓' : '✗'}\n`);

    // Fetch Letterboxd logo
    console.log("🎬 Fetching Letterboxd logo...");
    const logoBase64 = await imageToBase64("https://a.ltrbxd.com/logos/letterboxd-decal-dots-pos-rgb-500px.png");
    console.log(`   Logo: ${logoBase64 ? '✓' : '✗'}\n`);

    // Fetch diary entries
    console.log("📖 Fetching diary entries...");
    let filmEntries;
    
    if (years.length === 1) {
       // Single year - use tryFetchMultipleYears logic (backwards compat) or direct fetch
       // Using tryFetchMultipleYears to keep robustness if current year is empty
       filmEntries = await tryFetchMultipleYears(username, years[0]);
    } else {
       // Multiple specific years
       filmEntries = await fetchSpecificYears(username, years);
    }
    
    console.log(`\n📊 Found ${filmEntries.length} film entries\n`);

    // Generate SVGs
    console.log("🎨 Generating SVG graphs...");
    
    const svgOptions = { 
      weekStart, 
      username, 
      profileImage: profileImageBase64, 
      displayName,
      logoBase64,
      usernameGradient,
      followers,
      following,
      totalEntries,
      memberStatus,
      mode
    };
    
    let svgDark, svgLight;
    
    if (years.length > 1) {
      // Multi-year generation
      const multiOptions = { ...svgOptions, years };
      svgDark = generateMultiYearSvg(filmEntries, { ...multiOptions, theme: 'dark' });
      svgLight = generateMultiYearSvg(filmEntries, { ...multiOptions, theme: 'light' });
    } else {
      // Single year generation
      const singleOptions = { ...svgOptions, year: years[0] };
      svgDark = generateSvg(filmEntries, { ...singleOptions, theme: 'dark' });
      svgLight = generateSvg(filmEntries, { ...singleOptions, theme: 'light' });
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
      recentLimit: 10
    });
    fs.writeFileSync(outputJsonPath, JSON.stringify(jsonExport, null, 2));

    console.log(`   ✓ ${outputPathDark}`);
    console.log(`   ✓ ${outputPathLight}`);
    console.log(`   ✓ ${outputJsonPath}`);

    // Export PNGs if requested
    if (exportPng) {
      console.log("\n📸 Exporting PNG files...");
      const pngPathDark = outputPathDark.replace('.svg', '.png');
      const pngPathLight = outputPathLight.replace('.svg', '.png');
      
      // Calculate scale - for multi-year we might want distinct scaling?
      // Default scale 2 is fine
      await svgToPng(svgDark, pngPathDark);
      await svgToPng(svgLight, pngPathLight);
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
