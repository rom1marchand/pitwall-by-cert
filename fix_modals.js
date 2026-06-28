const fs = require('fs');

const mainHtml = fs.readFileSync('frontend/main.html', 'utf8');
const startIndex = mainHtml.indexOf('<!-- Notifications Panel -->');
const endIndex = mainHtml.indexOf('<script>', startIndex);
const correctModalsHtml = mainHtml.substring(startIndex, endIndex);

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Find where the broken modals start
  const brokenModalsStart = content.indexOf('<!-- Notifications Panel -->');
  const brokenModalsEnd = content.indexOf('<script>', brokenModalsStart);
  
  if (brokenModalsStart !== -1 && brokenModalsEnd !== -1) {
    const fixedContent = content.substring(0, brokenModalsStart) + correctModalsHtml + content.substring(brokenModalsEnd);
    fs.writeFileSync(filePath, fixedContent);
    console.log(`Fixed ${filePath}`);
  } else {
    console.log(`Could not find broken modals in ${filePath}`);
  }
}

fixFile('frontend/main-settings.html');
fixFile('frontend/main-subscription.html');
