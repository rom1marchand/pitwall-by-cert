const fs = require('fs');

const loadBgFunc = `
// Load random hero background image
function loadRandomHeroBg() {
  const heroImg = document.getElementById('hero-bg-img')
  if (!heroImg) return
  
  const randomIdx = Math.floor(Math.random() * 12) // 0-11
  const randomSrc = \`assets/photos/hero-bg-\${randomIdx}.jpg\`
  
  // Try to load random image, fallback to default if it fails
  const testImg = new Image()
  testImg.onload = () => { heroImg.src = randomSrc }
  testImg.onerror = () => { heroImg.src = 'assets/hero-bg.jpg' }
  testImg.src = randomSrc
}
`;

function fixFile(file) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace('// Load random hero background image\nfunction populateProfileDropdown', loadBgFunc + '\nfunction populateProfileDropdown');
  fs.writeFileSync(file, content);
  console.log('Fixed ' + file);
}

fixFile('frontend/main-settings.html');
fixFile('frontend/main-subscription.html');
