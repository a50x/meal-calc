let FOODS = [];

// ===========================
// Load foods.json dynamically
// ===========================
async function loadFoods() {
  try {
    const res = await fetch('foods.json');
    FOODS = await res.json();
    console.log("Loaded foods:", FOODS.length);
    generate(); // auto-generate once loaded
  } catch (err) {
    console.error('Failed to load foods.json', err);
    document.getElementById('result').innerHTML =
      "<div class='card'><strong>Error loading foods.json</strong><br>" + err + "</div>";
  }
}

// ===========================
// Helpers
// ===========================
function clone(obj){ return JSON.parse(JSON.stringify(obj)); }
function rand(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }
function sample(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

function pickPortion(food){
  if(!food.portionable) return {...food, qty:1};
  const qty = rand(food.min, food.max);
  return {
    ...food,
    qty,
    kcal: food.kcal*qty,
    p: food.p*qty,
    c: food.c*qty,
    f: food.f*qty,
    name:`${food.name} x${qty} ${food.unit}${qty>1?'s':''}`
  };
}

function getTargetsFromUI(){
  const calT = Number(document.getElementById('calTarget').value);
  const calR = Number(document.getElementById('calRange').value);
  const pT = Number(document.getElementById('pTarget').value);
  const pR = Number(document.getElementById('pRange').value);
  const cT = Number(document.getElementById('cTarget').value);
  const cR = Number(document.getElementById('cRange').value);
  const fT = Number(document.getElementById('fTarget').value);
  const fR = Number(document.getElementById('fRange').value);

  return {
    calMin: Math.max(0, calT - calR),
    calMax: calT + calR,
    pMin: Math.max(0, pT - pR),
    pMax: pT + pR,
    cMin: Math.max(0, cT - cR),
    cMax: cT + cR,
    fMin: Math.max(0, fT - fR),
    fMax: fT + fR
  };
}

function isShake(item){ return item.tags && item.tags.includes('shake'); }

function scoreCandidate(totals, targets){
  const pMid = (targets.pMin + targets.pMax)/2;
  const cMid = (targets.cMin + targets.cMax)/2;
  const fMid = (targets.fMin + targets.fMax)/2;
  const calMid = (targets.calMin + targets.calMax)/2;
  return Math.abs(totals.p - pMid)*4 +
         Math.abs(totals.c - cMid)*2 +
         Math.abs(totals.f - fMid)*1 +
         Math.abs(totals.cal - calMid)*0.2;
}

// ===========================
// Day generation logic
// ===========================
function buildCandidate(mealCount){
  const maxShakes = Number(document.getElementById('maxShakes').value);
  const maxRepeats = Number(document.getElementById('maxRepeats').value);

  let meals = [], totals = {cal:0,p:0,c:0,f:0}, shakesUsed = 0, foodCounts={};

  for(let m=0;m<mealCount;m++){
    let mealItems=[];
    let itemCount = rand(1,3);
    let attempts = 0;
    while(mealItems.length<itemCount && attempts<40){
      attempts++;
      const candidate = pickPortion(sample(FOODS));
      if(!candidate) continue;

      if(isShake(candidate) && shakesUsed+1>maxShakes) continue;
      if((foodCounts[candidate.id]||0)+1>maxRepeats) continue;

      mealItems.push(candidate);
      totals.cal += candidate.kcal;
      totals.p += candidate.p;
      totals.c += candidate.c;
      totals.f += candidate.f;
      if(isShake(candidate)) shakesUsed++;
      foodCounts[candidate.id]=(foodCounts[candidate.id]||0)+1;
    }
    if(mealItems.length===0) return null;
    meals.push({items:mealItems});
  }
  return {meals, totals, shakesUsed};
}

function findBestForMealCount(mealCount, params){
  let best=null;
  for(let i=0;i<2200;i++){
    const cand=buildCandidate(mealCount);
    if(!cand) continue;
    if(cand.totals.cal>params.calMax) continue;
    const score = scoreCandidate(cand.totals, params);
    if(!best || score<best.score){ cand.score=score; best=cand; }
    if(cand.totals.p>=params.pMin && cand.totals.p<=params.pMax &&
       cand.totals.c>=params.cMin && cand.totals.c<=params.cMax &&
       cand.totals.f>=params.fMin && cand.totals.f<=params.fMax &&
       cand.totals.cal>=params.calMin && cand.totals.cal<=params.calMax) return cand;
  }
  return best;
}

function generate(){
  if(!FOODS.length){
    document.getElementById('result').innerHTML =
      "<div class='card'><strong>Foods not loaded yet.</strong></div>";
    return;
  }

  const targets=getTargetsFromUI();
  const mealCountChoice=document.getElementById('mealCount').value;
  const params={...targets};

  let candidates=[];
  if(mealCountChoice==='optimal'){
    for(let m=3;m<=5;m++){
      const cand=findBestForMealCount(m, params);
      if(cand) candidates.push(Object.assign({mealCount:m},cand));
    }
    if(candidates.length===0){
      document.getElementById('result').innerHTML=
        `<div class="card"><strong>No plan found.</strong></div>`;
      return;
    }
    candidates.sort((a,b)=>a.score-b.score);
    var best=candidates[0];
  } else {
    const m=Number(mealCountChoice);
    const cand=findBestForMealCount(m, params);
    if(!cand){
      document.getElementById('result').innerHTML=
        `<div class="card"><strong>No plan found for ${m} meals.</strong></div>`;
      return;
    }
    var best=Object.assign({mealCount:m}, cand);
  }

  renderResult(best, params);
}

// ===========================
// Rendering + CSV export
// ===========================
function renderResult(plan, params){
  const out=document.getElementById('result');
  let html=`<div class="card"><h3>Generated Day — ${plan.mealCount} meals</h3>`;
  let grand={cal:0,p:0,c:0,f:0};
  plan.meals.forEach((meal,idx)=>{
    let mcal=0, mp=0, mc=0, mf=0;
    html+=`<h4>Meal ${idx+1}</h4><table><thead><tr><th>Food</th><th>kcal</th><th>P</th><th>C</th><th>F</th></tr></thead><tbody>`;
    meal.items.forEach(it=>{
      html+=`<tr><td>${it.name}</td><td>${it.kcal.toFixed(0)}</td><td>${it.p.toFixed(1)}</td><td>${it.c.toFixed(1)}</td><td>${it.f.toFixed(1)}</td></tr>`;
      mcal+=it.kcal; mp+=it.p; mc+=it.c; mf+=it.f;
    });
    html+=`<tr style="font-weight:700"><td>Meal subtotal</td><td>${mcal.toFixed(0)}</td><td>${mp.toFixed(1)}</td><td>${mc.toFixed(1)}</td><td>${mf.toFixed(1)}</td></tr>`;
    html+=`</tbody></table>`;
    grand.cal+=mcal; grand.p+=mp; grand.c+=mc; grand.f+=mf;
  });

  html+=`<div style="margin-top:10px"><span class="pill">Calories: <strong>${grand.cal.toFixed(0)}</strong></span>
         <span class="pill">Protein: <strong>${grand.p.toFixed(1)} g</strong></span>
         <span class="pill">Carbs: <strong>${grand.c.toFixed(1)} g</strong></span>
         <span class="pill">Fat: <strong>${grand.f.toFixed(1)} g</strong></span></div>`;

  const okP=(grand.p>=params.pMin&&grand.p<=params.pMax);
  const okC=(grand.c>=params.cMin&&grand.c<=params.cMax);
  const okF=(grand.f>=params.fMin&&grand.f<=params.fMax);
  const okCal=(grand.cal>=params.calMin&&grand.cal<=params.calMax);

  html+=`<div class="card"><h4>Target check</h4>
        <p>Protein: ${params.pMin}–${params.pMax} → ${okP?'<span class="ok">OK</span>':'<span class="warn">OUT</span>'}</p>
        <p>Carbs: ${params.cMin}–${params.cMax} → ${okC?'<span class="ok">OK</span>':'<span class="warn">OUT</span>'}</p>
        <p>Fat: ${params.fMin}–${params.fMax} → ${okF?'<span class="ok">OK</span>':'<span class="warn">OUT</span>'}</p>
        <p>Calories: ${params.calMin}–${params.calMax} → ${okCal?'<span class="ok">OK</span>':'<span class="warn">OUT</span>'}</p>
       </div>`;
  html+=`<div class="small muted">Supplements suggested: Emerald Labs Men's 1-Daily Multi (breakfast); NOW Super Omega 3-6-9 (lunch/dinner); Magnesium Glycinate (evening); optional Creatine with a shake.</div>`;
  html+=`</div>`;
  out.innerHTML=html;

  window._lastPlan={plan,totals:grand};
}

function exportCSV(){
  if(!window._lastPlan){ alert('Generate a plan first'); return; }
  const rows=[['Meal','Food','Qty','Calories','Protein(g)','Carbs(g)','Fat(g)']];
  window._lastPlan.plan.meals.forEach((meal,mi)=>{
    meal.items.forEach(it=>{
      rows.push([`Meal ${mi+1}`, it.name, it.qty||1, it.kcal.toFixed(0), it.p.toFixed(1), it.c.toFixed(1), it.f.toFixed(1)]);
    });
  });
  rows.push(['TOTAL','', '', window._lastPlan.totals.cal.toFixed(0), window._lastPlan.totals.p.toFixed(1), window._lastPlan.totals.c.toFixed(1), window._lastPlan.totals.f.toFixed(1)]);
  const csv=rows.map(r=>r.map(c=>`"${c}"`).join(',')).join('\n');
  const blob=new Blob([csv], {type:'text/csv'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download='mealplan.csv'; a.click();
  URL.revokeObjectURL(url);
}
