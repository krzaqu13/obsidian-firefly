const fs = require('fs');

const css = fs.readFileSync('styles.css', 'utf8');
const lines = css.split('\n');

console.log("=== ALL SELECTORS FOR BOARD & FIREFLY ===");
lines.forEach((line, idx) => {
    if (line.includes('.story-line-board-container') || line.includes('.firefly-') || line.includes('.plot-grid-root')) {
        console.log(`Line ${idx + 1}: ${line.trim()}`);
    }
});
