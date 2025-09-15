// planner.js — meal planning logic
import { pickPortion } from './meals.js';

export class Planner {
  constructor(dailyTargets, foods = [], maxShakes = 2, maxRepeats = 1) {
    this.foods = Array.isArray(foods) ? foods : []; // ensure array
    this.dailyTargets = dailyTargets;
    this.maxShakes = maxShakes;
    this.maxRepeats = maxRepeats;
    this.meals = { breakfast: [], lunch: [], dinner: [], snack: [] };
    this.locks = { foods: new Set(), meals: new Set() };
  }

  generateMeals(mealCount = 4) {
    const order = this.buildMealOrder(mealCount);
    this.meals = { breakfast: [], lunch: [], dinner: [], snack: [] };

    order.forEach(mealType => {
      this.meals[mealType] = this.generateMeal(mealType);
    });

    return this.meals;
  }

  buildMealOrder(totalMeals) {
    const arr = ['breakfast', 'lunch', 'dinner', 'snack'];
    return [...Array(totalMeals).keys()].map(i => arr[i % arr.length]);
  }

  generateMeal(mealType) {
    if (!Array.isArray(this.foods)) return [];
    const available = this.foods.filter(
      f => f.tags.includes(mealType) || f.tags.length === 0
    );

    const picks = [];
    for (let i = 0; i < 3 && available.length; i++) {
      let food = available[Math.floor(Math.random() * available.length)];
      if (this.locks.foods.has(food.name)) continue;
      picks.push(pickPortion(food));
    }

    return picks;
  }

  toggleFoodLock(foodName) {
    if (this.locks.foods.has(foodName)) this.locks.foods.delete(foodName);
    else this.locks.foods.add(foodName);
  }

  toggleMealLock(mealType) {
    if (this.locks.meals.has(mealType)) this.locks.meals.delete(mealType);
    else this.locks.meals.add(mealType);
  }

  exportCSV() {
    let csv = "Meal,Food,Qty,Calories,Protein,Carbs,Fat\n";
    for (const [meal, foods] of Object.entries(this.meals)) {
      for (const f of foods) {
        csv += `${meal},${f.name},${f.qty},${f.kcal},${f.p},${f.c},${f.f}\n`;
      }
    }
    return csv;
  }
}

// Helper for main.js
export function tryBuildDay(mealCount, targets, foods, maxShakes = 2, maxRepeats = 1) {
  const planner = new Planner(targets, foods, maxShakes, maxRepeats);
  return planner.generateMeals(mealCount);
}
