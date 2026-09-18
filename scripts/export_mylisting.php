<?php
// Export the MyListing directory from a local WordPress installation to JSON.
// Usage: php scripts/export_mylisting.php <wp-root> <output-json>
if ($argc !== 3) { fwrite(STDERR, "Usage: php export_mylisting.php <wp-root> <output-json>\n"); exit(1); }
$config = file_get_contents(rtrim($argv[1], '/\\') . '/wp-config.php');
function wpSetting(string $config, string $key): string {
    if (!preg_match("/define\(\s*['\"]" . preg_quote($key, '/') . "['\"]\s*,\s*['\"]([^'\"]*)['\"]\s*\)/", $config, $m)) throw new RuntimeException("Missing $key");
    return $m[1];
}
$host = wpSetting($config, 'DB_HOST');
$port = getenv('WP_DB_PORT') ?: '3306';
$db = new PDO("mysql:host=$host;port=$port;dbname=" . wpSetting($config, 'DB_NAME') . ';charset=utf8mb4', wpSetting($config, 'DB_USER'), wpSetting($config, 'DB_PASSWORD'), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$prefix = 'gcb_'; // The active site prefix, never staging copies.
$posts = $db->query("SELECT p.ID,p.post_author,p.post_title,p.post_name,p.post_content,p.post_excerpt,p.post_status,p.post_date,p.post_modified,u.user_email AS author_email FROM {$prefix}posts p LEFT JOIN {$prefix}users u ON u.ID=p.post_author WHERE p.post_type='job_listing' ORDER BY p.ID")->fetchAll(PDO::FETCH_ASSOC);
$metaStmt = $db->prepare("SELECT meta_key,meta_value FROM {$prefix}postmeta WHERE post_id=? ORDER BY meta_id");
$termStmt = $db->prepare("SELECT tt.taxonomy,t.name,t.slug FROM {$prefix}term_relationships tr JOIN {$prefix}term_taxonomy tt ON tt.term_taxonomy_id=tr.term_taxonomy_id JOIN {$prefix}terms t ON t.term_id=tt.term_id WHERE tr.object_id=? ORDER BY t.name");
$legacyImageStmt = $db->prepare("SELECT file.meta_value FROM {$prefix}posts old
    JOIN {$prefix}postmeta thumb ON thumb.post_id=old.ID AND thumb.meta_key='_thumbnail_id'
    JOIN {$prefix}postmeta file ON file.post_id=CAST(thumb.meta_value AS UNSIGNED) AND file.meta_key='_wp_attached_file'
    WHERE old.post_type='wpbdp_listing' AND LOWER(TRIM(old.post_title))=LOWER(TRIM(?))
    ORDER BY old.post_date DESC, old.ID DESC LIMIT 1");
foreach ($posts as &$post) {
    $metaStmt->execute([$post['ID']]);
    $post['meta'] = [];
    foreach ($metaStmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $value = $row['meta_value'];
        if (preg_match('/^(a|O|s|i|b|d|N):/', $value)) {
            try { $decoded = @unserialize($value, ['allowed_classes' => false]); if ($decoded !== false || $value === 'b:0;') $value = $decoded; } catch (Throwable $e) { /* preserve the raw value */ }
        }
        $post['meta'][$row['meta_key']][] = $value;
    }
    $termStmt->execute([$post['ID']]);
    $post['terms'] = $termStmt->fetchAll(PDO::FETCH_ASSOC);
    $covers = $post['meta']['_job_cover'][0] ?? [];
    if (! is_array($covers) || ! count($covers)) {
        $legacyImageStmt->execute([$post['post_title']]);
        $file = $legacyImageStmt->fetchColumn();
        if ($file && ! str_contains($file, '..')) {
            $post['legacy_cover'] = 'https://beautypreneurhub.local/wp-content/uploads/' . ltrim($file, '/');
        }
    }
}
unset($post);
$json = json_encode($posts, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE | JSON_THROW_ON_ERROR);
file_put_contents($argv[2], $json);
fwrite(STDOUT, count($posts) . " MyListing records exported\n");
