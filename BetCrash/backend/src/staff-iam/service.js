// Staff-IAM — service.js
// Orchestrates the IAM flows from the plan:
//   Onboarding: Create Staff → Department → Role → Permissions → SMS
//   Invitation → Password Creation → Phone Verification → Activation.
//   Login security: device/browser/OS/IP tracking; new devices require
//   SMS verification. All actions audited.

const crypto = require('crypto');
const { StaffStore, DEPARTMENTS } = require('./store');

// Demo password hashing (production: argon2/bcrypt)
const hashPassword = (pw) => crypto.createHash('sha256').update('betcrash:' + pw).digest('hex');

class StaffIamService {
  constructor() {
    this.store = new StaffStore();
  }

  // POST /api/v1/staff            — create staff (onboarding step 1)
  createStaff({ name, phone, email, department, roleId, managerId, actor, device }) {
    if (!name || !phone || !email || !department || !roleId) return { ok: false, status: 400, error: 'missing_fields' };
    if (!DEPARTMENTS.includes(department)) return { ok: false, status: 400, error: 'invalid_department' };
    const dup = this.store.data.staff.find(s => s.deletedAt === null && (s.email === email || s.phone === phone));
    if (dup) return { ok: false, status: 409, error: 'email_or_phone_already_used' };
    if (!this.store.getStaff(roleId) && !['superadmin','operations','finance','compliance','marketing','techadmin','developer','devops','support','auditor'].includes(roleId)) {
      // roleId here is the role key; validate against known keys
      if (!['superadmin','operations','finance','compliance','marketing','techadmin','developer','devops','support','auditor'].includes(roleId)) return { ok: false, status: 400, error: 'invalid_role' };
    }
    const staff = this.store.createStaff({ name, phone, email, department, roleId, managerId });
    this.store.audit(actor || 'system', 'staff.create', staff.id, device || null, 'success');
    return { ok: true, staff };
  }

  // POST /api/v1/staff/:id/invite — send SMS invitation (expiry, self-service)
  invite(staffId, { actor, device }) {
    const staff = this.store.getStaff(staffId);
    if (!staff) return { ok: false, status: 404, error: 'staff_not_found' };
    const inv = this.store.createInvitation(staffId);
    // In production the 6-digit code goes via SMS-IVS (provider), hashed here.
    this.store.audit(actor || 'system', 'staff.invite', staffId, device || null, 'success');
    return { ok: true, invitationId: inv.id, expiresAt: inv.expiresAt, smsSimulated: true, code: inv.code };
  }

  // POST /api/v1/staff/activate    — self-service activation (invite code →
  //   password → phone OTP via SMS-IVS)
  activate({ inviteCode, password, phoneOtp, actor, device }) {
    const check = this.store.verifyInvitation(inviteCode);
    if (!check.ok) return { ok: false, status: 400, error: check.error };
    if (!password || password.length < 8) return { ok: false, status: 400, error: 'weak_password' };
    if (!phoneOtp || !/^\d{6}$/.test(phoneOtp)) return { ok: false, status: 400, error: 'phone_verification_required' };
    this.store.useInvitation(check.invitation.id);
    const staff = this.store.updateStaff(check.invitation.staffId, {
      employmentStatus: 'active', securityStatus: 'verified',
      passwordHash: hashPassword(password),
    });
    this.store.audit(actor || 'system', 'staff.activate', staff.id, device || null, 'success');
    return { ok: true, staff };
  }

  // POST /api/v1/staff/:id/status  — suspend/unlock/leave/resign/archive (soft delete)
  setStatus(staffId, { status, actor, device }) {
    const allowed = ['active','suspended','locked','on_leave','resigned','archived'];
    if (!allowed.includes(status)) return { ok: false, status: 400, error: 'invalid_status' };
    const staff = this.store.updateStaff(staffId, { employmentStatus: status });
    if (!staff) return { ok: false, status: 404, error: 'staff_not_found' };
    this.store.audit(actor || 'system', 'staff.status:' + status, staffId, device || null, 'success');
    return { ok: true, staff };
  }

  // GET /api/v1/staff              — searchable directory (q, department, status)
  list(filters) { return { ok: true, staff: this.store.findStaff(filters || {}) }; }

  // GET /api/v1/staff/:id          — profile incl. login history + security status
  profile(id) {
    const s = this.store.getStaff(id);
    if (!s) return { ok: false, status: 404, error: 'staff_not_found' };
    return {
      ok: true,
      staff: s,
      permissions: this.store.permissionsFor(id),
      sessions: this.store.data.sessions.filter(x => x.staffId === id).reverse().slice(0, 10),
      devices: this.store.data.devices.filter(d => d.staffId === id),
    };
  }

  // POST /api/v1/staff/login       — session record; new device needs SMS verify
  login({ staffCode, password, deviceInfo, actor, device }) {
    const s = this.store.data.staff.find(x => x.staffCode === staffCode && x.deletedAt === null);
    if (!s || !s.passwordHash || s.passwordHash !== hashPassword(password || '')) {
      this.store.audit(actor || staffCode || 'unknown', 'staff.login', s ? s.id : null, device || null, 'failed');
      return { ok: false, status: 401, error: 'invalid_credentials' };
    }
    if (['suspended','locked','resigned','archived'].includes(s.employmentStatus)) {
      this.store.audit(actor || s.staffCode, 'staff.login', s.id, device || null, 'failed');
      return { ok: false, status: 403, error: 'account_' + s.employmentStatus };
    }
    const res = this.store.recordSession(s.id, deviceInfo || {});
    this.store.audit(actor || s.name, 'staff.login', s.id, device || null, 'success');
    return {
      ok: true,
      staff: { id: s.id, name: s.name, role: s.roleId },
      deviceVerified: res.deviceVerified,
      requiresSmsVerification: !res.deviceVerified, // new device → SMS OTP
      permissions: this.store.permissionsFor(s.id),
    };
  }

  // GET /api/v1/staff/sessions     — online staff, devices, IPs
  sessions() { return { ok: true, sessions: this.store.listSessions() }; }

  // POST /api/v1/staff/devices/verify — after the SMS OTP check, mark the
  // device verified so future logins on it skip re-verification.
  verifyDevice({ staffId, deviceId, actor, device }) {
    const ok = this.store.verifyDevice(staffId, deviceId);
    if (!ok) return { ok: false, status: 404, error: 'device_not_found' };
    this.store.audit(actor || 'system', 'staff.device.verify', staffId, device || null, 'success');
    return { ok: true, deviceVerified: true };
  }

  // POST /api/v1/staff/sessions/:id/revoke
  revoke(id, { actor, device }) {
    const ok = this.store.revokeSession(id);
    if (!ok) return { ok: false, status: 404, error: 'session_not_found' };
    this.store.audit(actor || 'system', 'staff.session.revoke', id, device || null, 'success');
    return { ok: true };
  }

  // GET /api/v1/staff/audit        — comprehensive audit trail
  audit() { return { ok: true, audit: [...this.store.data.audit].reverse() }; }

  // GET /api/v1/staff/roles        — role templates + permission catalog
  roles() {
    const { ROLE_TEMPLATES } = require('./store');
    return { ok: true, roles: Object.keys(ROLE_TEMPLATES).map(r => ({ id: r, permissions: ROLE_TEMPLATES[r] })) };
  }
}

module.exports = { StaffIamService, hashPassword };
