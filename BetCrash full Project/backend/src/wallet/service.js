// Wallet — service.js
// Deposits (STK push simulation), OTP-protected withdrawals (SMS-IVS), and
// bet/win ledger operations used by the game engine.

const crypto = require('crypto');
const { WalletStore } = require('./store');

const AUTO_APPROVE_LIMIT = 10000;
const MIN_DEPOSIT = 50;
const MIN_WITHDRAWAL = 100;
const maskPhone = (p) => {
  const local = '0' + String(p).replace(/^254/, '');
  return local.slice(0, 4) + '••••' + local.slice(-2);
};

class WalletService {
  constructor(auth) {
    this.store = new WalletStore();
    this.auth = auth; // for OTP challenges on withdrawals
  }

  balance(userId, user) {
    const a = this.store.account(userId);
    return {
      ok: true,
      balance: a.balance,
      bonusBalance: a.bonusBalance,
      pendingWithdrawals: this.store.pendingWithdrawals(userId),
      kycVerified: user ? !!user.kycVerified : false,
    };
  }

  transactions(userId, limit = 30) {
    const list = this.store.data.transactions.filter(t => t.userId === userId).reverse().slice(0, limit);
    return { ok: true, transactions: list };
  }

  // POST /wallet/deposit — simulate STK push: pending → confirmed ~3s later
  deposit(userId, { amount, mpesaPhone }) {
    const amt = Math.round(Number(amount));
    if (isNaN(amt) || amt < MIN_DEPOSIT) return { ok: false, status: 400, error: 'Minimum deposit is KES 50' };
    if (!mpesaPhone) return { ok: false, status: 400, error: 'M-Pesa number required' };
    const d = this.store.addDeposit({ userId, amount: amt, mpesaPhone });
    // Demo: the Daraja callback would confirm; here we confirm after 3s.
    setTimeout(() => {
      const dep = this.store.confirmDeposit(d.id);
      if (dep) this.store.credit(userId, amt, 'DEPOSIT', dep.reference, 'M-Pesa deposit');
    }, 3000);
    return { ok: true, status: 'pending', reference: d.reference, amount: amt };
  }

  // POST /wallet/withdraw — step 1: check + SMS challenge
  async withdraw(userId, { amount, mpesaPhone }) {
    const amt = Math.round(Number(amount));
    const a = this.store.account(userId);
    if (isNaN(amt) || amt < MIN_WITHDRAWAL) return { ok: false, status: 400, error: 'Minimum withdrawal is KES 100' };
    if (amt > a.balance) return { ok: false, status: 400, error: 'Exceeds available balance' };
    const { challenge, code } = this.auth.store.createChallenge(userId, 'withdraw');
    const user = this.auth.store.findById(userId);
    const sent = await this.auth.sms.deliverCode(user.phone, code, 'withdraw');
    if (!sent.ok) return { ok: false, status: 502, error: 'SMS delivery failed' };
    const w = this.store.addWithdrawal({ userId, amount: amt, mpesaPhone: mpesaPhone || user.phone, challengeId: challenge.id });
    return { ok: true, challengeId: challenge.id, maskedPhone: maskPhone(user.phone), withdrawalId: w.id, ...(sent.demoCode ? { demoCode: sent.demoCode } : {}) };
  }

  // POST /wallet/withdraw/confirm — step 2: OTP → instant (≤ limit) or queued
  withdrawConfirm(userId, { challengeId, code }) {
    const res = this.auth.store.verifyChallenge(challengeId, code);
    if (res !== 'ok') return { ok: false, status: res === 'locked' ? 423 : res === 'expired' ? 410 : 401, error: res };
    const w = this.store.data.withdrawals.find(x => x.challengeId === challengeId && x.userId === userId);
    if (!w || w.status !== 'AWAITING_OTP') return { ok: false, status: 404, error: 'withdrawal_not_found' };
    const a = this.store.account(userId);
    if (a.balance < w.amount) return { ok: false, status: 400, error: 'Insufficient balance' };
    const user = this.auth.store.findById(userId);
    const instant = w.amount <= AUTO_APPROVE_LIMIT && user.kycVerified && !user.riskFlagged;
    this.store.completeWithdrawal(w.id, instant ? 'COMPLETED' : 'IN_REVIEW');
    this.store.debit(userId, w.amount, 'WITHDRAWAL', w.id, 'Withdrawal to M-Pesa');
    if (!instant) {
      // queued → goes to the admin withdrawal queue for review
      this.store.data.withdrawals.find(x => x.id === w.id).status = 'IN_REVIEW';
      this.store.persist();
    }
    return {
      ok: true,
      status: instant ? 'instant' : 'queued',
      message: instant
        ? `Withdrawal of KES ${w.amount.toLocaleString()} sent to your M-Pesa.`
        : (w.amount > AUTO_APPROVE_LIMIT
            ? `Withdrawal of KES ${w.amount.toLocaleString()} queued for review (over the instant limit).`
            : `Withdrawal of KES ${w.amount.toLocaleString()} queued for review (instant payout requires a verified identity).`),
    };
  }

  // ── Game ledger ──
  placeBet(userId, amount, reference){
    const bal = this.store.debit(userId, amount, 'BET_STAKE', reference, 'Bet stake — round ' + reference);
    return bal !== null;
  }
  settleWin(userId, amount, reference){
    this.store.credit(userId, amount, 'BET_WIN', reference, 'Cash-out win — round ' + reference);
  }
  refundBet(userId, amount, reference){
    this.store.credit(userId, amount, 'REFUND', reference, 'Bet refund — round ' + reference);
  }
}

module.exports = { WalletService, AUTO_APPROVE_LIMIT };
