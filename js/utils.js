// utils.js — utility functions
let UID_COUNTER = 1;

// Utility functions
export function uid(prefix = 'id') {
  return prefix + Math.random().toString(36).substr(2, 9);
}

export function slugify(str) {
  return (str || '').toString().toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\w\-]+/g, '')
    .replace(/\_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function sample(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function isShake(food) {
  return food.tags.includes('shake') || food.tags.includes('creami');
}
