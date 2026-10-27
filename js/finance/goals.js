'use strict';
// Budget goals: per-month override and backwards-compatible single-value fallback.
function goalTarget(g,m){const override=g.monthly&&Object.prototype.hasOwnProperty.call(g.monthly,m)?Number(g.monthly[m]):Number(g.amount);return Number.isFinite(override)&&override>=0?override:0}
function goalTargetPeriod(g,months){return months.reduce((total,m)=>total+goalTarget(g,m),0)}
