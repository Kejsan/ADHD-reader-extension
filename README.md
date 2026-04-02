# ADHD Focus Reader

Chrome extension for applying a focus-reading treatment to article text, a manually selected content block, or readable page sections without blindly rewriting every label on the page.

## What changed in v2

- `Article only` is the default mode
- `Manual selection` is available for feeds and app-like pages
- `Whole page` is still available as an explicit override
- `This tab` and `This site` now behave separately
- Page analysis warns when article detection confidence is low
- Reset only affects the current tab session
- Optional analytics are local-only, aggregate-only, and off by default

## Modes

- `Article only`: detects a likely reading container and applies the effect there
- `Manual selection`: lets you hover and click a content block to target it precisely
- `Whole page`: applies only to readable text blocks, not a raw full-body rewrite

## Persistence

- `This tab`: saved only for the current browser tab session
- `This site`: remembered for the hostname and auto-applied on future pages from that site

## Privacy-safe analytics

- Disabled by default and can be turned on from the popup
- Controlled at any time from the popup analytics toggle
- Visible inside the popup as local usage totals and mode/site/page counts
- Tracks aggregate counts such as applies, resets, modes used, and counts of unique sites/pages
- Uses local salted hashes for distinct-site and distinct-page counts
- Does not store or transmit raw URLs, page text, or selected content
- Does not send analytics to a remote server

## Local install

1. Open `chrome://extensions`
2. Turn on `Developer mode`
3. Click `Load unpacked`
4. Choose the `ADHD-reader-extension` folder

## Suggested test pages

- LinkedIn feed for `Manual selection`
- Division5 blog posts for `Article only`
- The Local Stack blog posts for `Article only`

## Known limitations

- Detection is heuristic-based, so some custom layouts may still need manual selection
- Chrome internal pages and some extension pages do not allow content scripts
- Site rules are remembered by hostname, not by individual path patterns

## Keyboard shortcut

- `Ctrl+Shift+Y` on Windows/Linux
- `Command+Shift+Y` on macOS

This starts manual selection on the active tab when the page supports content scripts.
