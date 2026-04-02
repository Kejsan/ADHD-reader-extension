# Chrome Web Store Submission Draft

## Store listing

### Extension name

ADHD Focus Reader

### Category

Productivity

### Language

English

### Short description

Apply ADHD-friendly focus styling to article text, selected content, or readable page blocks without rewriting the whole site UI.

### Detailed description

ADHD Focus Reader helps people focus on the part of a page they actually want to read.

Instead of restyling an entire website interface, the extension targets readable content areas such as articles, long-form posts, documentation pages, or a content block you choose manually. That makes it useful on both traditional reading pages and feed-like or app-like sites where a full-page rewrite would be distracting.

Key features:

- Article-only mode to detect and style the most likely reading container on the page
- Manual selection mode for feeds, dashboards, and custom layouts
- Whole-page mode as an explicit fallback for readable page blocks
- Per-tab and per-site persistence options
- Adjustable word emphasis, line spacing, and letter spacing
- Optional local-only analytics toggle for aggregate usage counts

ADHD Focus Reader is designed to keep control with the user:

- No account required
- No page text sent to a remote server
- No raw URLs stored for analytics
- No rewriting of every label or control on the page

Best for:

- Blog posts
- Documentation pages
- Articles and essays
- Long content sections inside modern web apps

## Single purpose description

ADHD Focus Reader helps users read webpage content by applying ADHD-friendly focus styling to articles, selected content blocks, or readable page sections.

## Permission justifications

### `storage`

Used to save reading settings, per-site preferences, per-tab state, and the optional analytics toggle and local aggregate counters.

### `activeTab`

Used so the extension can act on the current tab when the user applies the reading treatment or starts manual selection.

### `tabs`

Used to identify the active tab, read its URL for site-specific rules, and message the active tab when the user applies or resets the reading treatment.

### Host permission: `"<all_urls>"`

Used so the extension can analyze page structure and apply the reading treatment on the sites a user visits, including automatic behavior when the user chooses a saved per-site preference.

## Privacy questionnaire draft

Use this as a starting point and verify the exact dashboard wording when you submit.

### Does the extension handle user data?

Yes.

The extension accesses webpage content locally in the browser to detect readable content and apply the reading treatment. It also stores user settings locally or in Chrome sync storage. If the user enables optional analytics, the extension stores local-only aggregate counters and salted hashes for distinct site/page counts.

### What user data is handled?

- Web page content, processed locally on-device to provide the core feature
- Active tab URL and hostname, used for site-specific rules and current-tab actions
- User settings and preferences
- Optional local-only aggregate usage counts if analytics is enabled

### Is any handled data sold or transferred to third parties?

No.

### Is any handled data used for creditworthiness, lending, or similar purposes?

No.

### Is any handled data used or transferred for purposes unrelated to the extension's single purpose?

No.

### Is user data transmitted to a remote server?

No, based on the current codebase.

### Does the extension use remote code?

No.

## Assets still needed before submission

- At least 1 store screenshot
- Small promo tile: 440 x 280
- Optional marquee tile: 1400 x 560
- A public URL for the privacy policy in `docs/privacy-policy.md`
