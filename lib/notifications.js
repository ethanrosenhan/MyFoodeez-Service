import Sequelize from 'sequelize';
import { models } from '../utils/database.js';
import { sendToUsers } from './push-helper.js';
import { getAcceptedFriendIds, getDisplayName } from './social-helper.js';

const Op = Sequelize.Op;

// Notification triggers + scheduled sweeps. Three flavors:
//
//   1. notifyFriendsOfPostAtPlace
//      Fire-and-forget on post create. Pushes to friends who have themselves
//      posted at the same place_id ("you've been there too" angle). The
//      uniquely-Foodeez trigger — Yelp/Google can't do this because they
//      don't know your friend graph.
//
//   2. runScheduledSweeps
//      Called every hour from server.js. Internally gates each sweep on the
//      audit table so re-runs are no-ops:
//
//      a. weeklyDigestSweep — Saturdays around 15:00 UTC (mid-morning US),
//         sends "N new spots from friends this week" to users whose friends
//         actually posted in the last 7 days.
//      b. onboardingNudgeSweep — daily, sends day-2 and day-5 post-signup
//         nudges to brand-new users. After day 7 the user is fully outside
//         the onboarding window and never nudged again.
//
// Idempotency rule: every send goes through `recordSent(...)` which writes
// an audit row before sending. A duplicate sweep will see the row and skip.

const auditEventTypeForSchedule = (kind, dateKey) => `notif:${kind}:${dateKey}`;
const auditEventTypeForUser = (kind, userId, dateKey) => `notif:${kind}:user_${userId}:${dateKey}`;

const recordIfFirst = async (eventType, data = {}) => {
    const [, created] = await models.audit.findOrCreate({
        where: { event_type: eventType },
        defaults: { event_type: eventType, audit_timestamp: new Date(), data }
    });
    return created;
};

const dateBucket = (date = new Date()) => date.toISOString().slice(0, 10); // YYYY-MM-DD

// -------- Trigger 1: friend visited the same place --------

const notifyFriendsOfPostAtPlace = async ({ postAuthorUserId, placeId, place }) => {
    if (!postAuthorUserId || !placeId) {
        return { sent: 0 };
    }

    try {
        const author = await models.user.findOne({
            attributes: ['id', 'first_name', 'last_name', 'email'],
            where: { id: postAuthorUserId }
        });
        if (!author) {
            return { sent: 0 };
        }
        const authorName = getDisplayName(author) || 'A Foodeez friend';

        // Friends who have also posted at this place_id. The post privacy of
        // the friend's prior post doesn't matter — the friend is the one
        // being notified about their own past visit.
        const friendIds = await getAcceptedFriendIds(postAuthorUserId);
        if (friendIds.length === 0) {
            return { sent: 0 };
        }

        const priorPosters = await models.post.findAll({
            attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('user_id')), 'user_id']],
            where: {
                place_id: placeId,
                user_id: { [Op.in]: friendIds }
            },
            raw: true
        });
        const recipientIds = priorPosters.map((row) => Number(row.user_id)).filter(Boolean);
        if (recipientIds.length === 0) {
            return { sent: 0 };
        }

        const title = `${authorName} reviewed ${place || "a place you've been"}`;
        const body = "You've been there too — see what they thought.";
        return await sendToUsers(recipientIds, {
            title,
            body,
            data: { type: 'friend_visited', place_id: placeId }
        });
    } catch (error) {
        console.warn('notifyFriendsOfPostAtPlace failed', error?.message || error);
        return { sent: 0, error: true };
    }
};

// -------- Trigger 1b: tagged as a collaborator --------

const notifyCollaboratorsTagged = async ({ authorUserId, collaboratorUserIds, place }) => {
    if (!authorUserId || !Array.isArray(collaboratorUserIds) || collaboratorUserIds.length === 0) {
        return { sent: 0 };
    }
    try {
        const author = await models.user.findOne({
            attributes: ['id', 'first_name', 'last_name', 'email'],
            where: { id: authorUserId }
        });
        const authorName = getDisplayName(author) || 'A Foodeez friend';
        const title = `${authorName} tagged you in a post`;
        const body = place
            ? `You ate at ${place} together — add your own rating.`
            : 'Add your own rating to the post.';
        return await sendToUsers(collaboratorUserIds, {
            title,
            body,
            data: { type: 'collab_tagged' }
        });
    } catch (error) {
        console.warn('notifyCollaboratorsTagged failed', error?.message || error);
        return { sent: 0, error: true };
    }
};

// -------- Trigger 2: weekly digest --------

const WEEKLY_DIGEST_DOW = 6;        // Saturday (0 = Sun, 6 = Sat)
const WEEKLY_DIGEST_HOUR_UTC = 15;  // ~7am PT / 10am ET / 4pm UK

const isWeeklyDigestWindow = (now = new Date()) =>
    now.getUTCDay() === WEEKLY_DIGEST_DOW && now.getUTCHours() >= WEEKLY_DIGEST_HOUR_UTC;

const weeklyDigestSweep = async () => {
    const today = new Date();
    if (!isWeeklyDigestWindow(today)) {
        return { ran: false, reason: 'outside_window' };
    }
    const eventType = auditEventTypeForSchedule('digest', dateBucket(today));
    const firstRun = await recordIfFirst(eventType);
    if (!firstRun) {
        return { ran: false, reason: 'already_ran' };
    }

    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    // For each user who has at least one accepted friend, count how many of
    // their friends' shared posts landed in the last 7 days. Send a digest
    // if that count is > 0.
    const users = await models.user.findAll({ attributes: ['id', 'first_name', 'last_name', 'email'], raw: true });
    let totalSent = 0;
    for (const user of users) {
        try {
            const friendIds = await getAcceptedFriendIds(user.id);
            if (friendIds.length === 0) continue;
            const newPostCount = await models.post.count({
                where: {
                    user_id: { [Op.in]: friendIds },
                    is_private: false,
                    post_date: { [Op.gte]: sevenDaysAgo }
                }
            });
            if (newPostCount === 0) continue;
            const result = await sendToUsers([user.id], {
                title: 'Your Foodeez digest',
                body: `${newPostCount} new ${newPostCount === 1 ? 'spot' : 'spots'} from friends this week.`,
                data: { type: 'weekly_digest', count: newPostCount }
            });
            totalSent += result.sent;
        } catch (error) {
            console.warn(`digest send failed for user ${user.id}`, error?.message);
        }
    }
    return { ran: true, sent: totalSent };
};

// -------- Trigger 3: onboarding nudges (day 2 + day 5 post-signup) --------

const ONBOARDING_NUDGES = [
    {
        kind: 'onboard_d2',
        ageDays: 2,
        title: 'Post your first Foodeez review',
        body: 'Snap a photo of your next meal and rate it — your friends can\'t wait to see.'
    },
    {
        kind: 'onboard_d5',
        ageDays: 5,
        title: 'Add a friend on Foodeez',
        body: 'Your map gets way better once you can see where your friends have been eating.'
    }
];

const isAgeDays = (createdAt, targetDays, now) => {
    if (!createdAt) return false;
    const ageMs = now.getTime() - new Date(createdAt).getTime();
    const ageDays = ageMs / (24 * 60 * 60 * 1000);
    return ageDays >= targetDays && ageDays < targetDays + 1;
};

const onboardingNudgeSweep = async () => {
    const now = new Date();
    const sweepGate = auditEventTypeForSchedule('onboard_sweep', dateBucket(now));
    const firstRun = await recordIfFirst(sweepGate);
    if (!firstRun) {
        return { ran: false, reason: 'already_ran' };
    }

    // Only inspect users created in the last 14 days — bounded scan that
    // doesn't grow with the user table.
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const recentUsers = await models.user.findAll({
        attributes: ['id', 'created_at'],
        where: { created_at: { [Op.gte]: fourteenDaysAgo } },
        raw: true
    });

    let totalSent = 0;
    for (const user of recentUsers) {
        for (const nudge of ONBOARDING_NUDGES) {
            if (!isAgeDays(user.created_at, nudge.ageDays, now)) continue;
            const eventType = auditEventTypeForUser(nudge.kind, user.id, dateBucket(now));
            const firstNudge = await recordIfFirst(eventType);
            if (!firstNudge) continue;
            try {
                const result = await sendToUsers([user.id], {
                    title: nudge.title,
                    body: nudge.body,
                    data: { type: nudge.kind }
                });
                totalSent += result.sent;
            } catch (error) {
                console.warn(`onboarding ${nudge.kind} failed for user ${user.id}`, error?.message);
            }
        }
    }
    return { ran: true, sent: totalSent };
};

// -------- Scheduler entry point --------

const runScheduledSweeps = async () => {
    try {
        await weeklyDigestSweep();
    } catch (error) {
        console.error('weeklyDigestSweep crashed', error);
    }
    try {
        await onboardingNudgeSweep();
    } catch (error) {
        console.error('onboardingNudgeSweep crashed', error);
    }
};

export {
    notifyFriendsOfPostAtPlace,
    notifyCollaboratorsTagged,
    weeklyDigestSweep,
    onboardingNudgeSweep,
    runScheduledSweeps,
    isWeeklyDigestWindow
};
