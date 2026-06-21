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
      // International foods
      'sushi', 'taco', 'tacos', 'ramen', 'kebab', 'kebabs', 'pho', 'falafel',
      'bagel', 'croissant', 'donut', 'donuts', 'sandwich', 'salad', 'pasta',
      'steak', 'soup', 'curry', 'dumpling', 'burrito', 'gyro', 'shawarma',
      'hummus', 'nachos',
      // Indian foods
      'idli', 'vada', 'upma', 'poha', 'paratha', 'roti', 'naan', 'chaat',
      'kachori', 'bhel', 'kulfi', 'lassi', 'chutney', 'sabzi',
      'paani puri', 'pani puri', 'gol gappa',
      // Food chains
      'dominos', 'kfc', 'mcdonalds', 'mcd', 'starbucks', 'ccd', 'haldiram',
      'haldirams', 'bikaner', 'bikanervala',
      'burger king', 'cafe coffee day', 'barbeque nation', 'bbq nation',
      // International delivery brands
      'doordash', 'deliveroo', 'ubereats', 'uber eats', 'just eat',
      'postmates', 'talabat',
    ],
  },
  transport: {
    key: 'transport',
    label: 'Transport',
    emoji: '🚗',
    keywords: [
      'uber', 'ola', 'auto', 'rickshaw', 'petrol', 'diesel', 'bus', 'train',
      'metro', 'parking', 'toll', 'cab', 'taxi', 'flight', 'airfare',
      'ticket', 'rapido', 'fuel', 'transport', 'travel', 'commute',
      // International ride-hailing
      'lyft', 'careem', 'bolt',
      // Rentals
      'scooter', 'zoomcar', 'bike rental', 'car rental', 'e-rickshaw',
      'e rickshaw',
      // Travel-booking platforms (lodging + travel folded in for simplicity)
      'makemytrip', 'mmt', 'goibibo', 'ixigo', 'redbus', 'oyo', 'agoda',
      'airbnb', 'booking.com',
    ],
  },
  shopping: {
    key: 'shopping',
    label: 'Shopping',
    emoji: '🛒',
    keywords: [
      'clothes', 'shoes', 'amazon', 'flipkart', 'mall', 'groceries',
      'grocery', 'myntra', 'shirt', 'jeans', 'dress', 'watch', 'bag',
      'electronics', 'phone', 'laptop', 'headphones', 'charger',
      'accessories', 'shopping', 'shop',
      // Furniture
      'sofa', 'couch', 'chair', 'chairs', 'table', 'tables', 'desk',
      'bed', 'mattress', 'shelf', 'shelves', 'bookshelf', 'wardrobe',
      'cabinet', 'drawer', 'dresser', 'lamp', 'lamps', 'curtains',
      'carpet', 'rug', 'pillow', 'pillows', 'cushion', 'furniture',
      'dining table', 'coffee table',
      // Quick commerce / groceries
      'blinkit', 'zepto', 'instamart', 'swiggy instamart', 'bigbasket',
      'big basket', 'dunzo', 'grofers', 'jiomart', 'jio mart', 'dmart',
      'd-mart',
      // Indian shopping brands
      'nykaa', 'ajio', 'meesho', 'snapdeal', 'lenskart', 'firstcry',
      'urbanic',
      // International shopping brands
      'shein', 'h&m', 'zara', 'uniqlo',
      // Generic shopping
      'cosmetics', 'makeup', 'perfume', 'skincare', 'toiletries',
      'stationery', 'gifts', 'gift',
    ],
  },
  entertainment: {
    key: 'entertainment',
    label: 'Entertainment',
    emoji: '🎬',
    keywords: [
      'movie', 'movies', 'netflix', 'tickets', 'games', 'game', 'concert',
      'popcorn', 'spotify', 'hotstar', 'prime', 'youtube', 'subscription',
      'book', 'books', 'magazine', 'gaming', 'entertainment',
      // Streaming services
      'sonyliv', 'sony liv', 'zee5', 'jiocinema', 'jio cinema', 'mx player',
      'disney', 'apple music', 'gaana', 'wynk',
      // Venues / activities
      'theater', 'theatre', 'multiplex', 'bowling', 'paintball',
      'escape room',
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
      // Indian pharmacy / health platforms
      '1mg', 'pharmeasy', 'netmeds', 'apollo', 'practo', 'cult', 'cult.fit',
      'cure.fit', 'cultfit', 'curefit',
      // Specialists / diagnostics
      'physio', 'physiotherapy', 'dental', 'orthopedic', 'dermatologist',
      'optometry', 'optician', 'eye test', 'blood test', 'x-ray', 'xray',
      'mri', 'ct scan', 'ultrasound',
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
      // Indian telecom
      'jio', 'airtel', 'vi', 'vodafone', 'idea', 'bsnl', 'mtnl',
      // DTH / TV
      'tatasky', 'tata sky', 'dish tv', 'dishtv', 'sun direct', 'airtel dth',
      'dth',
      // Misc household
      'cylinder', 'lpg', 'ott',
    ],
  },
  education: {
    key: 'education',
    label: 'Education',
    emoji: '📚',
    keywords: [
      'tuition', 'course', 'courses', 'books', 'exam', 'exams', 'fees',
      'fee', 'coaching', 'class', 'classes', 'school', 'college',
      'university', 'udemy', 'coursera', 'education', 'study',
      // Indian edtech
      'byju', 'byjus', 'unacademy', 'vedantu', 'physics wallah', 'pw',
      // International edtech
      'khan academy', 'duolingo', 'skillshare', 'masterclass',
    ],
  },
  personal: {
    key: 'personal',
    label: 'Personal',
    emoji: '💈',
    keywords: [
      'haircut', 'salon', 'spa', 'grooming', 'laundry', 'dry clean',
      'dryclean', 'personal', 'parlour', 'parlor',
      'barber', 'manicure', 'pedicure', 'threading', 'waxing', 'facial',
      'massage',
    ],
  },
  repairs: {
    key: 'repairs',
    label: 'Repairs',
    emoji: '🔧',
    keywords: [
      'repair', 'repairs', 'servicing', 'fix', 'fixed',
      'plumber', 'plumbing', 'electrician', 'mechanic',
      'garage', 'puncture', 'tyre', 'tire',
      // Multi-word phrases (greedy matching prefers these when present)
      'ac service', 'ro service', 'car service', 'bike service',
      'car repair', 'bike repair', 'phone repair', 'laptop repair',
      'geyser repair', 'appliance repair',
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
 * Pre-built reverse lookup: keyword → category key.
 * Multi-word keywords are stored as-is and matched via substring scan.
 * @type {Map<string, string>}
 */
const singleWordMap = new Map();
const multiWordEntries = [];

for (const [catKey, def] of Object.entries(CATEGORIES)) {
  for (const kw of def.keywords) {
    if (kw.includes(' ')) {
      multiWordEntries.push({ phrase: kw, category: catKey });
    } else {
      singleWordMap.set(kw, catKey);
    }
  }
}

// Sort multi-word entries by length (longest first) for greedy matching
multiWordEntries.sort((a, b) => b.phrase.length - a.phrase.length);

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

  // 2. Tokenize and check single words
  const words = lower.split(/\s+/);
  for (const word of words) {
    // Strip surrounding punctuation
    const cleaned = word.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '');
    if (cleaned && singleWordMap.has(cleaned)) {
      return singleWordMap.get(cleaned);
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
