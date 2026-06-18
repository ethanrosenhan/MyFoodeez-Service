import { models } from '../utils/database.js';
import { loadCollabRatingsForPosts } from '../lib/social-helper.js';

// Public restaurant page. Unauthenticated SEO surface — lets Google index
// the data so "best ramen in Tempe"-style searches can land on Foodeez. The
// page renders only data from posts marked `is_private = false`. Private
// posts are excluded entirely; even their existence is not revealed.
//
// Pattern intentionally mirrors controllers/share.js — same inline-HTML
// approach (no separate ejs templates needed), same escapeHtml helper. If
// we end up with three or four of these pages, refactor into a shared
// renderer; not worth it for two.

const REVIEWS_ON_PAGE = 5;
const COMMENT_SNIPPET_MAX = 240;

const escapeHtml = (value) => {
    if (value === null || value === undefined) {
        return '';
    }
    return String(value).replace(/[&<>"']/g, (character) => {
        switch (character) {
            case '&': return '&amp;';
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '"': return '&quot;';
            case "'": return '&#39;';
            default: return character;
        }
    });
};

const ratingNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const ratingStars = (rating) => {
    if (rating === null) {
        return '';
    }
    const rounded = Math.round(rating);
    return `${'★'.repeat(rounded)}${'☆'.repeat(Math.max(0, 5 - rounded))}`;
};

const truncate = (text, max) => {
    if (typeof text !== 'string') {
        return '';
    }
    if (text.length <= max) {
        return text;
    }
    return text.slice(0, max - 1).trimEnd() + '…';
};

const getOwnerInitials = (user) => {
    const first = (user?.first_name || '').trim()[0] || '';
    const last = (user?.last_name || '').trim()[0] || '';
    const initials = (first + last).toUpperCase();
    return initials || (user?.email?.[0] || '?').toUpperCase();
};

const getOwnerDisplayName = (user) => {
    if (!user) return 'A Foodeez friend';
    const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
    return name || 'A Foodeez friend';
};

const renderRestaurantPage = async (request, response) => {
    try {
        const placeId = request.params.placeId;
        if (!placeId) {
            return response.status(404).send('<!DOCTYPE html><html><head><title>Not found</title></head><body>Restaurant not found.</body></html>');
        }

        const posts = await models.post.findAll({
            attributes: ['id', 'place', 'place_secondary_text', 'cuisine', 'cuisine_id', 'rating', 'comments', 'post_date'],
            where: { place_id: placeId, is_private: false },
            include: [{ model: models.user, attributes: ['first_name', 'last_name', 'email'] }],
            order: [['post_date', 'DESC']],
            limit: 50
        });

        if (posts.length === 0) {
            return response.status(404).send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Restaurant not found</title></head><body style="font-family: Arial, sans-serif; padding: 32px; text-align: center;"><h1>Restaurant not found</h1><p>No public reviews exist for this place on Foodeez yet.</p><p><a href="https://www.myfoodeez.com">Visit Foodeez</a></p></body></html>`);
        }

        // Cache the rendered page at the CDN/browser. 30 minutes is short
        // enough that a new review shows up reasonably quickly, long enough
        // that crawlers don't hammer the DB.
        response.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=1800');

        const placeName = posts[0].place || 'Restaurant';
        const placeSecondary = posts[0].place_secondary_text || '';
        // Fold collaborators' own Takes into the average alongside each
        // author's rating, so the headline score reflects everyone who ate
        // there — not just whoever created the post.
        const collabRatingsByPost = await loadCollabRatingsForPosts(posts.map((p) => p.id));
        const ratings = [
            ...posts.map((p) => ratingNumber(p.rating)),
            ...posts.flatMap((p) => collabRatingsByPost.get(p.id) || [])
        ].filter((r) => r !== null);
        const avgRating = ratings.length > 0 ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length : null;
        const cuisines = Array.from(new Set(posts.map((p) => p.cuisine).filter((c) => c && c !== 'Unknown'))).slice(0, 3);
        const reviewsToRender = posts.slice(0, REVIEWS_ON_PAGE);

        const baseUrl = `${request.protocol}://${request.get('host')}`;
        const canonicalUrl = `${baseUrl}/r/${encodeURIComponent(placeId)}`;
        const appDeepLink = `myfoodeez://restaurant/${encodeURIComponent(placeId)}`;
        const title = avgRating !== null
            ? `${placeName} — ${avgRating.toFixed(1)}★ on Foodeez`
            : `${placeName} on Foodeez`;
        const description = `${posts.length} review${posts.length === 1 ? '' : 's'} from real friends${avgRating !== null ? `, average ${avgRating.toFixed(1)} stars` : ''}.`;

        const safe = {
            title: escapeHtml(title),
            description: escapeHtml(description),
            placeName: escapeHtml(placeName),
            placeSecondary: escapeHtml(placeSecondary),
            cuisinesLine: escapeHtml(cuisines.join(' · ')),
            avgStars: avgRating !== null ? ratingStars(avgRating) : '',
            avgLabel: avgRating !== null ? `${avgRating.toFixed(1)} / 5` : '',
            reviewCount: `${posts.length} review${posts.length === 1 ? '' : 's'}`,
            canonicalUrl: escapeHtml(canonicalUrl),
            appDeepLink: escapeHtml(appDeepLink)
        };

        const reviewsHtml = reviewsToRender.map((post) => {
            const rating = ratingNumber(post.rating);
            const stars = rating !== null ? ratingStars(rating) : '';
            const ownerName = getOwnerDisplayName(post.user);
            const initials = getOwnerInitials(post.user);
            const dateLabel = post.post_date ? new Date(post.post_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
            const snippet = truncate(post.comments || '', COMMENT_SNIPPET_MAX);
            return `
                <article class="review">
                    <div class="review-head">
                        <div class="avatar">${escapeHtml(initials)}</div>
                        <div class="review-meta">
                            <div class="review-owner">${escapeHtml(ownerName)}</div>
                            <div class="review-date">${escapeHtml(dateLabel)}</div>
                        </div>
                        ${stars ? `<div class="review-rating">${stars}</div>` : ''}
                    </div>
                    ${snippet ? `<p class="review-body">${escapeHtml(snippet)}</p>` : ''}
                </article>
            `;
        }).join('');

        return response.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${safe.title}</title>
    <meta name="description" content="${safe.description}">
    <link rel="canonical" href="${safe.canonicalUrl}">
    <meta property="og:type" content="restaurant.restaurant">
    <meta property="og:title" content="${safe.title}">
    <meta property="og:description" content="${safe.description}">
    <meta property="og:url" content="${safe.canonicalUrl}">
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="${safe.title}">
    <meta name="twitter:description" content="${safe.description}">
    <style>
        body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; background: #f5f6fb; color: #111827; }
        .header { background: #2a5335; color: #ffffff; text-align: center; padding: 18px 16px; }
        .header h1 { margin: 0; font-size: 22px; letter-spacing: 0.5px; }
        .container { max-width: 640px; margin: 0 auto; padding: 16px; }
        .hero { background: #ffffff; border-radius: 18px; padding: 24px; box-shadow: 0 8px 24px rgba(17, 24, 39, 0.08); border: 1px solid #eef0f4; }
        .place-name { margin: 0; font-size: 28px; font-weight: 800; color: #111827; }
        .place-secondary { margin-top: 6px; color: #6b7280; font-size: 14px; }
        .cuisines { margin-top: 10px; display: inline-block; padding: 4px 10px; background: #ede9fe; color: #5b21b6; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; }
        .stats { margin-top: 18px; display: flex; align-items: center; gap: 16px; }
        .stats-rating { font-size: 36px; font-weight: 800; color: #111827; line-height: 1; }
        .stats-stars { color: #f59e0b; font-size: 18px; letter-spacing: 2px; }
        .stats-label { color: #6b7280; font-size: 13px; font-weight: 600; margin-top: 4px; }
        .actions { margin-top: 24px; display: flex; flex-direction: column; gap: 10px; }
        .button { text-align: center; padding: 14px 16px; border-radius: 14px; font-weight: 700; text-decoration: none; font-size: 15px; }
        .button-primary { background: #111827; color: #ffffff; }
        .button-secondary { background: #ffffff; color: #111827; border: 1px solid #d1d5db; }
        .reviews-title { margin: 28px 0 12px; font-size: 12px; font-weight: 800; color: #6b7280; text-transform: uppercase; letter-spacing: 0.8px; }
        .review { background: #ffffff; border: 1px solid #eef0f4; border-radius: 14px; padding: 16px; margin-bottom: 10px; }
        .review-head { display: flex; align-items: center; gap: 10px; }
        .avatar { width: 36px; height: 36px; border-radius: 18px; background: #2a5335; color: #ffffff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; letter-spacing: 0.4px; }
        .review-meta { flex: 1; }
        .review-owner { font-weight: 700; color: #111827; font-size: 14px; }
        .review-date { color: #6b7280; font-size: 11px; margin-top: 2px; }
        .review-rating { color: #f59e0b; letter-spacing: 1.5px; font-size: 14px; }
        .review-body { margin: 10px 0 0; color: #374151; line-height: 1.5; font-size: 14px; white-space: pre-wrap; }
        .footer { text-align: center; padding: 28px 16px; color: #6b7280; font-size: 12px; }
    </style>
</head>
<body>
    <header class="header">
        <h1>Foodeez</h1>
    </header>
    <div class="container">
        <section class="hero">
            <h2 class="place-name">${safe.placeName}</h2>
            ${safe.placeSecondary ? `<div class="place-secondary">${safe.placeSecondary}</div>` : ''}
            ${safe.cuisinesLine ? `<span class="cuisines">${safe.cuisinesLine}</span>` : ''}
            ${safe.avgStars ? `
                <div class="stats">
                    <div class="stats-rating">${safe.avgLabel.split(' ')[0]}</div>
                    <div>
                        <div class="stats-stars">${safe.avgStars}</div>
                        <div class="stats-label">${safe.reviewCount}</div>
                    </div>
                </div>
            ` : `<div class="stats-label" style="margin-top: 18px;">${safe.reviewCount}</div>`}
            <div class="actions">
                <a class="button button-primary" href="${safe.appDeepLink}">Open in Foodeez</a>
                <a class="button button-secondary" href="https://www.myfoodeez.com">Sign up to see what your friends think</a>
            </div>
        </section>
        <h3 class="reviews-title">Recent reviews</h3>
        ${reviewsHtml}
    </div>
    <footer class="footer">
        <p>&copy; 2026 MyFoodeez. Reviews from real friends, not strangers.</p>
    </footer>
</body>
</html>`);
    } catch (error) {
        console.error('restaurant page failed', error);
        return response.status(500).send('Unable to load restaurant page.');
    }
};

export { renderRestaurantPage };
