import { FOODS } from './foods.js';
import { uid, rand, sample, isShake } from './utils.js';

export function pickPortion(food) {
  if (!food) return null;
  const base = { ...food };
  let qty = base.portion_scalable ? rand(base.min || 1, base.max || 1) : 1;
  return {
    ...base,
    _uid: uid('i'),
    qty,
    kcal: Number(base.kcal || 0) * qty,
    p: Number(base.p || 0) * qty,
    c: Number(base.c || 0) * qty,
    f: Number(base.f || 0) * qty,
    label: base.portion_scalable
      ? `${base.name} x${qty}${base.unit ? ' ' + base.unit + (qty > 1 ? 's' : '') : ''}`
      : base.name
  };
}

export function buildMealOrder(totalMeals) {
  const base = ['breakfast', 'lunch', 'dinner'];
  let snacksToInsert = totalMeals === 4 ? rand(1, 2) : totalMeals === 5 ? rand(2, 3) : 0;
  let slots = [...base];
  let gaps = Array.from({ length: slots.length + 1 }, (_, i) => i);

  while (snacksToInsert > 0 && gaps.length > 0) {
    const g = sample(gaps);
    if ((g > 0 && slots[g - 1] === 'snack') || (g < slots.length && slots[g] === 'snack')) {
      gaps = gaps.filter(x => x !== g);
      continue;
    }
    slots.splice(g, 0, 'snack');
    snacksToInsert--;
    gaps = Array.from({ length: slots.length + 1 }, (_, i) => i);
  }

  return slots;
}

export function foodsForMealIndex(mealIndex, totalMeals) {
  if (!window._mealOrder || window._mealOrder.length !== totalMeals) {
    window._mealOrder = buildMealOrder(totalMeals);
  }
  return [window._mealOrder[mealIndex]];
}
