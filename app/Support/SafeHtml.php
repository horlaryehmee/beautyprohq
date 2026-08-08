<?php

namespace App\Support;

use DOMDocument;
use DOMElement;
use DOMNode;

class SafeHtml
{
    private const ALLOWED_TAGS = [
        'a', 'blockquote', 'br', 'code', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'hr', 'img', 'li', 'ol', 'p', 'pre', 'strong', 'table', 'tbody', 'td', 'th',
        'thead', 'tr', 'u', 'ul',
    ];

    private const ALIGNABLE_TAGS = [
        'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'td', 'th',
    ];

    private const ALLOWED_CLASSES = [
        'text-left', 'text-center', 'text-right',
    ];

    private const DROP_WITH_CONTENT = [
        'applet', 'audio', 'canvas', 'embed', 'form', 'iframe', 'math', 'noscript',
        'object', 'script', 'style', 'svg', 'template', 'video',
    ];

    public static function clean(?string $html): string
    {
        $html = trim((string) $html);
        if ($html === '' || ! str_contains($html, '<')) {
            return $html;
        }

        $document = new DOMDocument('1.0', 'UTF-8');
        $previous = libxml_use_internal_errors(true);
        $loaded = $document->loadHTML(
            '<?xml encoding="UTF-8"><div id="bphq-safe-root">'.$html.'</div>',
            LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD | LIBXML_NONET
        );
        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        if (! $loaded) {
            return '';
        }

        $root = $document->getElementById('bphq-safe-root');
        if (! $root) {
            return '';
        }

        self::cleanChildren($root);

        $clean = '';
        foreach (iterator_to_array($root->childNodes) as $child) {
            $clean .= $document->saveHTML($child);
        }

        return trim($clean);
    }

    private static function cleanChildren(DOMNode $parent): void
    {
        foreach (iterator_to_array($parent->childNodes) as $node) {
            if (! $node instanceof DOMElement) {
                continue;
            }

            $tag = strtolower($node->tagName);
            if (! in_array($tag, self::ALLOWED_TAGS, true)) {
                if (in_array($tag, self::DROP_WITH_CONTENT, true)) {
                    $parent->removeChild($node);
                    continue;
                }

                self::cleanChildren($node);
                while ($node->firstChild) {
                    $parent->insertBefore($node->firstChild, $node);
                }
                $parent->removeChild($node);
                continue;
            }

            self::cleanAttributes($node, $tag);
            self::cleanChildren($node);
        }
    }

    private static function cleanAttributes(DOMElement $element, string $tag): void
    {
        $allowed = match ($tag) {
            'a' => ['href', 'title'],
            'blockquote' => ['cite', 'class', 'style'],
            'img' => ['alt', 'src', 'title'],
            default => in_array($tag, self::ALIGNABLE_TAGS, true) ? ['class', 'style'] : [],
        };

        foreach (iterator_to_array($element->attributes) as $attribute) {
            $name = strtolower($attribute->name);
            if (! in_array($name, $allowed, true)) {
                $element->removeAttribute($attribute->name);
                continue;
            }

            if (in_array($name, ['href', 'cite', 'src'], true) && ! self::safeUrl($attribute->value, $name === 'src')) {
                $element->removeAttribute($attribute->name);
            }

            if ($name === 'class' && ! self::cleanClassAttribute($element, $attribute->value)) {
                $element->removeAttribute($attribute->name);
            }

            if ($name === 'style' && ! self::cleanStyleAttribute($element, $attribute->value)) {
                $element->removeAttribute($attribute->name);
            }
        }

        if ($tag === 'a' && $element->hasAttribute('href')) {
            $element->setAttribute('rel', 'nofollow noopener noreferrer');
        }
    }

    private static function cleanClassAttribute(DOMElement $element, string $value): bool
    {
        $classes = array_values(array_intersect(
            preg_split('/\s+/', trim($value)) ?: [],
            self::ALLOWED_CLASSES
        ));

        if ($classes === []) {
            return false;
        }

        $element->setAttribute('class', implode(' ', $classes));

        return true;
    }

    private static function cleanStyleAttribute(DOMElement $element, string $value): bool
    {
        preg_match('/(?:^|;)\s*text-align\s*:\s*(left|center|right|justify)\s*(?:;|$)/i', $value, $match);

        if (! isset($match[1])) {
            return false;
        }

        $element->setAttribute('style', 'text-align: '.strtolower($match[1]).';');

        return true;
    }

    private static function safeUrl(string $url, bool $image = false): bool
    {
        $url = trim(html_entity_decode($url, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        if ($url === '' || str_starts_with($url, '/') || (! $image && str_starts_with($url, '#'))) {
            return true;
        }

        $schemes = $image ? ['http', 'https'] : ['http', 'https', 'mailto', 'tel'];

        return in_array(strtolower((string) parse_url($url, PHP_URL_SCHEME)), $schemes, true);
    }
}
