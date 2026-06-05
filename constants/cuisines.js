// Cuisine taxonomy. Flat list — `parent: null` means top-level, otherwise
// `parent` is the id of the parent entry. IDs are kebab-case and child IDs
// start with their parent's id + '-' (used by the map filter for prefix match).
//
// `aliases` are lowercase strings used by the cuisine_id backfill script to
// map legacy free-text cuisine values onto taxonomy entries.
//
// To add a cuisine: append a row. To add a subset: append a row with the
// appropriate `parent` id. Editing labels is safe (label is what the UI shows);
// editing an id breaks existing data — don't do it without a migration.
//
// 'other' is a UI-only sentinel for "free text fallback" — never stored in the
// database. 'unknown' is the bucket used by the backfill for posts whose old
// free-text cuisine didn't match any taxonomy entry.

const CUISINES = [
    // Pizza
    { id: 'pizza', label: 'Pizza', parent: null, aliases: ['pizza'] },
    { id: 'pizza-ny', label: 'NY-Style', parent: 'pizza', aliases: ['ny pizza', 'new york pizza', 'new york style pizza'] },
    { id: 'pizza-neapolitan', label: 'Neapolitan', parent: 'pizza', aliases: ['neapolitan', 'neapolitan pizza'] },
    { id: 'pizza-detroit', label: 'Detroit', parent: 'pizza', aliases: ['detroit pizza', 'detroit-style pizza'] },
    { id: 'pizza-chicago', label: 'Chicago / Deep Dish', parent: 'pizza', aliases: ['chicago pizza', 'deep dish', 'deep dish pizza'] },
    { id: 'pizza-chain', label: 'Chain (Pizza Hut, Domino\'s)', parent: 'pizza', aliases: ['pizza hut', 'dominos', "domino's", 'papa johns', "papa john's"] },
    { id: 'pizza-fastcasual', label: 'Fast Casual (Spinatos, Blaze)', parent: 'pizza', aliases: ['spinatos', 'blaze', 'blaze pizza', 'mod pizza'] },

    // Mexican
    { id: 'mexican', label: 'Mexican', parent: null, aliases: ['mexican'] },
    { id: 'mexican-traditional', label: 'Traditional', parent: 'mexican', aliases: ['traditional mexican', 'authentic mexican'] },
    { id: 'mexican-taqueria', label: 'Taqueria', parent: 'mexican', aliases: ['taqueria', 'tacos'] },
    { id: 'mexican-fastfood', label: 'Fast Food (Taco Bell, Pollo Loco)', parent: 'mexican', aliases: ['taco bell', 'pollo loco', 'el pollo loco', 'del taco'] },
    { id: 'mexican-fastcasual', label: 'Fast Casual (Chipotle, Qdoba)', parent: 'mexican', aliases: ['chipotle', 'qdoba', 'rubios'] },

    // Italian (non-pizza)
    { id: 'italian', label: 'Italian', parent: null, aliases: ['italian'] },
    { id: 'italian-pasta', label: 'Pasta / Trattoria', parent: 'italian', aliases: ['pasta', 'trattoria'] },
    { id: 'italian-finedining', label: 'Fine Dining', parent: 'italian' },

    // American
    { id: 'american', label: 'American', parent: null, aliases: ['american'] },
    { id: 'american-burgers', label: 'Burgers', parent: 'american', aliases: ['burgers', 'burger', 'hamburger'] },
    { id: 'american-diner', label: 'Diner', parent: 'american', aliases: ['diner'] },
    { id: 'american-southern', label: 'Southern / Soul', parent: 'american', aliases: ['southern', 'soul food'] },
    { id: 'american-bbq', label: 'BBQ', parent: 'american', aliases: ['bbq', 'barbecue', 'barbeque'] },
    { id: 'american-steakhouse', label: 'Steakhouse', parent: 'american', aliases: ['steakhouse', 'steak'] },

    // Asian
    { id: 'chinese', label: 'Chinese', parent: null, aliases: ['chinese'] },
    { id: 'japanese', label: 'Japanese', parent: null, aliases: ['japanese'] },
    { id: 'japanese-sushi', label: 'Sushi', parent: 'japanese', aliases: ['sushi'] },
    { id: 'japanese-ramen', label: 'Ramen', parent: 'japanese', aliases: ['ramen'] },
    { id: 'thai', label: 'Thai', parent: null, aliases: ['thai'] },
    { id: 'korean', label: 'Korean', parent: null, aliases: ['korean', 'kbbq', 'korean bbq'] },
    { id: 'vietnamese', label: 'Vietnamese', parent: null, aliases: ['vietnamese', 'pho', 'banh mi'] },
    { id: 'indian', label: 'Indian', parent: null, aliases: ['indian'] },

    // Mediterranean / Middle Eastern
    { id: 'mediterranean', label: 'Mediterranean', parent: null, aliases: ['mediterranean'] },
    { id: 'mediterranean-greek', label: 'Greek', parent: 'mediterranean', aliases: ['greek'] },
    { id: 'mediterranean-lebanese', label: 'Lebanese', parent: 'mediterranean', aliases: ['lebanese'] },
    { id: 'mediterranean-turkish', label: 'Turkish', parent: 'mediterranean', aliases: ['turkish'] },

    // Fast Food (general — not tied to a specific cuisine)
    { id: 'fast-food', label: 'Fast Food', parent: null, aliases: ['fast food', 'fastfood'] },
    { id: 'fast-food-burgers', label: 'Burgers', parent: 'fast-food', aliases: ["mcdonald's", 'mcdonalds', 'burger king', "wendy's", 'wendys', 'five guys', 'in-n-out', 'whataburger'] },
    { id: 'fast-food-chicken', label: 'Chicken', parent: 'fast-food', aliases: ['chick-fil-a', 'chickfila', 'popeyes', 'kfc', "raising cane's", 'raising canes', "zaxby's"] },
    { id: 'fast-food-sandwiches', label: 'Sandwiches / Subs', parent: 'fast-food', aliases: ['subway', 'jimmy johns', "jimmy john's", 'jersey mikes', "jersey mike's", 'firehouse subs'] },

    // Single-category top-levels
    { id: 'seafood', label: 'Seafood', parent: null, aliases: ['seafood', 'fish'] },
    { id: 'breakfast', label: 'Breakfast / Brunch', parent: null, aliases: ['breakfast', 'brunch'] },
    { id: 'desserts', label: 'Desserts', parent: null, aliases: ['dessert', 'desserts'] },
    { id: 'desserts-icecream', label: 'Ice Cream', parent: 'desserts', aliases: ['ice cream', 'icecream', 'gelato'] },
    { id: 'desserts-bakery', label: 'Bakery', parent: 'desserts', aliases: ['bakery', 'pastry'] },
    { id: 'coffee', label: 'Coffee / Cafe', parent: null, aliases: ['coffee', 'cafe', 'café'] },
    { id: 'vegan', label: 'Vegan', parent: null, aliases: ['vegan'] },
    { id: 'vegetarian', label: 'Vegetarian', parent: null, aliases: ['vegetarian'] },

    // Sentinels
    { id: 'other', label: 'Other', parent: null }, // UI-only — never written to DB; client uses cuisine_id=null instead
    { id: 'unknown', label: 'Unknown', parent: null, aliases: ['unknown'] }
];

const getTopLevel = () => CUISINES.filter((c) => c.parent === null);
const getChildren = (parentId) => CUISINES.filter((c) => c.parent === parentId);
const findById = (id) => CUISINES.find((c) => c.id === id) || null;

// Reverse lookup table: alias string (lowercased) → cuisine entry.
// Includes labels themselves so 'pizza' matches both label and alias paths.
const buildAliasIndex = () => {
    const index = new Map();
    CUISINES.forEach((c) => {
        if (c.id === 'other') {
            return; // 'other' is UI-only, never matched from data
        }
        index.set(c.label.toLowerCase(), c);
        (c.aliases || []).forEach((alias) => {
            index.set(alias.toLowerCase(), c);
        });
    });
    return index;
};

const ALIAS_INDEX = buildAliasIndex();

const findByFreeText = (text) => {
    if (typeof text !== 'string') {
        return null;
    }
    const key = text.trim().toLowerCase();
    if (key.length === 0) {
        return null;
    }
    return ALIAS_INDEX.get(key) || null;
};

export { CUISINES, getTopLevel, getChildren, findById, findByFreeText };
