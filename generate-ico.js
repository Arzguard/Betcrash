/**
 * Writes a valid multi-size favicon.ico from existing PNG files.
 * ICO format spec: https://en.wikipedia.org/wiki/ICO_(file_format)
 */
const fs = require('fs');
const path = require('path');

const faviconDir = path.join(__dirname, 'public', 'favicon');

const sizes = [16, 32, 48];
const pngBuffers = sizes.map(s =>
  fs.readFileSync(path.join(faviconDir, `favicon-${s}x${s}.png`))
);

// ICO header: 6 bytes
// ICONDIRENTRY per image: 16 bytes each
// Then PNG data appended

const numImages = sizes.length;
const headerSize = 6;
const entrySize = 16;
const directorySize = headerSize + entrySize * numImages;

// Build header
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);       // Reserved (must be 0)
header.writeUInt16LE(1, 2);       // Type: 1 = ICO
header.writeUInt16LE(numImages, 4); // Number of images

// Calculate offsets
let offset = directorySize;
const entries = pngBuffers.map((buf, i) => {
  const size = sizes[i];
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size === 256 ? 0 : size, 0);  // Width (0 = 256)
  entry.writeUInt8(size === 256 ? 0 : size, 1);  // Height (0 = 256)
  entry.writeUInt8(0, 2);                         // Color count (0 = no palette)
  entry.writeUInt8(0, 3);                         // Reserved
  entry.writeUInt16LE(1, 4);                      // Color planes
  entry.writeUInt16LE(32, 6);                     // Bits per pixel
  entry.writeUInt32LE(buf.length, 8);             // Size of image data
  entry.writeUInt32LE(offset, 12);                // Offset of image data
  offset += buf.length;
  return entry;
});

const icoBuffer = Buffer.concat([header, ...entries, ...pngBuffers]);
fs.writeFileSync(path.join(faviconDir, 'favicon.ico'), icoBuffer);
console.log('favicon.ico generated (' + sizes.join('x, ') + 'x)');
