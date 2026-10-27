'use strict';
/*
 * Pure financial rules. Input is the transaction list; no storage, UI or mutable
 * application state is accessed here. This isolates business calculations.
 * Compatibility functions below retain the v2.6 API for existing screens.
 */
const FinanceRules = Object.freeze({
  installments(t) {
    const count = Math.max(1, Number(t.installments) || 1);
    const out = [];
    const cents = Math.round(+t.amount * 100);
    const base = Math.floor(cents / count);
    const remainder = cents - base * count;
    const first = monthKey(t.firstDue || t.paymentDate || t.purchaseDate);
    for (let i = 0; i < count; i++) {
      const mo = addMonths(first, i);
      out.push({
        due: dateInMonth(mo, t.dueDay || Number((t.firstDue || t.paymentDate || t.purchaseDate).slice(-2))),
        amount: (base + (i < remainder ? 1 : 0)) / 100,
        num: i + 1
      });
    }
    return out;
  },
  expenses(transactions, m, basis = 'cash') {
    return transactions.filter(t => t.type === 'expense').flatMap(t => {
      if (t.cardId) {
        if (basis === 'competence') {
          return monthKey(t.purchaseDate) === m ? [{ ...t, amount: +t.amount, when: t.purchaseDate }] : [];
        }
        return FinanceRules.installments(t)
          .filter(x => monthKey(x.due) === m)
          .map(x => ({ ...t, amount: x.amount, when: x.due }));
      }
      if (t.recurring) {
        const first = monthKey(t.purchaseDate);
        if (m < first) return [];
        if (t.recurringEnd && m > monthKey(t.recurringEnd)) return [];
        return [{ ...t, amount: +t.amount, when: dateInMonth(m, t.day || Number(t.paymentDate.slice(-2))) }];
      }
      return [t].filter(x => monthKey(basis === 'cash' ? x.paymentDate : x.purchaseDate) === m);
    });
  },
  income(transactions, m) {
    return transactions.filter(t => t.type === 'income').filter(t =>
      t.recurring
        ? (m >= monthKey(t.paymentDate) && (!t.recurringEnd || m <= monthKey(t.recurringEnd)))
        : monthKey(t.paymentDate) === m
    );
  },
  investments(transactions, m) {
    return transactions.filter(t => t.type === 'investment' && monthKey(t.paymentDate) === m);
  },
  summary(transactions, m) {
    const ins = FinanceRules.income(transactions, m).reduce((a, t) => a + +t.amount, 0);
    const expenses = FinanceRules.expenses(transactions, m).reduce((a, t) => a + +t.amount, 0);
    const invest = FinanceRules.investments(transactions, m).reduce((a, t) => a + (t.operation === 'resgate' ? -1 : 1) * +t.amount, 0);
    return { ins, expenses, invest, left: ins - expenses - invest };
  }
});
function inMonth(d, m) { return monthKey(d) === m; }
function installments(t) { return FinanceRules.installments(t); }
function txExpenses(m, basis = 'cash') { return FinanceRules.expenses(state.transactions, m, basis); }
function txIncome(m) { return FinanceRules.income(state.transactions, m); }
function txInvest(m) { return FinanceRules.investments(state.transactions, m); }
function sums(m) { return FinanceRules.summary(state.transactions, m); }
