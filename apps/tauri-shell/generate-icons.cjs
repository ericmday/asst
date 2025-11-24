#!/usr/bin/env node

/**
 * Icon Generator for Tauri
 * Converts SVG to required PNG formats
 *
 * Usage: node generate-icons.js <path-to-svg>
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const svgPath = process.argv[2] || path.join(__dirname, 'src-tauri/icons/icon.svg');
const iconsDir = path.join(__dirname, 'src-tauri/icons');

// Required sizes for Tauri
const sizes = [32, 128, 256, 512];

console.log('🎨 Generating icons from:', svgPath);
console.log('📁 Output directory:', iconsDir);

// Check if ImageMagick is available
try {
  execSync('which convert', { stdio: 'ignore' });
  console.log('✓ ImageMagick found');
} catch (error) {
  console.error(`
❌ ImageMagick not found!

Please install ImageMagick:
  brew install imagemagick

Or use an online converter:
  1. Go to https://svgtopng.com
  2. Upload: ${svgPath}
  3. Generate these sizes: ${sizes.join(', ')}
  4. Save to: ${iconsDir}

Required files:
  - 32x32.png
  - 128x128.png
  - 256x256.png (or icon.png)
  - icon.icns (macOS - use 'iconutil' or online tool)
  - icon.ico (Windows - use ImageMagick or online tool)
`);
  process.exit(1);
}

// Generate PNGs
console.log('\n📦 Generating PNG files...');
sizes.forEach(size => {
  const output = path.join(iconsDir, `${size}x${size}.png`);
  try {
    execSync(
      `convert -background none -resize ${size}x${size} "${svgPath}" "${output}"`,
      { stdio: 'inherit' }
    );
    console.log(`  ✓ ${size}x${size}.png`);
  } catch (error) {
    console.error(`  ✗ Failed to generate ${size}x${size}.png`);
  }
});

// Copy largest as icon.png
const iconPath = path.join(iconsDir, 'icon.png');
fs.copyFileSync(path.join(iconsDir, '512x512.png'), iconPath);
console.log(`  ✓ icon.png (512x512)`);

// Generate .icns for macOS
console.log('\n🍎 Generating macOS icon (.icns)...');
try {
  const iconsetDir = path.join(iconsDir, 'icon.iconset');

  // Create iconset directory
  if (!fs.existsSync(iconsetDir)) {
    fs.mkdirSync(iconsetDir);
  }

  // Generate required sizes for iconset
  const iconsetSizes = [16, 32, 64, 128, 256, 512];
  iconsetSizes.forEach(size => {
    execSync(
      `convert -background none -resize ${size}x${size} "${svgPath}" "${iconsetDir}/icon_${size}x${size}.png"`,
      { stdio: 'ignore' }
    );
    // @2x versions
    if (size <= 256) {
      execSync(
        `convert -background none -resize ${size * 2}x${size * 2} "${svgPath}" "${iconsetDir}/icon_${size}x${size}@2x.png"`,
        { stdio: 'ignore' }
      );
    }
  });

  // Convert to .icns
  execSync(`iconutil -c icns "${iconsetDir}" -o "${path.join(iconsDir, 'icon.icns')}"`, { stdio: 'ignore' });

  // Cleanup
  fs.rmSync(iconsetDir, { recursive: true });

  console.log('  ✓ icon.icns');
} catch (error) {
  console.error('  ✗ Failed to generate .icns (macOS only)');
}

// Generate .ico for Windows
console.log('\n🪟 Generating Windows icon (.ico)...');
try {
  execSync(
    `convert -background none "${svgPath}" -define icon:auto-resize=256,128,64,48,32,16 "${path.join(iconsDir, 'icon.ico')}"`,
    { stdio: 'ignore' }
  );
  console.log('  ✓ icon.ico');
} catch (error) {
  console.error('  ✗ Failed to generate .ico');
}

console.log('\n✨ Icon generation complete!\n');
