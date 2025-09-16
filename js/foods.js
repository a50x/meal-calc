// foods.js — loading and portioning

let FOODS = [];
let UID_COUNTER = 1;
function uid(prefix) { return prefix + (UID_COUNTER++); }
function slugify(str) { return str.toLowerCase().replace(/[^a-z0-9]+/g, '-'); }
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function sample(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function isShake(food) { return food.tags && food.tags.includes('shake'); }

// Load foods.json
async function loadFoods() {
  const res = await fetch('foods.json');
  const data = await res.json();
  const seen = new Set();

  FOODS = data.map(raw => {
    const id = slugify(raw.name);
    if (seen.has(id)) return null;
    seen.add(id);
    const entry = {
      id, name: raw.name, tags: raw.tags || [],
      kcal: raw.kcal, p: raw.p, c: raw.c, f: raw.f,
      portionable: raw.portionable || false,
      min: raw.min || 1, max: raw.max || 1, unit: raw.unit || ''
    };
    return entry;
  }).filter(Boolean);
}

// Pick a portion of a food
function pickPortion(food) {
  let qty = food.portionable ? rand(food.min, food.max) : 1;
  return {
    ...food, qty,
    kcal: food.kcal * qty, p: food.p * qty, c: food.c * qty, f: food.f * qty,
    _uid: uid('i')
  };
}
