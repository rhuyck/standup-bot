// ============================================================
// Kendra – Book Catalog Configuration
// Edit this file to update family members, genres, conditions
// ============================================================

// Each person gets a lot of 1000 IDs.
// lotStart is inclusive, lotEnd is inclusive.
// Add or rename people here — names must be unique.
const PEOPLE = [
  { name: "Jim",     lotStart: 1,    lotEnd: 999  },
  { name: "Zara",    lotStart: 1000, lotEnd: 1999 },
  { name: "Rhianna", lotStart: 2000, lotEnd: 2999 },
  { name: "Patrick", lotStart: 3000, lotEnd: 3999 },
  { name: "Randy",   lotStart: 4000, lotEnd: 4999 },
  { name: "Jan",     lotStart: 5000, lotEnd: 5999 },
];

const GENRES = [
  "Art & Photography",
  "Biography & Memoir",
  "Children's",
  "Classic Literature",
  "Cookbooks & Food",
  "Fiction",
  "History",
  "Horror",
  "Humor",
  "Mystery & Thriller",
  "Non-Fiction",
  "Philosophy",
  "Poetry & Drama",
  "Reference",
  "Religion & Spirituality",
  "Romance",
  "Science & Nature",
  "Science Fiction & Fantasy",
  "Self-Help",
  "Travel",
  "Other",
];

// Short label – long description format (the short label is used in CSV exports)
const CONDITIONS = [
  "Poor – Heavy damage, may be incomplete",
  "Fair – Significant wear, fully readable",
  "Good – Some wear, fully intact",
  "Very Good – Minor wear, near complete",
  "Excellent – Like new or near perfect",
];
