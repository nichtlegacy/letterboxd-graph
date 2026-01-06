/**
 * SVG to PNG Exporter using sharp
 */

import sharp from 'sharp';
import fs from 'fs';

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
