// Wallet — store.js
// Balances, transactions, deposits (STK push) and withdrawals.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const uuid = () => crypto.randomUUID();

class WalletStore {
  constructor(dir = path.join(__dirname, '..', '..', 'data')) {
    this.file = path.join(dir, 'wallet.json');
    this.data = { accounts: [], transactions: [], deposits: [], withdrawals: [] };
    this.load();
  }
  load(){ try { if (fs.existsSync(this.file)) this.data = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch (_) {} }
  persist(){ try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file, JSON.stringify(this.data)); } catch (_) {} }

  account(userId){
    let a = this.data.accounts.find(x => x.userId === userId);
    if (!a){ a = { userId, balance: 0, bonusBalance: 0, createdAt: Date.now() }; this.data.accounts.push(a); this.persist(); }
    return a;
  }
  addTransaction({ userId, type, amount, status, reference, description }) {
    const t = { id: uuid(), userId, type, amount, status, reference: reference || 'REF-' + crypto.randomBytes(4).toString('hex').toUpperCase(), description: description || type, createdAt: Date.now() };
    this.data.transactions.push(t);
    if (this.data.transactions.length > 2000) this.data.transactions = this.data.transactions.slice(-2000);
    this.persist();
    return t;
  }
  credit(userId, amount, type, reference, description){
    const a = this.account(userId);
    a.balance += amount;
    this.addTransaction({ userId, type, amount, status: 'COMPLETED', reference, description });
    this.persist();
    return a.balance;
  }
  debit(userId, amount, type, reference, description){
    const a = this.account(userId);
    if (a.balance < amount) return null;
    a.balance -= amount;
    this.addTransaction({ userId, type, amount: -amount, status: 'COMPLETED', reference, description });
    this.persist();
    return a.balance;
  }
  addDeposit({ userId, amount, mpesaPhone }){
    const d = { id: uuid(), userId, amount, mpesaPhone, status: 'PENDING', reference: 'MPE' + crypto.randomBytes(4).toString('hex').toUpperCase(), createdAt: Date.now() };
    this.data.deposits.push(d);
    this.persist();
    return d;
  }
  confirmDeposit(id){
    const d = this.data.deposits.find(x => x.id === id);
    if (d && d.status === 'PENDING'){ d.status = 'COMPLETED'; d.confirmedAt = Date.now(); this.persist(); }
    return d;
  }
  addWithdrawal({ userId, amount, mpesaPhone, challengeId }){
    const w = { id: uuid(), userId, amount, mpesaPhone, challengeId, status: 'AWAITING_OTP', risk: 'low', createdAt: Date.now() };
    this.data.withdrawals.push(w);
    this.persist();
    return w;
  }
  completeWithdrawal(id, status){
    const w = this.data.withdrawals.find(x => x.id === id);
    if (w && w.status === 'AWAITING_OTP'){ w.status = status; w.completedAt = Date.now(); this.persist(); }
    return w;
  }
  pendingWithdrawals(userId){
    return this.data.withdrawals.filter(w => w.userId === userId && ['AWAITING_OTP', 'IN_REVIEW'].includes(w.status)).reduce((s, w) => s + w.amount, 0);
  }
}

module.exports = { WalletStore, uuid };
