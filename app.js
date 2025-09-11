// app.js — Safe Foods Meal Generator (fixed per-meal + tag-aware + even distribution)

let FOODS = []; // normalized food list (objects with id,name,kcal,p,c,f,tags,portionable,min,max,unit)

// ---------------------------
// Render + CSV export
function renderResult(plan, params) {
  const out = document.getElementById('result');
  let html = `<div class="card"><h3>Generated Day — ${plan.mealCount} meals</h3>`;
  let grand = { cal: 0, p: 0, c: 0, f: 0 };

  plan.meals.forEach((meal, idx) => {
    let mcal = 0, mp = 0, mc = 0, mf = 0;
    html += `<h4>Meal ${idx + 1}</h4><table><thead><tr><th>Food</th><th>kcal</th><th>P</th><th>C</th><th>F</th></tr></thead><tbody>`;
    meal.items.forEach(it => {
      const label = it.label || it.name;
      html += `<tr><td>${label}</td><td>${(it.kcal || 0).toFixed(0)}</td><td>${(it.p || 0).toFixed(1)}</td><td>${(it.c || 0).toFixed(1)}</td><td>${(it.f || 0).toFixed(1)}</td></tr>`;
      mcal += it.kcal || 0; mp += it.p || 0; mc += it.c || 0; mf += it.f || 0;
    });
    html += `<tr style="font-weight:700"><td>Meal subtotal</td><td>${mcal.toFixed(0)}</td><td>${mp.toFixed(1)}</td><td>${mc.toFixed(1)}</td><td>${mf.toFixed(1)}</td></tr>`;
    html += `</tbody></table>`;
    grand.cal += mcal; grand.p += mp; grand.c += mc; grand.f += mf;
  });

  html += `<div style="margin-top:10px">
             <span class="pill">Calories: <strong>${grand.cal.toFixed(0)}</strong></span>
             <span class="pill">Protein: <strong>${grand.p.toFixed(1)} g</strong></span>
             <span class="pill">Carbs: <strong>${grand.c.toFixed(1)} g</strong></span>
             <span class="pill">Fat: <strong>${grand.f.toFixed(1)} g</strong></span>
           </div>`;
  out.innerHTML = html;
  window._lastPlan = { plan, totals: grand };
}

function exportCSV() {
  if (!window._lastPlan) {
    alert('Generate a plan first');
    return;
  }

  const rows = [['Meal','Food','Qty','Calories','Protein(g)','Carbs(g)','Fat(g)']];
  window._lastPlan.plan.meals.forEach((meal, mi) => {
    meal.items.forEach(it => {
      rows.push([
        `Meal ${mi+1}`,
        it.label || it.name,
        it.qty || 1,
        (it.kcal || 0).toFixed(0),
        (it.p || 0).toFixed(1),
        (it.c || 0).toFixed(1),
        (it.f || 0).toFixed(1)
      ]);
    });
  });
  rows.push(['TOTAL','','',
             window._lastPlan.totals.cal.toFixed(0),
             window._lastPlan.totals.p.toFixed(1),
             window._lastPlan.totals.c.toFixed(1),
             window._lastPlan.totals.f.toFixed(1)]);

  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mealplan.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------
// Utilities
function slugify(str) {
  return (str || '').toString().toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\w\-]+/g, '')
    .replace(/\_+/g, '_')
    .replace(/^_+|_+$/g, '');
}
function rand(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }
function sample(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function sumBy(arr,key){ return arr.reduce((s,i)=>s+(i[key]||0),0); }
function isShake(food){ return Array.isArray(food.tags)&&food.tags.includes('shake'); }

// ---------------------------
// Load + normalize foods.json
async function loadFoods() {
  try {
    const res = await fetch('foods.json');
    const raw = await res.json();
    const list = [];

    function normalizeEntry(entry){
      const name = entry.name || entry.id || (entry.label||'').toString();
      const id = entry.id || slugify(name);
      const kcal = Number(entry.kcal ?? entry.cal ?? entry.energy ?? 0);
      const p = Number(entry.p ?? entry.protein ?? 0);
      const c = Number(entry.c ?? entry.carbs ?? entry.carbohydrates ?? 0);
      const f = Number(entry.f ?? entry.fat ?? 0);
      const tags = Array.isArray(entry.tags)?entry.tags.slice():[];
      const portionable = entry.portionable===true || (entry.min!==undefined && entry.max!==undefined);
      const min = portionable?Math.max(1,Number(entry.min??1)):1;
      const max = portionable?Math.max(min,Number(entry.max??min)):1;
      const unit = entry.unit||'';
      return { id,name,kcal,p,c,f,tags,portionable,min,max,unit };
    }

    if(Array.isArray(raw)) for(const it of raw) list.push(normalizeEntry(it));
    else if(raw&&typeof raw==='object'){
      for(const key of Object.keys(raw)){
        const val = raw[key];
        if(Array.isArray(val)) for(const it of val) list.push(normalizeEntry(it));
        else if(val&&typeof val==='object'){
          const valuesAreFoodObjects = Object.values(val).some(v=>typeof v==='object'&&(v.cal!==undefined||v.kcal!==undefined||v.p!==undefined));
          if(valuesAreFoodObjects){
            for(const [name,metrics] of Object.entries(val)){
              const entry = Object.assign({},metrics);
              if(!entry.name) entry.name=name;
              list.push(normalizeEntry(entry));
            }
          } else list.push(normalizeEntry(Object.assign({name:key},val)));
        }
      }
    }

    if(!list.length) throw new Error('No foods found in foods.json');

    const seen = new Set();
    FOODS=[];
    for(const item of list){
      if(!item.id) item.id=slugify(item.name);
      if(seen.has(item.id)) continue;
      seen.add(item.id);
      FOODS.push(item);
    }
    FOODS = FOODS.map(f=>({...f,tags:f.tags||[]}));
    document.getElementById('result').innerHTML=`<div class="card info"><strong>Foods loaded.</strong> You can now generate a plan.</div>`;
  } catch(err){
    console.error('Failed loading foods.json',err);
    document.getElementById('result').innerHTML=`<div class="card warn"><strong>Error loading foods.json</strong><br>${String(err)}</div>`;
  }
}

// ---------------------------
// Portioning
function pickPortion(food){
  if(!food.portionable) return {...food, qty:1,label:food.name};
  const qty = rand(food.min,food.max);
  return {
    ...food,
    qty,
    kcal: food.kcal*qty,
    p: food.p*qty,
    c: food.c*qty,
    f: food.f*qty,
    label:`${food.name} x${qty}${food.unit?' '+food.unit+(qty>1?'s':''):''}`
  };
}

// ---------------------------
// Meal tag ordering
function foodsForMealIndex(mealIndex,totalMeals){
  const tagMap={
    3:['breakfast','lunch','dinner'],
    4:['breakfast','lunch','snack','dinner'],
    5:['breakfast','snack','lunch','snack','dinner']
  };
  return tagMap[totalMeals]?[tagMap[totalMeals][mealIndex]]:[];
}

// ---------------------------
// Build candidate per meal
function buildDailyCandidateFixed(targets, mealCount, maxShakes, maxRepeats){
  const meals = Array.from({length:mealCount},()=>({items:[]}));
  const foodCounts={};
  let shakesUsed=0;
  const totals={cal:0,p:0,c:0,f:0};

  const perMealTarget={
    cal:(targets.calMax+targets.calMin)/2/mealCount,
    p:(targets.pMax+targets.pMin)/2/mealCount,
    c:(targets.cMax+targets.cMin)/2/mealCount,
    f:(targets.fMax+targets.fMin)/2/mealCount
  };

  for(let m=0;m<mealCount;m++){
    const mealTags = foodsForMealIndex(m,mealCount);
    let attempts=0;
    while(attempts<2000){
      attempts++;
      const food=pickPortion(sample(FOODS));
      if(foodCounts[food.name]>=maxRepeats) continue;
      if(isShake(food)&&shakesUsed>=maxShakes) continue;

      const softMult=1.4;
      if(food.c>perMealTarget.c*softMult) continue;
      if(food.f>perMealTarget.f*softMult) continue;
      if(food.kcal>perMealTarget.cal*softMult) continue;

      if(mealTags.length&&!food.tags.some(t=>mealTags.includes(t))){
        if(Math.random()<0.5) continue;
      }

      meals[m].items.push(food);
      totals.cal+=food.kcal;
      totals.p+=food.p;
      totals.c+=food.c;
      totals.f+=food.f;

      foodCounts[food.name]=(foodCounts[food.name]||0)+1;
      if(isShake(food)) shakesUsed++;

      if(sumBy(meals[m].items,'cal')>=perMealTarget.cal &&
         sumBy(meals[m].items,'p')>=perMealTarget.p &&
         sumBy(meals[m].items,'c')>=perMealTarget.c &&
         sumBy(meals[m].items,'f')>=perMealTarget.f) break;
    }

    if(!meals[m].items.length){
      const fallback=pickPortion(sample(FOODS));
      meals[m].items.push(fallback);
      totals.cal+=fallback.kcal;
      totals.p+=fallback.p;
      totals.c+=fallback.c;
      totals.f+=fallback.f;
      foodCounts[fallback.name]=(foodCounts[fallback.name]||0)+1;
      if(isShake(fallback)) shakesUsed++;
    }
  }

  return {meals,totals};
}

// ---------------------------
// Generate day
function generate(){
  if(!FOODS.length){
    document.getElementById('result').innerHTML=`<div class="card warn"><strong>No foods loaded yet.</strong></div>`;
    return;
  }

  const targets={
    calMin: Math.max(0,Number(document.getElementById('calTarget').value||0)-Number(document.getElementById('calRange').value||0)),
    calMax: Number(document.getElementById('calTarget').value||0)+Number(document.getElementById('calRange').value||0),
    pMin: Math.max(0,Number(document.getElementById('pTarget').value||0)-Number(document.getElementById('pRange').value||0)),
    pMax: Number(document.getElementById('pTarget').value||0)+Number(document.getElementById('pRange').value||0),
    cMin: Math.max(0,Number(document.getElementById('cTarget').value||0)-Number(document.getElementById('cRange').value||0)),
    cMax: Number(document.getElementById('cTarget').value||0)+Number(document.getElementById('cRange').value||0),
    fMin: Math.max(0,Number(document.getElementById('fTarget').value||0)-Number(document.getElementById('fRange').value||0)),
    fMax: Number(document.getElementById('fTarget').value||0)+Number(document.getElementById('fRange').value||0)
  };

  const mealChoice = document.getElementById('mealCount').value;
  const MAX_TRIES = 6000;
  const maxShakes = Number(document.getElementById('maxShakes').value||0);
  const maxRepeats = Number(document.getElementById('maxRepeats').value||1);

  let mealCounts=[];
  if(mealChoice==='optimal') mealCounts=[3,4,5];
  else mealCounts=[Number(mealChoice)];

  let finalPlan=null;
  for(const m of mealCounts){
    for(let i=0;i<MAX_TRIES;i++){
      const daily=buildDailyCandidateFixed(targets,m,maxShakes,maxRepeats);
      if(!daily||!daily.meals.length) continue;
      finalPlan={meals:daily.meals,totals:daily.totals,mealCount:m};
      break;
    }
    if(finalPlan) break;
  }

  if(!finalPlan){
    document.getElementById('result').innerHTML=`<div class="card warn"><strong>Could not generate a plan within ${MAX_TRIES} tries.</strong></div>`;
    return;
  }

  renderResult(finalPlan,targets);
}

// ---------------------------
// Load foods on start
loadFoods();
