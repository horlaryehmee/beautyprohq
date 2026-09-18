"""Import MyListing records and optimized images into local BeautyProHQ SQLite."""
import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path
import re
import secrets
import shutil
import sqlite3
from datetime import datetime
from urllib.parse import unquote, urlparse
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
WP_ROOT = Path(r"C:\Users\USER\Documents\LocalWp\beautypreneurhub\app\public")
DB = ROOT / "database/database.sqlite"
MEDIA = ROOT / "storage/app/public/imported/beautypreneurhub"
FALLBACK_SOURCE = MEDIA / "fallback-source.webp"
DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]


def first(post, key, default=None):
    values = post["meta"].get(key, [])
    return values[0] if values else default


def imported_email(post):
    # WordPress admin authored many listings on behalf of businesses.
    # Their public contact address is the business address, not the admin login.
    address = post.get("author_email") if int(post["post_author"]) != 1 else first(post, "_job_email")
    return str(address or "").strip().lower()


def as_json(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def image_source(url):
    parsed = urlparse(url)
    if parsed.hostname != "beautypreneurhub.local" or not parsed.path.startswith("/wp-content/uploads/"):
        raise ValueError(f"Unexpected image URL: {url}")
    relative = Path(unquote(parsed.path.lstrip("/")))
    source = (WP_ROOT / relative).resolve()
    if not source.is_relative_to(WP_ROOT.resolve()) or not source.is_file():
        raise FileNotFoundError(source)
    return source


def cover_url(post):
    covers = first(post, "_job_cover", [])
    return covers[0] if isinstance(covers, list) and covers else post.get("legacy_cover")


def slug_for(post):
    slug = re.sub(r"[^a-z0-9-]+", "-", (post["post_name"] or "listing").lower()).strip("-")
    return f"wp-{post['ID']}-{slug}"[:255]


def slots_for(hours):
    if not isinstance(hours, dict):
        return []
    slots = []
    for day, name in enumerate(DAYS):
        detail = hours.get(name, {})
        if not isinstance(detail, dict):
            continue
        status = detail.get("status")
        if status == "open-all-day":
            slots.append((day, "00:00:00", "23:59:00"))
        elif status == "enter-hours":
            for item in detail.values():
                if not isinstance(item, dict):
                    continue
                start, end = item.get("from", ""), item.get("to", "")
                if re.fullmatch(r"\d\d:\d\d", start) and re.fullmatch(r"\d\d:\d\d", end) and start < end:
                    slots.append((day, start + ":00", end + ":00"))
    return sorted(set(slots))


def prepare(posts):
    ids = [int(p["ID"]) for p in posts]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate source IDs")
    images = {}
    for post in posts:
        url = cover_url(post)
        if url:
            images[url] = image_source(url)
        price = first(post, "_base-price")
        if price not in (None, ""):
            try:
                value = float(price)
                if not 0 <= value <= 999999999:
                    raise ValueError(price)
            except (TypeError, ValueError):
                raise ValueError(f"Invalid price on listing {post['ID']}: {price}")
    return images


def image_variants(source):
    """Create compact WebP cover/profile variants, retaining smaller originals."""
    digest = hashlib.sha256(source.read_bytes()).hexdigest()[:16]
    MEDIA.mkdir(parents=True, exist_ok=True)
    result = {}
    with Image.open(source) as opened:
        oriented = ImageOps.exif_transpose(opened)
        for kind, bounds, quality in [('cover', (1600, 1200), 77), ('profile', (512, 512), 74)]:
            target = MEDIA / f'{digest}-{kind}.webp'
            if not target.exists():
                resized = oriented.copy()
                resized.thumbnail(bounds, Image.Resampling.LANCZOS)
                resized = resized.convert('RGBA' if 'A' in resized.getbands() or 'transparency' in resized.info else 'RGB')
                resized.save(target, 'WEBP', quality=quality, method=6)
            chosen = target
            if oriented.width <= bounds[0] and oriented.height <= bounds[1] and source.stat().st_size < target.stat().st_size:
                original = MEDIA / f'{digest}{source.suffix.lower()}'
                if not original.exists():
                    shutil.copy2(source, original)
                chosen = original
            result[kind] = f'imported/beautypreneurhub/{chosen.name}'
    return result


def keep_owner_image(old_path):
    return bool(old_path) and not old_path.startswith('imported/beautypreneurhub/')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("json_export", type=Path)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--fallback-image", type=Path, help="Image for listings with no source photo")
    args = parser.parse_args()
    posts = json.loads(args.json_export.read_text(encoding="utf-8"))
    images = prepare(posts)
    fallback_input = args.fallback_image or FALLBACK_SOURCE
    if not fallback_input.is_file():
        raise FileNotFoundError(f"Fallback image is missing: {fallback_input}")
    candidates = [imported_email(post) for post in posts]
    if any(not address or "@" not in address for address in candidates):
        raise ValueError("A source listing has no usable account or contact email")
    email_counts = Counter(candidates)
    primary_ids = {}
    for post in sorted(posts, key=lambda item: (item["post_status"] != "publish", int(item["ID"]))):
        primary_ids.setdefault(imported_email(post), int(post["ID"]))
    print(f"Validated {len(posts)} listings and {len(images)} cover images")
    if args.check:
        return
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    required = {"wordpress_listing_id", "imported_email", "listing_categories", "service_zones", "preferred_payment_methods", "work_hours", "wordpress_source_data"}
    columns = {r[1] for r in con.execute("PRAGMA table_info(provider_profiles)")}
    if not required.issubset(columns):
        raise RuntimeError("Run php artisan migrate first")
    backup = ROOT / "storage/app/private" / f"beautyprohq-before-mylisting-{datetime.now():%Y%m%d-%H%M%S}.sqlite"
    backup.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(backup) as destination:
        con.backup(destination)
    print(f"Database backup: {backup}")
    if args.fallback_image:
        MEDIA.mkdir(parents=True, exist_ok=True)
        shutil.copy2(args.fallback_image, FALLBACK_SOURCE)
    image_paths = {url: image_variants(source) for url, source in images.items()}
    fallback_paths = image_variants(FALLBACK_SOURCE)
    category = con.execute("SELECT id,name FROM provider_categories WHERE slug='makeup-artist'").fetchone()
    if not category:
        raise RuntimeError("Makeup Artist category is missing")
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    inserted = updated = 0
    try:
        con.execute("BEGIN IMMEDIATE")
        for post in posts:
            wp_id = int(post["ID"])
            old = con.execute("SELECT id,user_id,profession,profile_photo,cover_image,claimed_at FROM provider_profiles WHERE wordpress_listing_id=?", (wp_id,)).fetchone()
            if old and old["claimed_at"]:
                # A claimed listing belongs to its owner; never replace dashboard edits on a re-import.
                updated += 1
                continue
            name = post["post_title"].strip() or f"Incomplete WordPress draft #{wp_id}"
            profession = category['name'] if not old or old['profession'] in (name[:255], category['name']) else old['profession']
            source_email = imported_email(post)
            login_email = source_email if primary_ids[source_email] == wp_id else f"wp-listing-{wp_id}@import.beautyprohq.invalid"
            if old:
                provider_id, user_id = old["id"], old["user_id"]
                updated += 1
            else:
                existing_user = con.execute("SELECT id FROM users WHERE lower(email)=?", (login_email,)).fetchone()
                if existing_user:
                    raise RuntimeError(f"Import email already exists without source profile: {wp_id}")
                # Random unusable credential until a real owner is verified and claims the listing.
                password = hashlib.sha256(secrets.token_bytes(64)).hexdigest()
                con.execute("INSERT INTO users (name,email,password,role,is_active,is_demo,is_guest,created_at,updated_at) VALUES (?,?,?,'provider',1,0,0,?,?)", (name, login_email, password, now, now))
                user_id = con.execute("SELECT last_insert_rowid()").fetchone()[0]
                provider_id = None
                inserted += 1
            categories = [t["name"] for t in post["terms"] if t["taxonomy"] == "job_listing_category"]
            networks = first(post, "_links", [])
            social = [{"platform": x.get("network", ""), "url": x.get("url", "")} for x in networks if isinstance(x, dict) and x.get("url")] if isinstance(networks, list) else []
            hours = first(post, "_work_hours", {})
            payments = first(post, "_preferred-payment-method", [])
            price = first(post, "_base-price")
            url = cover_url(post)
            source_paths = image_paths[url] if url else fallback_paths
            cover = old["cover_image"] if old and keep_owner_image(old["cover_image"]) else source_paths['cover']
            photo = old["profile_photo"] if old and keep_owner_image(old["profile_photo"]) else source_paths['profile']
            city = first(post, "_city") or None
            country = first(post, "_country") or None
            values = {
                "user_id": user_id, "wordpress_listing_id": wp_id, "imported_email": source_email, "slug": slug_for(post),
                "provider_category_id": category['id'], "profession": profession,
                "bio": post["post_content"] or None, "location": city or country,
                "country": country, "city": city, "contact_email": first(post, "_job_email") or None,
                "contact_phone": first(post, "_job_phone") or None, "website": first(post, "_job_website") or None,
                "cover_image": cover, "profile_photo": photo,
                "social_links": as_json(social), "listing_categories": as_json(categories),
                "service_zones": first(post, "_service-zones") or None,
                "preferred_payment_methods": as_json(payments if isinstance(payments, list) else []),
                "work_hours": as_json(hours if isinstance(hours, dict) else {}),
                "wordpress_source_data": as_json(post),
                "default_currency": first(post, "_currency") or "NGN",
                "base_price": price if price not in (None, "") else None,
                "timezone": hours.get("timezone") if isinstance(hours, dict) else None,
                "is_listed": 1 if post["post_status"] == "publish" else 0,
                "account_approved_at": now if post["post_status"] == "publish" else None,
                "created_at": post["post_date"], "updated_at": post["post_modified"],
            }
            if old:
                columns = [key for key in values if key != "user_id"]
                con.execute(f"UPDATE provider_profiles SET {','.join(k+'=?' for k in columns)} WHERE id=?", [values[k] for k in columns] + [provider_id])
                current = con.execute("SELECT email FROM users WHERE id=?", (user_id,)).fetchone()[0]
                # Keep a later owner change; replace only our original placeholder.
                if current == f"wp-listing-{wp_id}@import.beautyprohq.invalid" and login_email != current:
                    conflict = con.execute("SELECT id FROM users WHERE lower(email)=? AND id<>?", (login_email, user_id)).fetchone()
                    if conflict:
                        raise RuntimeError(f"Login email already belongs to another account: listing {wp_id}")
                    con.execute("UPDATE users SET name=?,email=?,updated_at=? WHERE id=?", (name, login_email, now, user_id))
                else:
                    con.execute("UPDATE users SET name=?,updated_at=? WHERE id=?", (name, now, user_id))
            else:
                columns = list(values)
                con.execute(f"INSERT INTO provider_profiles ({','.join(columns)}) VALUES ({','.join('?' for _ in columns)})", [values[k] for k in columns])
                provider_id = con.execute("SELECT last_insert_rowid()").fetchone()[0]
            con.execute("DELETE FROM availability WHERE provider_id=?", (provider_id,))
            for day, start, end in slots_for(hours):
                con.execute("INSERT INTO availability (provider_id,day_of_week,start_time,end_time,is_active,is_demo,created_at,updated_at) VALUES (?,?,?,?,1,0,?,?)", (provider_id, day, start, end, now, now))
        con.commit()
    except Exception:
        con.rollback()
        raise
    count = con.execute("SELECT COUNT(*) FROM provider_profiles WHERE wordpress_listing_id IS NOT NULL").fetchone()[0]
    if count != len(posts):
        raise RuntimeError(f"Count mismatch: source {len(posts)}, destination {count}")
    print(f"Imported {inserted} new, updated {updated}; verified {count} source IDs; {len(email_counts)} distinct source emails")


if __name__ == "__main__":
    main()
