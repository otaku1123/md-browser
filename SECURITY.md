# Security Policy

## Supported versions

Only the latest release is supported: the Chrome extension version currently on the Chrome Web Store and the web app at https://otaku1123.github.io/md-browser/. The development build under `/dev/` is not covered.

## Reporting a vulnerability

Please do **not** open a public issue for security problems.

Report privately through GitHub: **Security** tab → **Report a vulnerability** (https://github.com/otaku1123/md-browser/security/advisories/new).

Helpful details:

- affected version (extension version or web app) and browser
- steps to reproduce, ideally with a minimal Markdown file
- impact (e.g. script execution from Markdown, reading files other than the opened one)

You should get a first response within 7 days. Once a fix is released, the advisory will be published with credit unless you prefer otherwise.

## Scope

In scope:

- HTML/script injection that bypasses sanitization when rendering Markdown
- the extension reading local files other than the `.md` file open in the requesting tab
- leaking content or settings to external servers

Out of scope: issues that require a malicious extension or a compromised browser, and vulnerabilities in third-party libraries that are already fixed upstream (Dependabot handles those).
