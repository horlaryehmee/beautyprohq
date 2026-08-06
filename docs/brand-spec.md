# BPHQ Developer Brand Spec

## Colours

| Token | Hex | Usage |
| --- | --- | --- |
| Coffee Brown | `#3A2A1F` | Primary CTA backgrounds, active controls, key accents |
| Espresso | `#2A1D14` | Primary text, dark sections, strongest surfaces |
| Warm Beige | `#DCCCB8` | Secondary surfaces and soft emphasis |
| Warm Ivory | `#F7F3ED` | Main background |
| Chrome Silver | `#BFC3C8` | Borders, dividers, quiet accents |
| White | `#FFFFFF` | Cards, foreground on dark sections |

## Typography

Headings use `Playfair Display` with weights `400`, `500`, and `600`.

Fallback: `Georgia`, `"Times New Roman"`, `serif`.

Body and UI text use `Inter` with weights `400`, `500`, `600`, and `700`.

Fallback: `-apple-system`, `BlinkMacSystemFont`, `"Segoe UI"`, `sans-serif`.

## Type Scale

| Style | Font |
| --- | --- |
| H1 | Playfair Display `600`, `56px / 1.05` |
| H2 | Playfair Display `600`, `40px / 1.10` |
| H3 | Playfair Display `500`, `30px / 1.15` |
| Body Large | Inter `400`, `18px / 1.60` |
| Body | Inter `400`, `16px / 1.60` |
| UI/Button | Inter `600`, `14-16px / 1.20` |
| Caption | Inter `500`, `12-13px / 1.40` |

## Web Usage

Primary CTAs use Coffee Brown backgrounds with White text. Primary text is Espresso. Main backgrounds are Warm Ivory. Secondary surfaces use Warm Beige. Accent borders use Chrome Silver. Dark sections use Espresso with Warm Ivory or White text.

Use the Tailwind theme tokens in `resources/css/app.css` for future implementation. Legacy palette utility names are intentionally aliased to the BPHQ palette so older components stay on brand while they are gradually renamed.
