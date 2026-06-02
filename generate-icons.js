// ============================================================
// StudyMind AI — Icon Generator (generate-icons.js)
// Run: node generate-icons.js (from extension root)
// Generates PNG icons at 16x16, 48x48, 128x128
// ============================================================

// This script uses the Canvas API via an offscreen document
// For manual icon generation, you can also use this as a reference

// Since we can't run Node canvas easily, we provide a simpler approach:
// The icons are generated as data URLs and saved

const sizes = [16, 48, 128];

function generateIconDataURL(size) {
  // Create a simple brain emoji icon representation
  // This creates an SVG-based icon
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#6366f1"/>
          <stop offset="100%" style="stop-color:#8b5cf6"/>
        </linearGradient>
      </defs>
      <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="url(#bg)"/>
      <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" 
            font-size="${size * 0.55}" font-family="Arial">🧠</text>
    </svg>
  `;
  return svg;
}

// Output SVGs that can be converted to PNG
sizes.forEach(size => {
  console.log(`\n--- Icon ${size}x${size} ---`);
  console.log(generateIconDataURL(size));
});

console.log("\nTo create PNG icons, open generate-icons.html in a browser.");
