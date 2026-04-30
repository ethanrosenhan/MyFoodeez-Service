import { models } from '../utils/database.js';

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

const getOwnerName = (user) => {
    if (!user) {
        return 'A Foodeez friend';
    }
    const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
    return name || 'A Foodeez friend';
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

const buildPlainTextSummary = (post, ownerName) => {
    const rating = ratingNumber(post.rating);
    const ratingPart = rating !== null ? `${rating.toFixed(1)}★ ` : '';
    const placePart = post.place ? ` of ${post.place}` : '';
    return `${ownerName}'s ${ratingPart}review${placePart} on Foodeez.`.replace(/\s+/g, ' ').trim();
};

const sharePostPage = async (request, response) => {
    try {
        const post = await models.post.findOne({
            where: { id: request.params.id, is_private: false },
            include: [{ model: models.user, attributes: ['first_name', 'last_name'] }]
        });
        if (!post) {
            return response.status(404).send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Not found</title></head><body style="font-family: Arial, sans-serif; padding: 32px; text-align: center;"><h1>Post not available</h1><p>This review may be private or no longer exists.</p></body></html>`);
        }

        const ownerName = getOwnerName(post.user);
        const place = post.place || 'a restaurant';
        const cuisine = post.cuisine && post.cuisine !== 'Unknown' ? post.cuisine : '';
        const comments = post.comments || '';
        const rating = ratingNumber(post.rating);
        const stars = ratingStars(rating);
        const summary = buildPlainTextSummary(post, ownerName);
        const baseUrl = `${request.protocol}://${request.get('host')}`;
        const canonicalUrl = `${baseUrl}/share/post/${post.id}`;
        const imageUrl = post.image_data && post.image_data.length > 0 ? `${baseUrl}/share/post/${post.id}/image` : '';
        const appDeepLink = `myfoodeez://posts/${post.id}`;

        const safe = {
            title: escapeHtml(`${ownerName} reviewed ${place} on Foodeez`),
            description: escapeHtml(comments ? comments.slice(0, 200) : summary),
            ownerName: escapeHtml(ownerName),
            place: escapeHtml(place),
            cuisine: escapeHtml(cuisine),
            comments: escapeHtml(comments),
            stars,
            ratingLabel: rating !== null ? `${rating.toFixed(1)} / 5` : '',
            canonicalUrl: escapeHtml(canonicalUrl),
            imageUrl: escapeHtml(imageUrl),
            appDeepLink: escapeHtml(appDeepLink)
        };

        return response.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${safe.title}</title>
    <meta property="og:type" content="article">
    <meta property="og:title" content="${safe.title}">
    <meta property="og:description" content="${safe.description}">
    <meta property="og:url" content="${safe.canonicalUrl}">
    ${safe.imageUrl ? `<meta property="og:image" content="${safe.imageUrl}">` : ''}
    <meta name="twitter:card" content="${safe.imageUrl ? 'summary_large_image' : 'summary'}">
    <meta name="twitter:title" content="${safe.title}">
    <meta name="twitter:description" content="${safe.description}">
    ${safe.imageUrl ? `<meta name="twitter:image" content="${safe.imageUrl}">` : ''}
    <style>
        body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; background: #f5f6fb; color: #111827; }
        .header { background: #2a5335; color: #ffffff; text-align: center; padding: 18px 16px; }
        .header h1 { margin: 0; font-size: 22px; letter-spacing: 0.5px; }
        .container { max-width: 560px; margin: 0 auto; padding: 16px; }
        .card { background: #ffffff; border-radius: 18px; overflow: hidden; box-shadow: 0 8px 24px rgba(17, 24, 39, 0.08); border: 1px solid #eef0f4; }
        .hero { width: 100%; display: block; background: #e5e7eb; max-height: 480px; object-fit: cover; }
        .hero-placeholder { padding: 48px 16px; text-align: center; color: #6b7280; font-weight: 600; }
        .body { padding: 20px; }
        .owner { font-size: 13px; color: #047857; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
        .place { margin-top: 6px; font-size: 22px; font-weight: 700; color: #111827; }
        .cuisine { display: inline-block; margin-top: 8px; padding: 4px 10px; background: #ede9fe; color: #5b21b6; border-radius: 999px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; }
        .rating { margin-top: 14px; font-size: 18px; color: #f59e0b; letter-spacing: 2px; }
        .rating-label { margin-left: 8px; color: #6b7280; font-size: 13px; font-weight: 600; letter-spacing: 0; }
        .comments { margin-top: 14px; font-size: 15px; color: #374151; line-height: 1.5; white-space: pre-wrap; }
        .actions { margin-top: 24px; display: flex; flex-direction: column; gap: 10px; }
        .button { text-align: center; padding: 14px 16px; border-radius: 14px; font-weight: 700; text-decoration: none; font-size: 15px; }
        .button-primary { background: #111827; color: #ffffff; }
        .button-secondary { background: #ffffff; color: #111827; border: 1px solid #d1d5db; }
        .footer { text-align: center; padding: 24px 16px; color: #6b7280; font-size: 12px; }
    </style>
</head>
<body>
    <header class="header">
        <h1>Foodeez</h1>
    </header>
    <div class="container">
        <article class="card">
            ${safe.imageUrl
                ? `<img class="hero" src="${safe.imageUrl}" alt="${safe.place}">`
                : `<div class="hero-placeholder">No photo for this review</div>`}
            <div class="body">
                <div class="owner">${safe.ownerName}</div>
                <div class="place">${safe.place}</div>
                ${safe.cuisine ? `<span class="cuisine">${safe.cuisine}</span>` : ''}
                ${safe.stars ? `<div class="rating">${safe.stars}<span class="rating-label">${safe.ratingLabel}</span></div>` : ''}
                ${safe.comments ? `<p class="comments">${safe.comments}</p>` : ''}
                <div class="actions">
                    <a class="button button-primary" href="${safe.appDeepLink}">Open in Foodeez</a>
                    <a class="button button-secondary" href="https://www.myfoodeez.com">Sign up to follow ${safe.ownerName}</a>
                </div>
            </div>
        </article>
    </div>
    <footer class="footer">
        <p>&copy; 2026 MyFoodeez. Reviews from real friends, not strangers.</p>
    </footer>
</body>
</html>`);
    } catch (error) {
        console.error('share post page failed', error);
        return response.status(500).send('Unable to load shared post.');
    }
};

const sharePostImage = async (request, response) => {
    try {
        const post = await models.post.findOne({
            attributes: ['id', 'is_private', 'image_data'],
            where: { id: request.params.id }
        });
        if (!post || post.is_private || !post.image_data || post.image_data.length === 0) {
            return response.status(404).send();
        }

        response.writeHead(200, {
            'Content-Type': 'image/png',
            'Content-Length': post.image_data.length,
            'Cache-Control': 'public, max-age=300'
        });
        return response.end(Buffer.from(post.image_data));
    } catch (error) {
        console.error('share post image failed', error);
        return response.status(500).send();
    }
};

export { sharePostPage, sharePostImage };
