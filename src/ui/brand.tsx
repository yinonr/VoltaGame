// Volta co-branding is STAGED FOR REVIEW. It is on in local development (`npm run dev`)
// and off in production builds unless VITE_VOLTA_BRANDING=on, so the public GitHub Pages
// build never shows an official-sounding attribution before sponsorship language is approved.
export const VOLTA_BRANDING: boolean = import.meta.env.VITE_VOLTA_BRANDING
  ? import.meta.env.VITE_VOLTA_BRANDING === 'on'
  : import.meta.env.DEV;

/** Volta's website, set via VITE_VOLTA_URL once confirmed. The link is hidden when unset. */
export const VOLTA_SITE_URL: string | null = import.meta.env.VITE_VOLTA_URL || null;

/**
 * The public build's small print. Both facts must stay: the game is not affiliated with or
 * endorsed by Volta (the public title only says "A concept for Volta", never sponsorship), and it
 * is an unofficial, Catan-inspired prototype.
 */
export const PUBLIC_DISCLAIMER =
  'Independent creative prototype. Not affiliated with or endorsed by Volta. Unofficial and Catan-inspired; not affiliated with Catan rights holders. All company names are fictional.';

/**
 * Typographic placeholder wordmark. Replace with Volta's official logo asset (SVG from their
 * press kit) before any public use; no official asset was available in this environment.
 */
export function VoltaWordmark({ size = 18 }: { size?: number }) {
  return (
    <span className="volta-wordmark" style={{ fontSize: size }} aria-label="Volta">
      VOLTA
    </span>
  );
}
