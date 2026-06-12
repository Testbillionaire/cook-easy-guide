## What's happening

Both Instacart and YouTube URLs themselves are valid — I just opened `https://www.instacart.com/store/search/chicken` and it returns the real Instacart search results, and `strYoutube` from TheMealDB is a normal `https://www.youtube.com/watch?v=…` link.

The reason the buttons appear to "do nothing" inside the Lovable editor is that the **preview is rendered in a sandboxed iframe that blocks `target="_blank"` (new-tab) pop-ups for safety**. Any `<a target="_blank">` silently fails. This is an editor-only restriction; on your **published site (`cook-easy-guide.lovable.app`) the same links open normally**.

Quick way to confirm: right-click → "Open link in new tab" works in the preview, and plain left-click works on the published site.

## Fix that works in both places

Make the three external links resilient to the sandbox:

1. Keep `target="_blank" rel="noopener noreferrer"`.
2. Add an `onClick` that, if `window.top !== window.self` (i.e. we're inside the editor iframe), opens the URL via `window.open(url, "_blank", "noopener")` and falls back to `window.top.location.href = url` when the popup is blocked.
3. Outside the iframe, the default anchor click handles it — no change.

This is purely a client-side enhancement, no data changes needed.

### File touched
- `src/routes/index.tsx` — small helper `openExternal(url)` and `onClick={(e) => openExternal(e, url)}` on the Amazon, Instacart, and "Watch video" anchors.

After the change, click them again in the preview; they'll open in a new tab (or take over the preview frame as a fallback). On the published site nothing changes — they already worked there.
