/**
 * Letterboxd Data Fetcher
 * Handles scraping diary entries and profile data from Letterboxd
 */

import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

/**
 * Fetch diary entries for a specific year
 */
export async function fetchLetterboxdData(username, year) {
  const entries = [];
  let page = 1;
  let hasMorePages = true;

  console.log(`Fetching Letterboxd diary for user: ${username} for year: ${year}`);

  while (hasMorePages) {
    const url = `https://letterboxd.com/${username}/films/diary/for/${year}/page/${page}/`;
    console.log(`URL: ${url}`);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        if (response.status === 404) {
          console.log(`Page ${page} not found, finished fetching`);
          hasMorePages = false;
          break;
        }
        throw new Error(`Failed to fetch data: ${response.statusText} (${response.status})`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      const diaryTable = $("#diary-table");
      if (diaryTable.length === 0) {
        console.log("No diary table found on this page");
        hasMorePages = false;
        break;
      }

      const entryRows = diaryTable.find("tr.diary-entry-row");
      console.log(`Found ${entryRows.length} diary entries on page ${page}`);
      if (entryRows.length === 0) {
        hasMorePages = false;
        break;
      }

      entryRows.each((_, row) => {
        try {
          const $row = $(row);
          const dayElement = $row.find("td.col-daydate a");
          const dayUrl = dayElement.attr('href');
          
          if (!dayUrl) {
            console.warn(`Skipping entry: no day URL found`);
            return;
          }
          
          const urlParts = dayUrl.split('/').filter(part => part);
          const yearIndex = urlParts.indexOf('for') + 1;
          const monthIndex = yearIndex + 1;
          const dayIndex = monthIndex + 1;

          if (yearIndex === 0 || !urlParts[yearIndex] || !urlParts[monthIndex] || !urlParts[dayIndex]) {
            console.warn(`Skipping entry: invalid URL structure - ${dayUrl}`);
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
            console.warn(`Skipping entry: no title found for date ${month}/${day}/${entryYear}`);
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

            console.log(`Found entry: ${date.toISOString().split("T")[0]} - ${title} (${filmYear}) - Rating: ${rating}`);

            entries.push({
              date,
              title,
              year: filmYear,
              rating,
              url: filmUrl
            });
          } else {
            console.warn(`Skipping entry with invalid date or year mismatch: Year=${entryYear}, Month=${month}, Day=${day}, Requested Year=${year}`);
          }
        } catch (err) {
          console.warn(`Error parsing entry: ${err}`);
        }
      });

      const nextPageLink = $(".paginate-nextprev .next");
      if (nextPageLink.length === 0 || nextPageLink.hasClass("disabled")) {
        console.log("No next page link found, finished fetching");
        hasMorePages = false;
      } else {
        page++;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.warn(`Error fetching page ${page}: ${error}`);
      hasMorePages = false;
    }
  }

  return entries;
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
 */
export async function fetchProfileData(username) {
  const url = `https://letterboxd.com/${username}/`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch profile page: ${response.statusText} (${response.status})`);
    }
    const html = await response.text();
    const $ = cheerio.load(html);

    const profileImage = $('.profile-avatar img').attr('src');
    const displayName = $('.person-display-name .displayname').attr('data-original-title') 
      || $('.person-display-name .displayname').text().trim() 
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
    const response = await fetch(url);
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
