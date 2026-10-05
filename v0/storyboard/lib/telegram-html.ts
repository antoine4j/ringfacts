// A digest's text is Telegram HTML: bold, italics and links. To show it as it
// reads in the chat, the page keeps exactly those tags, links only to http(s)
// addresses and opening in a new tab, and shows anything else as plain text.

const KEPT_TAGS = /^<\/?(b|i|u|s|code)>$/;
const LINK = /^<a href="(https?:\/\/[^"<>]+)">$/;

/**
 * Telegram HTML made safe to place in the page.
 *
 * @param html  The digest's text.
 * @returns HTML with only the kept tags; every other "<" and ">" escaped.
 */
export function safeTelegramHtml(html: string): string {
  const escape = (text: string) => text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return html
    .split(/(<[^<>]*>)/)
    .map((part) => {
      // A kept tag stays; a link keeps only its address; anything else is text.
      if (KEPT_TAGS.test(part) || part === "</a>") return part;
      const link = part.match(LINK);
      if (link) return `<a href="${link[1]}" target="_blank" rel="noreferrer">`;
      return escape(part);
    })
    .join("");
}
