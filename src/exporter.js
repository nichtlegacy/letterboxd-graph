/**
 * SVG to PNG Exporter using sharp
 */

import sharp from 'sharp';
import fs from 'fs';

/**
 * Downscale an image and return it as a data URI.
 *
 * Letterboxd serves posters at 600x900. Embedding those raw would add hundreds
 * of kilobytes per card for something rendered at roughly 42x63, so they are
 * resized to twice the display size and re-encoded as JPEG first.
 *
 * @param {Buffer} buffer - Source image data
 * @param {number} width - Target width in pixels
 * @param {number} height - Target height in pixels
 * @returns {Promise<string|null>} data URI, or null if the image could not be processed
 */
export async function imageBufferToThumbnail(buffer, width, height) {
  try {
    const resized = await sharp(buffer)
      .resize(width, height, { fit: 'cover' })
      .jpeg({ quality: 78 })
      .toBuffer();

    return `data:image/jpeg;base64,${resized.toString('base64')}`;
  } catch (error) {
    console.warn(`   Could not build thumbnail: ${error.message}`);
    return null;
  }
}

/**
 * Convert SVG content to PNG and save to file
 * @param {string} svgContent - The SVG content as a string
 * @param {string} outputPath - Output path for the PNG file
 * @param {Object} options - Options for conversion
 * @returns {Promise<void>}
 */
export async function svgToPng(svgContent, outputPath, options = {}) {
  const { scale = 2 } = options;

  try {
    // Get SVG dimensions from content
    const widthMatch = svgContent.match(/width="(\d+)"/);
    const heightMatch = svgContent.match(/height="(\d+)"/);
    
    const width = widthMatch ? parseInt(widthMatch[1]) * scale : 2000;
    const height = heightMatch ? parseInt(heightMatch[1]) * scale : 580;

    // Convert SVG to PNG using sharp
    const pngBuffer = await sharp(Buffer.from(svgContent))
      .resize(width, height)
      .png()
      .toBuffer();

    // Write to file
    fs.writeFileSync(outputPath, pngBuffer);
    
    console.log(`   📸 PNG exported: ${outputPath} (${width}x${height})`);
  } catch (error) {
    console.error(`   ❌ PNG export failed: ${error.message}`);
    throw error;
  }
}
