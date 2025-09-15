let UID_COUNTER = 1;

export function uid(prefix = '') { return `${prefix || 'u'}${UID_COUNTER++}`; }
export function slugify(str) {
  return (str || '').toString().toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\w\-]+/g, '')
    .replace(/\_+/g, '_')
    .replace(/^_+|_+$/g, '');
}
export function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
export function sample(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
export function isShake(food) { return Array.isArray(food.tags) && food.tags.includes('shake'); }
