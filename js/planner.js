import { rand, sample } from './utils.js';

export class Planner {
  constructor(foods, dailyTargets) {
    this.foods = foods;
    this.dailyTargets = dailyTargets;
    this.meals = { breakfast: [], lunch: [], dinner: [], snack: [] };
    this.locks = { foods: new Set(), meals: new Set() };
  }

  generateMeals() {
    for (const meal in this.meals) {
      if (!this.locks.meals.has(meal)) {
        this.meals[meal] = this.generateMeal(meal);
      }
    }
  }

  generateMeal(mealType) {
    const available = this.foods.filter(f => f.tags.includes(mealType));
    const picks = [];
    if (!available.length) return picks;

    for (let i = 0; i < 3; i++) {
      const food = sample(available);
      if (this.locks.foods.has(food.name)) continue;
      const portion = this.scalePortion(food);
      picks.push({ ...food, qty: portion });
    }
    return picks;
  }

  scalePortion(food) {
    if (food.portionable) {
      const amount = rand(food.min, food.max);
      return `${amount} ${food.unit}`;
    }
    return food.unit || "1 serving";
  }

  toggleFoodLock(name) {
    this.locks.foods.has(name) ? this.locks.foods.delete(name) : this.locks.foods.add(name);
  }

  toggleMealLock(meal) {
    this.locks.meals.has(meal) ? this.locks.meals.delete(meal) : this.locks.meals.add(meal);
  }

  exportCSV() {
    let csv = "Meal,Food,Qty,Calories,Protein,Carbs,Fat\n";
    for (const [meal, foods] of Object.entries(this.meals)) {
      foods.forEach(f => {
        csv += `${meal},${f.name},${f.qty},${f.kcal},${f.p},${f.c},${f.f}\n`;
      });
    }
    return csv;
  }
}

export function tryBuildDay(mealCount = 4, targets = {}, maxShakes = 2, maxRepeats = 2) {
  if (!window.FOODS || !FOODS.length) return null;
  const planner = new Planner(window.FOODS, targets);
  planner.generateMeals();
  return planner;
}
