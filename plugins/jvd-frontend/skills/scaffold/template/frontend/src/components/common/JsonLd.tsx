/**
 * A JSON-LD data block.
 *
 * `dangerouslySetInnerHTML` is the only way React will put text inside a
 * `<script>`, and this is the one place in the codebase that uses it. What goes
 * in is `JSON.stringify` of an object we built ourselves — never markup, never
 * anything a user typed — and `<` is escaped so a value containing `</script>`
 * cannot close the tag early.
 *
 * The block is inert: `application/ld+json` is data, not executable script, so
 * `script-src 'self'` in the CSP does not stand in its way.
 */
export const JsonLd = ({ data }: { data: object }) => (
  <script
    type="application/ld+json"
    dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
  />
);
