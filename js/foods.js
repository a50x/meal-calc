// foods.js — handles foods data & utilities

// --- Utilities ---
function uid() {
  return Math.random().toString(36).substring(2, 9);
}
function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// --- Food loading ---
async function loadFoods() {
  const res = await fetch("foods.json");
  const foods = await res.json();

  // Normalize foods
  return foods.map(f => ({
    ...f,
    id: f.id || uid(),
    slug: slugify(f.name),
  }));
}

// --- Portion picker ---
function pickPortion(food) {
  if (!food.portionable) return { qty: 1, unit: food.unit || "" };

  const min = food.min ?? 1;
  const max = food.max ?? 1;
  const qty = Math.floor(Math.random() * (max - min + 1)) + min;
  return { qty, unit: food.unit || "" };
}

export { uid, slugify, rand, clamp, loadFoods, pickPortion };
