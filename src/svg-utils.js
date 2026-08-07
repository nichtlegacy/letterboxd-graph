/**
 * Shared SVG primitives: font embedding and subsetting, text measurement,
 * XML escaping and the theme colors.
 *
 * Used by both the contribution graph and the year-in-review card.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import opentype from 'opentype.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FONTS_DIR = path.join(__dirname, '..', 'fonts');

const FONT_FILES = {
  regular: 'Inter-Regular.woff2',
  medium: 'Inter-Medium.woff2',
  semibold: 'Inter-SemiBold.woff2',
  bold: 'Inter-Bold.woff2'
};

// The @font-face block is written last, once the finished markup tells us which
// characters actually need glyphs. Until then the style block carries this marker.
export const FONT_FACE_PLACEHOLDER = '/*__INTER_FONT_FACE__*/';

/**
 * Load Inter font files as Base64 for embedding in SVG
 */
function loadFontsBase64() {
  const fonts = {};

  for (const [weight, filename] of Object.entries(FONT_FILES)) {
    const fontPath = path.join(FONTS_DIR, filename);
    if (fs.existsSync(fontPath)) {
      const fontData = fs.readFileSync(fontPath);
      fonts[weight] = `data:font/woff2;base64,${fontData.toString('base64')}`;
    }
  }
  return fonts;
}

// Load fonts once at module initialization
let embeddedFonts = null;
function getEmbeddedFonts() {
  if (!embeddedFonts) {
    embeddedFonts = loadFontsBase64();
  }
  return embeddedFonts;
}

const subsetCache = new Map();
let subsetFontModule = null;
let subsetWarningShown = false;

/**
 * Cut the Inter files down to the glyphs a specific SVG needs.
 *
 * A full Inter weight is ~108KB and we embed four of them, which dwarfs the
 * actual graph. Since we generate every character in the document ourselves,
 * the exact glyph set is known and everything else can be dropped.
 *
 * @param {string} characters - Every character that may be rendered
 * @returns {Promise<Object>} Map of weight name to data URI
 */
async function loadFontsSubset(characters, weights) {
  const cacheKey = `${[...weights].sort().join(',')}|${characters}`;
  const cached = subsetCache.get(cacheKey);
  if (cached) return cached;

  if (!subsetFontModule) {
    subsetFontModule = (await import('subset-font')).default;
  }

  const fonts = {};
  for (const [weight, filename] of Object.entries(FONT_FILES)) {
    if (!weights.has(weight)) continue;

    const fontPath = path.join(FONTS_DIR, filename);
    if (!fs.existsSync(fontPath)) continue;

    const subsetted = await subsetFontModule(fs.readFileSync(fontPath), characters, {
      targetFormat: 'woff2'
    });
    fonts[weight] = `data:font/woff2;base64,${subsetted.toString('base64')}`;
  }

  subsetCache.set(cacheKey, fonts);
  return fonts;
}

const WEIGHT_NAMES = { 400: 'regular', 500: 'medium', 600: 'semibold', 700: 'bold' };

/**
 * Find which Inter weights a document actually uses.
 *
 * Every weight in the generated markup is written numerically, either as a
 * `font-weight="600"` attribute or a `font-weight: 600` CSS declaration, so a
 * scan over the finished SVG is exact. Text without an explicit weight inherits
 * the default, hence regular is always included.
 *
 * @param {string} svg
 * @returns {Set<string>} Weight names present in FONT_FILES
 */
function collectFontWeights(svg) {
  const weights = new Set(['regular']);

  for (const match of svg.matchAll(/font-weight\s*[:=]\s*"?(\d{3})/g)) {
    const name = WEIGHT_NAMES[match[1]];
    if (name) weights.add(name);
  }
  return weights;
}

/**
 * Collect every distinct character in a string, iterating by code point so
 * characters outside the BMP survive intact.
 * @param {string} text
 * @returns {string}
 */
function collectCharacters(text) {
  return [...new Set(text)].join('');
}

/**
 * Replace the font-face placeholder with subsetted @font-face rules.
 *
 * The character set is taken from the finished markup rather than from the text
 * nodes alone. That is a superset — it also picks up tag and attribute names,
 * which are ASCII we need anyway — and it guarantees no rendered glyph is ever
 * missing, including accented or non-Latin film titles.
 *
 * Falls back to embedding the complete fonts if subsetting fails, so a broken
 * or missing subset-font install degrades to the previous behaviour.
 *
 * @param {string} svg - Finished SVG containing FONT_FACE_PLACEHOLDER
 * @returns {Promise<string>} SVG with fonts embedded
 */
export async function inlineFonts(svg) {
  if (!svg.includes(FONT_FACE_PLACEHOLDER)) return svg;

  const markup = svg.replace(FONT_FACE_PLACEHOLDER, '');

  let fonts;
  try {
    fonts = await loadFontsSubset(collectCharacters(markup), collectFontWeights(markup));
  } catch (error) {
    if (!subsetWarningShown) {
      console.warn(`   Font subsetting failed, embedding full fonts: ${error.message}`);
      subsetWarningShown = true;
    }
    fonts = getEmbeddedFonts();
  }

  return svg.replace(FONT_FACE_PLACEHOLDER, generateFontFaceCSS(fonts));
}

/**
 * Generate @font-face CSS declarations for embedded fonts
 * @param {Object} fonts - Map of weight name to data URI
 */
function generateFontFaceCSS(fonts) {
  if (Object.keys(fonts).length === 0) {
    return ''; // Fallback to system fonts if no embedded fonts available
  }

  return Object.entries(WEIGHT_NAMES)
    .filter(([, name]) => fonts[name])
    .map(([weight, name]) => `
      @font-face {
        font-family: 'Inter';
        font-style: normal;
        font-weight: ${weight};
        src: url('${fonts[name]}') format('woff2');
      }`)
    .join('') + '\n  ';
}

/**
 * Escape XML special characters
 */
export function escapeXml(unsafe) {
  if (unsafe === undefined || unsafe === null) return "";
  return String(unsafe).replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case "'": return "&apos;";
      case '"': return "&quot;";
    }
  });
}

/**
 * Calculate exact text width using opentype.js
 * Uses Inter-SemiBold font for accurate measurements with kerning support
 */

// Load font once at module initialization
let loadedFont = null;
let textWidthFallbackWarningShown = false;
function getFont() {
  if (!loadedFont) {
    const fontPath = path.join(FONTS_DIR, 'Inter-SemiBold.ttf');
    if (fs.existsSync(fontPath)) {
      try {
        const fontBuffer = fs.readFileSync(fontPath);
        const fontData = fontBuffer.buffer.slice(
          fontBuffer.byteOffset,
          fontBuffer.byteOffset + fontBuffer.byteLength
        );
        loadedFont = opentype.parse(fontData);
      } catch (e) {
        console.warn('Could not load font for text measurement, using fallback');
        loadedFont = null;
      }
    }
  }
  return loadedFont;
}

/**
 * Calculate exact text width using opentype.js with kerning support
 * @param {string} text - Text to measure
 * @param {number} fontSize - Font size in pixels
 * @param {number} letterSpacing - Additional letter spacing (default 0)
 * @returns {number} Width in pixels
 */
export function calculateTextWidth(text, fontSize, letterSpacing = 0) {
  if (!text) return 0;
  
  const font = getFont();
  if (font) {
    try {
      // Use getAdvanceWidth for accurate measurement with kerning
      let width = font.getAdvanceWidth(text, fontSize, { kerning: true });
      
      // Add letter spacing if specified
      if (letterSpacing > 0 && text.length > 1) {
        width += letterSpacing * (text.length - 1);
      }
      
      return width;
    } catch (error) {
      if (!textWidthFallbackWarningShown) {
        console.warn(`Could not measure text width with opentype.js, using fallback: ${error.message}`);
        textWidthFallbackWarningShown = true;
      }
    }
  }
  
  // Fallback to rough estimation if font couldn't be loaded
  return text.length * fontSize * 0.55;
}

/**
 * Card chrome and the heatmap ramp, keyed by theme.
 *
 * The ramp stays single-hue on purpose: shifting hue across a sequential scale
 * reads as separate categories rather than as more or less activity.
 */
const THEMES = {
  dark: {
    bg: '#0d1117',
    cardBorder: '#21262d',
    text: '#e6edf3',
    textMuted: '#7d8590',
    tooltipBg: '#161b22',
    tooltipBorder: '#30363d',
    tooltipText: '#f0f6fc',
    colors: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353']
  },
  light: {
    bg: '#ffffff',
    cardBorder: '#d1d9e0',
    text: '#1f2328',
    textMuted: '#656d76',
    tooltipBg: '#ffffff',
    tooltipBorder: '#d1d9e0',
    tooltipText: '#1f2328',
    colors: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39']
  }
};

/**
 * Resolve a theme, falling back to dark for unknown names
 * @param {string} theme - 'dark' or 'light'
 * @returns {Object} Theme colors
 */
export function getTheme(theme) {
  return THEMES[theme] || THEMES.dark;
}
