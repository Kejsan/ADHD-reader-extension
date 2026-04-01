# ADHD Focus Reader

Chrome extension MVP for making dense article text easier to scan by bolding the first part of each word and slightly adjusting page typography.

## Features

- Toggle the reader on or off from the popup
- Adjust emphasis intensity
- Increase line height and letter spacing
- Restore original text when disabled
- Re-apply the effect to dynamically inserted content

## Files

- `manifest.json` contains the Manifest V3 setup
- `popup.html`, `popup.css`, and `popup.js` power the extension controls
- `content.js` and `content.css` apply the reading mode on webpages

## Load in Chrome

1. Open `chrome://extensions`
2. Turn on `Developer mode`
3. Click `Load unpacked`
4. Choose the `adhd-focus-reader-extension` folder

## Notes

- This MVP avoids inputs, buttons, code blocks, and hidden content.
- It currently transforms visible page text in place rather than isolating only the main article.
- A next improvement would be an article-only mode using a readability pass.
