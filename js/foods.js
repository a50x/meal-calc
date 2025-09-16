// ------------------------------
// Core Data + State
// ------------------------------
window.FOODS = [];
window.UID_COUNTER = 0;
window.LOCKS = { foods: {}, meals: {} };

// ------------------------------
// Utility Functions
// ------------------------------
function uid(prefix) {
  window.UID_COUNTER++;
  return prefix + window.UID_COUNTER;
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sample(arr) {
  return arr[rand(0, arr.length - 1)];
}

function isShake(food) {
  return food.tags && food.tags.includes("shake");
}

// ------------------------------
// Load Foods
// ------------------------------
async function loadFoods() {
  const res = await fetch("foods.json");
  const rawFoods = await res.json();

  const seen = new Set();
  window.FOODS = rawFoods
    .map((f) => {
      const id = slugify(f.name);
      if (seen.has(id)) return null;
      seen.add(id);
      return {
        id,
        name: f.name,
        kcal: f.kcal,
        p: f.p,
        c: f.c,
        f: f.f,
        tags: f.tags || [],
        portionable: f.portionable || false,
        min: f.min || 1,
        max: f.max || 1,
        unit: f.unit || "",
      };
    })
    .filter(Boolean);
}
