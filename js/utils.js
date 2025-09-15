// utils.js — utility functions

// Unique ID generator
export function uid(prefix = 'id') {
  return prefix + Math.random().toString(36).substr(2, 9);
}

// Convert string to URL/ID-safe slug
export function slugify(str) {
  return (str || '').toString().toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\w\-]+/g, '')
    .replace(/\_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// Random integer between min and max (inclusive)
export function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Random element from array
export function sample(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Detect if food is shake/creami
export function isShake(food) {
  return food.tags.includes('shake') || food.tags.includes('creami');
}
