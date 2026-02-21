/**
 * Letterboxd Data Fetcher
 * Handles scraping diary entries and profile data from Letterboxd
 * Uses Puppeteer with Stealth Plugin to bypass Cloudflare bot protection
 */

import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Use the stealth plugin to avoid detection
puppeteer.use(StealthPlugin());

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CURL_CFFI_SCRIPT_PATH = path.join(__dirname, 'fetch_with_curl_cffi.py');

/**
 * Common browser headers to avoid being blocked by anti-scraping measures
 */
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1'
};

// Shared browser instance
let browserInstance = null;
let sharedPage = null;
let sessionPrimed = false;
let consecutiveCloudflareFailures = 0;
let curlCffiAvailable = null;
let curlCffiUnavailableLogged = false;

const RETRYABLE_STATUS_CODES = new Set([403, 429, 503]);
const MAX_CONSECUTIVE_CF_FAILURES = 3;
const PAGE_ROTATION_INTERVAL = 3;

const CLOUDFLARE_STRONG_MARKERS = [
  /cloudflare ray id/i,
  /cf_chl/i,
  /challenge-platform/i,
  /cdn-cgi\/challenge-platform/i,
  /cf-browser-verification/i,
  /cf-turnstile/i
];

const CLOUDFLARE_WEAK_MARKERS = [
  /just a moment/i,
  /checking your browser/i,
  /attention required/i,
  /security challenge/i,
  /permission denied/i,
  /verify you are human/i,
  /captcha/i,
  /ddos protection/i
];

function isCloudflareChallengePage(html) {
  if (!html) return false;
  if (CLOUDFLARE_STRONG_MARKERS.some((pattern) => pattern.test(html))) {
    return true;
  }

  const hasWeakMarker = CLOUDFLARE_WEAK_MARKERS.some((pattern) => pattern.test(html));
  const hasCloudflareText = /cloudflare|cf-ray|cdn-cgi/i.test(html);
  const hasVerificationHint = /(verify|security check|browser check|challenge|access denied)/i.test(html);

  return hasWeakMarker && hasCloudflareText && hasVerificationHint;
}

function hasExpectedPageContent(html, url) {
  if (!html || !url) return false;

  if (url.includes('/diary/')) {
    return /id=["']diary-table["']/i.test(html) || /diary-entry-row/i.test(html);
  }

  const isProfileRoute = /^https:\/\/letterboxd\.com\/[^/]+\/?$/.test(url);
  if (isProfileRoute) {
    return /person-display-name|profile-avatar|profile-header/i.test(html);
  }

  if (url === 'https://letterboxd.com/' || url === 'https://letterboxd.com') {
    return /<title>.*letterboxd/i.test(html);
  }

  return false;
}

class CloudflareChallengeError extends Error {
  constructor(url, status = null) {
    const statusSuffix = status ? ` (HTTP ${status})` : '';
    super(`Cloudflare challenge blocked request: ${url}${statusSuffix}`);
    this.name = 'CloudflareChallengeError';
  }
}

function isCloudflareResponse(response) {
  if (!response) return false;

  const status = response.status();
  const headers = response.headers?.() || {};
  const server = (headers.server || '').toLowerCase();
  const hasCloudflareHeader = ['cf-ray', 'cf-cache-status', 'cf-mitigated'].some((key) => key in headers);

  return RETRYABLE_STATUS_CODES.has(status) && (hasCloudflareHeader || server.includes('cloudflare') || status === 403);
}

function retryDelayMs(attempt, isCloudflareRetry = false) {
  const baseMs = isCloudflareRetry ? 4000 : 2500;
  const growth = isCloudflareRetry ? 1.9 : 1.5;
  const jitterMs = Math.round(Math.random() * 1200);
  const delayMs = baseMs * Math.pow(growth, attempt - 1);
  return Math.min(Math.round(delayMs + jitterMs), 45000);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function isCurlCffiAvailable() {
  if (curlCffiAvailable !== null) {
    return curlCffiAvailable;
  }

  try {
    await execFileAsync('python3', ['-c', 'import curl_cffi']);
    curlCffiAvailable = true;
  } catch {
    curlCffiAvailable = false;
  }

  return curlCffiAvailable;
}

async function fetchPageWithCurlCffi(url, retries = 5) {
  const available = await isCurlCffiAvailable();
  if (!available) {
    throw new Error('curl_cffi_unavailable');
  }

  try {
    const { stdout, stderr } = await execFileAsync(
      'python3',
      [CURL_CFFI_SCRIPT_PATH, url, String(retries)],
      { maxBuffer: 10 * 1024 * 1024 }
    );

    if (stderr && stderr.trim()) {
      console.log(`  curl_cffi: ${stderr.trim().split('\n').join(' | ')}`);
    }

    if (!hasExpectedPageContent(stdout, url) && isCloudflareChallengePage(stdout)) {
      throw new CloudflareChallengeError(url, 403);
    }

    return stdout;
  } catch (error) {
    const stderr = typeof error?.stderr === 'string' ? error.stderr : '';
    const combined = `${stderr}\n${error?.message || ''}`.toLowerCase();

    if (combined.includes('cloudflare_block') || combined.includes('http 403')) {
      throw new CloudflareChallengeError(url, 403);
    }

    throw new Error(`curl_cffi request failed for ${url}: ${stderr || error?.message || 'unknown error'}`);
  }
}

async function fetchPage(url) {
  const canUseCurlCffi = await isCurlCffiAvailable();
  if (canUseCurlCffi) {
    try {
      return await fetchPageWithCurlCffi(url);
    } catch (error) {
      const isCfError = error instanceof CloudflareChallengeError;
      const reason = isCfError ? 'Cloudflare challenge' : error.message;
      console.log(`  curl_cffi failed (${reason}), falling back to Puppeteer...`);
    }
  } else if (!curlCffiUnavailableLogged) {
    console.log('  curl_cffi unavailable, using Puppeteer fallback.');
    curlCffiUnavailableLogged = true;
  }

  return fetchPageWithPuppeteer(url);
}

/**
 * Get or create a shared browser instance
 */
async function getBrowser() {
  if (!browserInstance) {
    browserInstance = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080'
      ]
    });
  }
  return browserInstance;
}

async function createConfiguredPage() {
  const browser = await getBrowser();
  const page = await browser.newPage();

  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent(BROWSER_HEADERS['User-Agent']);
  await page.setExtraHTTPHeaders({
    'Accept': BROWSER_HEADERS.Accept,
    'Accept-Language': BROWSER_HEADERS['Accept-Language'],
    'Cache-Control': BROWSER_HEADERS['Cache-Control'],
    'Pragma': BROWSER_HEADERS.Pragma,
    'Upgrade-Insecure-Requests': BROWSER_HEADERS['Upgrade-Insecure-Requests']
  });
  await page.setDefaultNavigationTimeout(120000);
  await page.setDefaultTimeout(30000);
  await page.setRequestInterception(true);

  page.on('request', (request) => {
    const resourceType = request.resourceType();
    if (resourceType === 'image' || resourceType === 'media' || resourceType === 'font') {
      request.abort().catch(() => {});
      return;
    }
    request.continue().catch(() => {});
  });

  return page;
}

async function getSharedPage({ forceNew = false } = {}) {
  if (forceNew && sharedPage) {
    try {
      await sharedPage.close();
    } catch {
      // no-op; page may already be closed
    }
    sharedPage = null;
    sessionPrimed = false;
  }

  if (!sharedPage || sharedPage.isClosed()) {
    sharedPage = await createConfiguredPage();
    sessionPrimed = false;
  }

  return sharedPage;
}

async function resetSession() {
  if (sharedPage) {
    try {
      await sharedPage.close();
    } catch {
      // no-op; page may already be closed
    }
    sharedPage = null;
  }

  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }

  sessionPrimed = false;
}

async function resolveCloudflareChallenge(page, url, attempt) {
  let content = await page.content();

  if (hasExpectedPageContent(content, url) || !isCloudflareChallengePage(content)) {
    return content;
  }

  const maxWaitMs = 12000 + (attempt * 4000);
  const pollMs = 2000;
  let waited = 0;

  while (waited < maxWaitMs) {
    await sleep(pollMs + randomBetween(0, 600));
    waited += pollMs;
    content = await page.content();
    if (hasExpectedPageContent(content, url) || !isCloudflareChallengePage(content)) {
      return content;
    }
  }

  throw new CloudflareChallengeError(url);
}

async function primeSession(page) {
  if (sessionPrimed) {
    return;
  }

  const response = await page.goto('https://letterboxd.com/', {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });

  if (response && response.status() >= 400 && isCloudflareResponse(response)) {
    throw new CloudflareChallengeError('https://letterboxd.com/', response.status());
  }

  await sleep(900 + randomBetween(100, 600));
  await resolveCloudflareChallenge(page, 'https://letterboxd.com/', 1);
  sessionPrimed = true;
}

async function recoverSessionAfterCloudflare(attempt) {
  consecutiveCloudflareFailures += 1;

  const shouldReset = consecutiveCloudflareFailures >= MAX_CONSECUTIVE_CF_FAILURES;
  if (shouldReset) {
    console.log('  Reinitializing browser session after repeated Cloudflare blocks...');
    await resetSession();
    consecutiveCloudflareFailures = 0;
    return;
  }

  try {
    const page = await getSharedPage({ forceNew: attempt % PAGE_ROTATION_INTERVAL === 0 });
    sessionPrimed = false;
    await primeSession(page);
  } catch {
    // Best effort recovery; regular retry flow handles further attempts.
  }
}

/**
 * Close the shared browser instance
 */
export async function closeBrowser() {
  await resetSession();
}
/**
 * Fetch page content using Puppeteer (bypasses Cloudflare)
 * Includes retry logic for unreliable connections
 */
async function fetchPageWithPuppeteer(url, retries = 7) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const forceNewPage = attempt > 1 && attempt % PAGE_ROTATION_INTERVAL === 0;
      const page = await getSharedPage({ forceNew: forceNewPage });
      await primeSession(page);

      await sleep(randomBetween(250, 900));

      // Increase timeout progressively across retries.
      const navTimeout = 50000 + (attempt * 18000);

      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: navTimeout
      });

      if (response && response.status() >= 400) {
        if (isCloudflareResponse(response)) {
          throw new CloudflareChallengeError(url, response.status());
        }
        throw new Error(`HTTP ${response.status()} while fetching ${url}`);
      }
      
      if (url.includes('/diary/')) {
        // Wait for the diary table to load (or timeout after 15 seconds)
        try {
          await page.waitForSelector('#diary-table', { timeout: 15000 });
        } catch {
          // Table might not exist on this page, continue anyway
        }
      }
      
      await sleep(900 + randomBetween(100, 900));
      const content = await resolveCloudflareChallenge(page, url, attempt);

      consecutiveCloudflareFailures = 0;
      return content;
    } catch (error) {
      const isCloudflareRetry = error instanceof CloudflareChallengeError;
      if (isCloudflareRetry) {
        await recoverSessionAfterCloudflare(attempt);
      }

      if (attempt === retries) {
        throw error;
      }

      const waitMs = retryDelayMs(attempt, isCloudflareRetry);
      const retryLabel = isCloudflareRetry ? ' (Cloudflare challenge)' : '';
      console.log(`  Attempt ${attempt} failed${retryLabel}, retrying in ${Math.ceil(waitMs / 1000)}s...`);
      await sleep(waitMs);
    }
  }
}

/**
 * Parse diary entries from HTML content
 */
function parseDiaryEntries(html, year) {
  const $ = cheerio.load(html);
  const entries = [];
  
  const diaryTable = $("#diary-table");
  if (diaryTable.length === 0) {
    return { entries: [], hasMore: false };
  }

  const entryRows = diaryTable.find("tr.diary-entry-row");
  
  entryRows.each((_, row) => {
    try {
      const $row = $(row);
      const dayElement = $row.find("td.col-daydate a");
      const dayUrl = dayElement.attr('href');
      
      if (!dayUrl) {
        return;
      }
      
      const urlParts = dayUrl.split('/').filter(part => part);
      const yearIndex = urlParts.indexOf('for') + 1;
      const monthIndex = yearIndex + 1;
      const dayIndex = monthIndex + 1;

      if (yearIndex === 0 || !urlParts[yearIndex] || !urlParts[monthIndex] || !urlParts[dayIndex]) {
        return;
      }

      const entryYear = Number.parseInt(urlParts[yearIndex]);
      const month = urlParts[monthIndex];
      const day = urlParts[dayIndex];

      const titleElement = $row.find("h2.name a");
      const title = titleElement.text().trim();
      const filmYearElement = $row.find("td.col-releaseyear span");
      const filmYear = filmYearElement.text().trim();

      if (!title) {
        return;
      }

      let rating = null;
      const ratingSpan = $row.find("td.col-rating .rating");
      if (ratingSpan.length > 0) {
        const ratingClass = ratingSpan.attr("class");
        const ratingMatch = ratingClass.match(/rated-(\d+)/);
        if (ratingMatch && ratingMatch[1]) {
          rating = Number(ratingMatch[1]) / 2;
        }
      }

      const monthNames = {
        '01': 0, '02': 1, '03': 2, '04': 3, '05': 4, '06': 5,
        '07': 6, '08': 7, '09': 8, '10': 9, '11': 10, '12': 11
      };

      const monthNum = monthNames[month];
      const titleLink = titleElement.attr("href");

      if (monthNum !== undefined && day && entryYear === year) {
        const date = new Date(Date.UTC(year, monthNum, Number.parseInt(day)));
        const filmUrl = titleLink ? `https://letterboxd.com${titleLink}` : undefined;

        entries.push({
          date,
          title,
          year: filmYear,
          rating,
          url: filmUrl
        });
      }
    } catch (err) {
      // Skip invalid entries silently
    }
  });

  // Check if there's a next page
  const nextPageLink = $(".paginate-nextprev .next");
  const hasMore = nextPageLink.length > 0 && !nextPageLink.hasClass("disabled");

  return { entries, hasMore };
}

/**
 * Fetch diary entries for a specific year with curl_cffi primary and Puppeteer fallback
 */
export async function fetchLetterboxdData(username, year) {
  const allEntries = [];
  let page = 1;
  let hasMorePages = true;

  console.log(`Fetching Letterboxd diary for user: ${username} for year: ${year}`);

  while (hasMorePages) {
    const url = `https://letterboxd.com/${username}/diary/for/${year}/page/${page}/`;
    console.log(`URL: ${url}`);

    try {
      const html = await fetchPage(url);
      const { entries, hasMore } = parseDiaryEntries(html, year);
      
      console.log(`Found ${entries.length} diary entries on page ${page}`);
      
      if (entries.length === 0) {
        hasMorePages = false;
        break;
      }
      
      allEntries.push(...entries);
      
      if (!hasMore) {
        console.log("No next page link found, finished fetching");
        hasMorePages = false;
      } else {
        page++;
        // Small delay between pages
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.warn(`Error fetching page ${page}: ${error}`);
      const isCloudflareError = error instanceof CloudflareChallengeError;

      // Do not silently return empty data when page 1 is blocked/unavailable.
      if (isCloudflareError || page === 1) {
        throw error;
      }

      hasMorePages = false;
    }
  }

  return allEntries;
}

/**
 * Try fetching multiple years if current year has no entries
 */
export async function tryFetchMultipleYears(username, startYear) {
  let allEntries = [];

  let entries = await fetchLetterboxdData(username, startYear);
  allEntries = allEntries.concat(entries);

  if (allEntries.length === 0) {
    console.log(`No entries found for ${startYear}, trying previous years...`);
    for (let year = startYear - 1; year >= startYear - 2; year--) {
      console.log(`Trying year ${year}...`);
      entries = await fetchLetterboxdData(username, year);
      allEntries = allEntries.concat(entries);
      if (entries.length > 0) {
        console.log(`Found ${entries.length} entries for year ${year}`);
        break;
      }
    }
  }

  return allEntries;
}

/**
 * Fetch diary entries for multiple specific years
 */
export async function fetchSpecificYears(username, years) {
  let allEntries = [];
  
  for (const year of years) {
    const entries = await fetchLetterboxdData(username, year);
    allEntries = allEntries.concat(entries);
  }
  
  return allEntries;
}

/**
 * Fetch profile data (display name, avatar, followers, following)
 * Uses curl_cffi primary and Puppeteer fallback for Cloudflare resilience
 */
export async function fetchProfileData(username) {
  const url = `https://letterboxd.com/${username}/`;
  try {
    const html = await fetchPage(url);
    const $ = cheerio.load(html);

    const profileImage = $('.profile-avatar img').attr('src');
    // Note: data-original-title contains the username, text() contains the display name
    const displayName = $('.person-display-name .displayname').text().trim() 
      || username;

    // Try to get followers/following counts
    let followers = 0;
    let following = 0;
    let totalEntries = 0;
    
    // Followers/Following
    const followersLink = $('a[href*="/followers/"]');
    const followingLink = $('a[href*="/following/"]');
    
    if (followersLink.length > 0) {
      const title = followersLink.attr('title') || followersLink.text();
      const match = title.match(/(\d+(,\d+)*)/);
      if (match) followers = parseInt(match[1].replace(/,/g, ''));
    }
    
    if (followingLink.length > 0) {
      const title = followingLink.attr('title') || followingLink.text();
      const match = title.match(/(\d+(,\d+)*)/);
      if (match) following = parseInt(match[1].replace(/,/g, ''));
    }

    // Total Films
    const filmsLink = $('a[href*="/films/"]');
    if (filmsLink.length > 0) {
      const valueSpan = filmsLink.find('.value');
      const text = valueSpan.length > 0 ? valueSpan.text() : filmsLink.text();
      const match = text.match(/(\d+(,\d+)*)/);
      if (match) totalEntries = parseInt(match[1].replace(/,/g, ''));
    }

    // Check for Member status
    let memberStatus = null;
    if ($('.badge.-patron').length > 0) memberStatus = 'patron';
    else if ($('.badge.-pro').length > 0) memberStatus = 'pro';

    return {
      profileImage: profileImage || null,
      displayName: displayName || username,
      followers,
      following,
      totalEntries,
      memberStatus
    };
  } catch (error) {
    console.warn(`Error fetching profile data for ${username}: ${error}. Using fallback values.`);
    return {
      profileImage: null,
      displayName: username,
      followers: 0,
      following: 0
    };
  }
}

/**
 * Convert image URL to Base64 data URI
 */
export async function imageToBase64(url) {
  try {
    const response = await fetch(url, { headers: BROWSER_HEADERS });
    if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = response.headers.get("content-type") || "image/png";
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  } catch (error) {
    console.warn(`Error converting ${url} to Base64: ${error}`);
    return null;
  }
}
