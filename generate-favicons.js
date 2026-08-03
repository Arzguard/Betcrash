/**
 * BetCrash Favicon Generator
 * 
 * Generates PNG favicon assets from the favicon.svg using sharp.
 * Run: node generate-favicons.js
 * 
 * Install sharp first: npm install sharp --save-dev
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const faviconDir = path.join(__dirname, 'favicon');
const svgPath = path.join(faviconDir, 'favicon.svg');
const svgBuffer = fs.readFileSync(svgPath);

async function generate() {
  const sizes = [
    { name: 'favicon-16x16.png', size: 16 },
    { name: 'favicon-32x32.png', size: 32 },
    { name: 'favicon-48x48.png', size: 48 },
    { name: 'apple-touch-icon.png', size: 180 },
    { name: 'android-chrome-192x192.png', size: 192 },
    { name: 'mstile-150x150.png', size: 150 },
    { name: 'android-chrome-512x512.png', size: 512 },
  ];

  console.log('Generating favicon PNGs from favicon.svg...\n');

  for (const { name, size } of sizes) {
    const outPath = path.join(faviconDir, name);
    await sharp(svgBuffer)
      .resize(size, size)
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(outPath);
    console.log(`  ✓ ${name} (${size}x${size})`);
  }

  // Generate og-image.png from og-image.svg (1200x630)
  const ogSvgPath = path.join(faviconDir, 'og-image.svg');
  if (fs.existsSync(ogSvgPath)) {
    const ogBuffer = fs.readFileSync(ogSvgPath);
    const ogOut = path.join(faviconDir, 'og-image.png');
    await sharp(ogBuffer)
      .resize(1200, 630)
      .png({ compressionLevel: 9 })
      .toFile(ogOut);
    console.log('  ✓ og-image.png (1200x630)');
  }

  console.log('\nAll favicon assets generated successfully!');
  console.log('\nNote: favicon.ico requires a separate tool (e.g. png-to-ico or ico-endec).');
  console.log('You can convert favicon-32x32.png to favicon.ico using: https://favicon.io/favicon-converter/');
}

generate().catch(err => {
  console.error('Error generating favicons:', err.message);
  console.log('\nMake sure sharp is installed: npm install sharp --save-dev');
  process.exit(1);
});
