// Staff-IAM — store.js
// JSON-file persistence (swap for the SQL schema in production). Implements
// the Staff / Invitations / Sessions / Devices / Audit tables with UUIDs,
// soft deletes and a permission cache.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const uuid = () => crypto.randomUUID();
const hash = (v, salt) => crypto.createHash('sha256').update(`${salt}:${v}`).digest('hex');
const newSalt = () => crypto.randomBytes(16).toString('hex');

// Role templates with least-privilege (matches the frontend catalog)
const ROLE_TEMPLATES = {
  superadmin: ['staff:view','staff:invite','staff:manage','users:view','users:manage','transactions:view','transactions:approve','kyc:view','kyc:review','fraud:view','fraud:manage','otp:view','audit:view','reports:view','settings:manage','bots:manage','odds:override'],
  operations: ['staff:view','users:view','users:manage','transactions:view','kyc:view','otp:view','audit:view','reports:view'],
  finance:    ['transactions:view','transactions:approve','reports:view','audit:view'],
  compliance: ['kyc:view','kyc:review','fraud:view','fraud:manage','audit:view','reports:view'],
  marketing:  ['reports:view'],
  techadmin:  ['staff:view','staff:invite','staff:manage','users:view','users:manage','transactions:view','transactions:approve','kyc:view','kyc:review','fraud:view','fraud:manage','otp:view','audit:view','reports:view','settings:manage','bots:manage','odds:override'],
  developer:  ['audit:view','settings:manage'],
  devops:     ['audit:view','settings:manage'],
  support:    ['users:view','users:manage','kyc:view','otp:view'],
  auditor:    ['audit:view','reports:view'],
};
const DEPARTMENTS = ['Operations','Finance','Compliance','Marketing','Technology','Support','Executive'];

class StaffStore {
  constructor(dir = path.join(__dirname, '..', '..', 'data')) {
    this.file = path.join(dir, 'staff-iam.json');
    this.data = { staff: [], invitations: [], sessions: [], devices: [], audit: [] };
    this.permCache = {}; // permission caching (recommendation)
    this.load();
  }
  load(){
    try { if (fs.existsSync(this.file)) this.data = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch (_) {}
  }
  persist(){ try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file, JSON.stringify(this.data)); } catch (_) {} }

  // ── Audit ──
  audit(actor, action, target, device, outcome){
    this.data.audit.push({ id: uuid(), actor, action, target: target || null, device: device || null, outcome, createdAt: Date.now() });
    if (this.data.audit.length > 2000) this.data.audit = this.data.audit.slice(-2000);
    this.persist();
    return this.data.audit[this.data.audit.length - 1];
  }

  // ── Staff ──
  createStaff({ name, phone, email, department, roleId, managerId, passwordHash }) {
    const staff = {
      id: uuid(),
      staffCode: 'ST-' + String(this.data.staff.length + 1).padStart(3, '0'),
      name, phone, email, department, roleId, managerId: managerId || null,
      employmentStatus: 'pending_invite',
      securityStatus: 'pending',
      passwordHash: passwordHash || null,
      customPermissions: [],
      deletedAt: null,
      createdAt: Date.now(),
    };
    this.data.staff.push(staff);
    this.invalidatePermCache(staff.id);
    this.persist();
    return staff;
  }
  findStaff(filters = {}) {
    let rows = this.data.staff.filter(s => s.deletedAt === null); // soft delete hides
    if (filters.q) {
      const q = String(filters.q).toLowerCase();
      rows = rows.filter(s => s.name.toLowerCase().includes(q) || s.staffCode.toLowerCase().includes(q) || s.email.toLowerCase().includes(q));
    }
    if (filters.department) rows = rows.filter(s => s.department === filters.department);
    if (filters.status) rows = rows.filter(s => s.employmentStatus === filters.status);
    return rows;
  }
  getStaff(id){ return this.data.staff.find(s => s.id === id && s.deletedAt === null) || null; }
  updateStaff(id, patch){
    const s = this.getStaff(id);
    if (!s) return null;
    ['name','phone','email','department','roleId','managerId','employmentStatus','securityStatus','customPermissions','passwordHash'].forEach(k => {
      if (patch[k] !== undefined) s[k] = patch[k];
    });
    this.invalidatePermCache(id);
    this.persist();
    return s;
  }
  softDelete(id){ const s = this.getStaff(id); if (s){ s.deletedAt = Date.now(); this.invalidatePermCache(id); this.persist(); } return !!s; }

  // ── Permissions (with cache) ──
  invalidatePermCache(id){ delete this.permCache[id]; }
  permissionsFor(staffId){
    if (this.permCache[staffId]) return this.permCache[staffId]; // cached
    const s = this.getStaff(staffId);
    if (!s) return [];
    const perms = new Set(ROLE_TEMPLATES[s.roleId] || []);
    (s.customPermissions || []).forEach(p => perms.add(p));
    const result = [...perms];
    this.permCache[staffId] = result; // permission caching
    return result;
  }
  hasPermission(staffId, perm){ return this.permissionsFor(staffId).includes(perm); }

  // ── Invitations ──
  createInvitation(staffId, ttlMs = 24 * 3600 * 1000){
    const s = this.getStaff(staffId);
    if (!s) return null;
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const salt = newSalt();
    const inv = {
      id: uuid(), staffId,
      codeHash: hash(code, salt), salt,
      status: 'pending',
      expiresAt: Date.now() + ttlMs,
      createdAt: Date.now(),
    };
    this.data.invitations.push(inv);
    this.persist();
    return { id: inv.id, code, expiresAt: inv.expiresAt }; // code only for the SMS send
  }
  verifyInvitation(inviteCode){
    const now = Date.now();
    const inv = this.data.invitations.find(i => i.status === 'pending' && i.expiresAt > now && hash(String(inviteCode), i.salt) === i.codeHash);
    if (!inv) return { ok: false, error: 'invalid_or_expired_invitation' };
    return { ok: true, invitation: inv };
  }
  useInvitation(id){
    const inv = this.data.invitations.find(i => i.id === id);
    if (inv){ inv.status = 'used'; this.persist(); }
    return inv;
  }

  // ── Sessions & devices ──
  recordSession(staffId, { browser, os, ip, deviceId }){
    const s = this.getStaff(staffId);
    if (!s) return null;
    const existing = this.data.sessions.find(x => x.staffId === staffId && x.deviceId === deviceId && !x.revoked);
    const now = Date.now();
    if (existing){ existing.lastSeen = now; }
    else {
      this.data.sessions.push({ id: uuid(), staffId, deviceId, browser: browser || null, os: os || null, ip: ip || null, createdAt: now, lastSeen: now, revoked: 0 });
    }
    const dev = this.data.devices.find(d => d.staffId === staffId && d.deviceFingerprint === deviceId);
    if (dev){ dev.lastSeen = now; }
    else { this.data.devices.push({ id: uuid(), staffId, deviceFingerprint: deviceId, verified: 0, firstSeen: now, lastSeen: now }); }
    this.persist();
    return { session: existing || this.data.sessions[this.data.sessions.length - 1], deviceVerified: !!(dev && dev.verified) };
  }
  listSessions(){ return [...this.data.sessions].reverse(); }
  revokeSession(id){ const s = this.data.sessions.find(x => x.id === id); if (s){ s.revoked = 1; s.lastSeen = 0; this.persist(); } return !!s; }
  // Mark a device verified after successful SMS verification (login security)
  verifyDevice(staffId, deviceFingerprint){
    const dev = this.data.devices.find(d => d.staffId === staffId && d.deviceFingerprint === deviceFingerprint);
    if (!dev) return false;
    dev.verified = 1;
    this.persist();
    return true;
  }
}

module.exports = { StaffStore, ROLE_TEMPLATES, DEPARTMENTS, uuid };
