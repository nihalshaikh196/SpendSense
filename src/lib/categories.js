/**
 * @module categories
 * @description Maps items and keywords to expense categories using a
 * dictionary-based lookup. Each category has an emoji, display label,
 * and a set of trigger keywords.
 */

/**
 * @typedef {Object} CategoryDefinition
 * @property {string}   key      - Machine-readable category key
 * @property {string}   label    - Human-readable title-cased label
 * @property {string}   emoji    - Display emoji
 * @property {string[]} keywords - Lowercase keywords that trigger this category
 */

/**
 * All supported categories with their emoji and keyword lists.
 * @type {Record<string, CategoryDefinition>}
 */
export const CATEGORIES = Object.freeze({
  food: {
    key: 'food',
    label: 'Food',
    emoji: '🍔',
    keywords: [
      'vadapav', 'vada pav', 'chai', 'coffee', 'lunch', 'dinner', 'biryani',
      'pizza', 'restaurant', 'snacks', 'snack', 'breakfast', 'burger',
      'noodles', 'rice', 'thali', 'dosa', 'samosa', 'pav bhaji', 'ice cream',
      'icecream', 'juice', 'tea', 'beer', 'wine', 'drinks', 'drink', 'bar',
      'pub', 'zomato', 'swiggy', 'milk', 'eggs', 'egg', 'bread', 'paneer',
      'chicken', 'mutton', 'fish', 'cake', 'chocolate', 'dessert', 'desserts',
      'food', 'meal', 'brunch', 'cafe', 'canteen', 'mess',
      'sandwich', 'momos', 'idli', 'vada', 'poha', 'upma', 'paratha', 'roti',
      'curry', 'dal', 'sabzi', 'fruits', 'vegetables', 'veggies', 'buffet',
      'dhaba', 'starbucks', 'dominos', 'mcdonalds', 'kfc', 'biscuits',
      'namkeen', 'sweets', 'lassi', 'shake', 'smoothie', 'soda', 'water bottle',
    ],
  },
  transport: {
    key: 'transport',
    label: 'Transport',
    emoji: '🚗',
    keywords: [
      'uber', 'ola', 'auto', 'rickshaw', 'petrol', 'diesel', 'bus', 'train',
      'metro', 'parking', 'toll', 'cab', 'taxi', 'flight', 'airfare',
      'ticket', 'tickets', 'rapido', 'fuel', 'transport', 'travel', 'commute',
      'bike', 'scooter', 'servicing', 'tyre', 'tyres', 'puncture', 'challan',
      'fastag', 'irctc', 'indigo', 'vistara', 'airport', 'railway',
    ],
  },
  shopping: {
    key: 'shopping',
    label: 'Shopping',
    emoji: '🛒',
    keywords: [
      'clothes', 'shoe', 'shoes', 'amazon', 'flipkart', 'mall', 'groceries',
      'grocery', 'myntra', 'shirt', 'tshirt', 't-shirt', 'jeans', 'dress',
      'jacket', 'sneakers', 'sandals', 'watch', 'bag', 'electronics', 'phone',
      'laptop', 'headphones', 'charger', 'accessories', 'shopping', 'shop',
      // Furniture and household goods
      'table', 'chair', 'sofa', 'couch', 'bed', 'mattress', 'furniture',
      'desk', 'wardrobe', 'cupboard', 'shelf', 'curtains', 'lamp', 'mirror',
      'cushion', 'carpet', 'rug', 'bedsheet', 'pillow', 'utensils',
      // Appliances
      'fridge', 'refrigerator', 'washing machine', 'microwave', 'television',
      'oven', 'cooler', 'geyser', 'vacuum', 'appliance',
      'gift', 'gifts',
    ],
  },
  entertainment: {
    key: 'entertainment',
    label: 'Entertainment',
    emoji: '🎬',
    keywords: [
      'movie', 'movies', 'netflix', 'games', 'game', 'concert',
      'popcorn', 'spotify', 'hotstar', 'prime', 'youtube', 'subscription',
      'magazine', 'gaming', 'entertainment',
      'novel', 'comics', 'theatre', 'theater', 'bowling', 'arcade',
      'amusement', 'party', 'picnic', 'ott', 'show',
    ],
  },
  health: {
    key: 'health',
    label: 'Health',
    emoji: '💊',
    keywords: [
      'medicine', 'medicines', 'doctor', 'pharmacy', 'gym', 'hospital',
      'dentist', 'checkup', 'check-up', 'test', 'lab', 'vitamins',
      'vitamin', 'protein', 'health', 'medical',
      'physio', 'therapy', 'yoga', 'clinic', 'surgery', 'dental',
      'spectacles', 'lenses', 'bandage', 'syrup',
    ],
  },
  bills: {
    key: 'bills',
    label: 'Bills',
    emoji: '📱',
    keywords: [
      'recharge', 'electricity', 'wifi', 'rent', 'emi', 'insurance',
      'water', 'gas', 'maintenance', 'internet', 'broadband', 'postpaid',
      'prepaid', 'bill', 'bills', 'utility',
      'dth', 'jio', 'airtel', 'vodafone', 'bsnl', 'tax', 'cylinder',
      'society', 'loan',
    ],
  },
  education: {
    key: 'education',
    label: 'Education',
    emoji: '📚',
    keywords: [
      'tuition', 'course', 'courses', 'book', 'books', 'textbook',
      'textbooks', 'exam', 'exams', 'fees', 'fee', 'coaching', 'class',
      'classes', 'school', 'college', 'university', 'udemy', 'coursera',
      'education', 'study', 'stationery', 'notebook', 'pen', 'pencil',
    ],
  },
  personal: {
    key: 'personal',
    label: 'Personal',
    emoji: '💈',
    keywords: [
      'haircut', 'salon', 'spa', 'grooming', 'laundry', 'dry clean',
      'dryclean', 'personal', 'parlour', 'parlor',
      'barber', 'shave', 'manicure', 'pedicure', 'massage', 'cosmetics',
      'makeup', 'skincare', 'shampoo', 'perfume', 'deodorant',
    ],
  },
  other: {
    key: 'other',
    label: 'Other',
    emoji: '📦',
    keywords: [],
  },
});

/**
 * Phrases that must beat the single-word scan because their individual words
 * point at different categories — "watch movie" would otherwise match 'watch'
 * (shopping) and "coffee table" would match 'coffee' (food).
 * @type {Array<{ phrase: string, category: string }>}
 */
const DISAMBIGUATING_PHRASES = [
  { phrase: 'coffee table', category: 'shopping' },
  { phrase: 'dining table', category: 'shopping' },
  { phrase: 'watch movie', category: 'entertainment' },
  { phrase: 'watched movie', category: 'entertainment' },
  { phrase: 'movie ticket', category: 'entertainment' },
  { phrase: 'movie tickets', category: 'entertainment' },
  { phrase: 'concert ticket', category: 'entertainment' },
  { phrase: 'concert tickets', category: 'entertainment' },
  { phrase: 'gas cylinder', category: 'bills' },
  { phrase: 'water bill', category: 'bills' },
  { phrase: 'phone bill', category: 'bills' },
  { phrase: 'school fees', category: 'education' },
  { phrase: 'medical test', category: 'health' },
  { phrase: 'blood test', category: 'health' },
];

/**
 * Pre-built reverse lookup: keyword → category key.
 * Multi-word keywords are stored as-is and matched via substring scan.
 * @type {Map<string, string>}
 */
const singleWordMap = new Map();
const multiWordEntries = [...DISAMBIGUATING_PHRASES];

for (const [catKey, def] of Object.entries(CATEGORIES)) {
  for (const kw of def.keywords) {
    if (kw.includes(' ')) {
      multiWordEntries.push({ phrase: kw, category: catKey });
    } else if (!singleWordMap.has(kw)) {
      // First declaration wins, so a keyword listed in two categories resolves
      // by CATEGORIES order instead of by whichever happened to be assigned
      // last. Keep the lists free of duplicates and this never has to arbitrate.
      singleWordMap.set(kw, catKey);
    }
  }
}

// Sort multi-word entries by length (longest first) for greedy matching
multiWordEntries.sort((a, b) => b.phrase.length - a.phrase.length);

/**
 * Strips a simple English plural so "tables" reaches the 'table' keyword.
 * Only used as a fallback after an exact match fails, so shrinking a word
 * that was already a keyword ("bus", "mess") can never do harm.
 *
 * @param {string} word - A lowercased, punctuation-stripped word
 * @returns {string}
 */
function singularize(word) {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  // Only drop "es" after a sibilant (boxes → box, dishes → dish); elsewhere
  // the plural is a bare "s" and cutting two would give "tables" → "tabl".
  if (word.length > 4 && /(ch|sh|s|x|z)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/**
 * Detects the most appropriate category for a given text input.
 * Checks multi-word phrases first (e.g. "pav bhaji", "ice cream"),
 * then falls back to single-word keyword matching.
 * Returns 'other' if no match is found.
 *
 * @param {string} text - Natural language input describing an expense
 * @returns {string} Category key (e.g. 'food', 'transport', 'other')
 *
 * @example
 * detectCategory('Had vadapav with chai')       // → 'food'
 * detectCategory('Uber to airport')             // → 'transport'
 * detectCategory('Something random')            // → 'other'
 */
export function detectCategory(text) {
  if (!text || typeof text !== 'string') {
    return 'other';
  }

  const lower = text.toLowerCase();

  // 1. Check multi-word phrases first (greedy, longest match)
  for (const { phrase, category } of multiWordEntries) {
    if (lower.includes(phrase)) {
      return category;
    }
  }

  // 2. Tokenize and check single words, exact form before singularized
  const words = lower.split(/\s+/);
  for (const word of words) {
    // Strip surrounding punctuation
    const cleaned = word.replace(/^[^a-z0-9-]+|[^a-z0-9-]+$/gi, '');
    if (!cleaned) continue;

    if (singleWordMap.has(cleaned)) {
      return singleWordMap.get(cleaned);
    }

    const singular = singularize(cleaned);
    if (singular !== cleaned && singleWordMap.has(singular)) {
      return singleWordMap.get(singular);
    }
  }

  return 'other';
}

/**
 * Returns the emoji for a given category key.
 *
 * @param {string} categoryKey - Category key (e.g. 'food', 'transport')
 * @returns {string} Emoji string, defaults to 📦 for unknown categories
 *
 * @example
 * getCategoryEmoji('food')    // → '🍔'
 * getCategoryEmoji('unknown') // → '📦'
 */
export function getCategoryEmoji(categoryKey) {
  if (!categoryKey || typeof categoryKey !== 'string') {
    return CATEGORIES.other.emoji;
  }

  return CATEGORIES[categoryKey]?.emoji ?? CATEGORIES.other.emoji;
}

/**
 * Returns the title-cased display label for a given category key.
 *
 * @param {string} categoryKey - Category key (e.g. 'food', 'transport')
 * @returns {string} Title-cased label (e.g. 'Food', 'Transport'), or
 *                   title-cased key itself for unknown categories
 *
 * @example
 * getCategoryLabel('food')        // → 'Food'
 * getCategoryLabel('entertainment') // → 'Entertainment'
 * getCategoryLabel('xyz')         // → 'Xyz'
 */
export function getCategoryLabel(categoryKey) {
  if (!categoryKey || typeof categoryKey !== 'string') {
    return 'Other';
  }

  if (CATEGORIES[categoryKey]) {
    return CATEGORIES[categoryKey].label;
  }

  // Title-case the unknown key as a fallback
  return categoryKey.charAt(0).toUpperCase() + categoryKey.slice(1).toLowerCase();
}
