// Staff-IAM — schema.js
// Database tables per the BetCrash Staff IAM Plan v1.0:
// Staff, Roles, Permissions, StaffInvitations, StaffSessions, StaffDevices,
// StaffAuditLogs. UUIDs, soft deletes, permission caching.

const SCHEMA_SQL = `
-- Roles (hierarchy per plan)
CREATE TABLE roles (
  id TEXT PRIMARY KEY,          -- superadmin|operations|finance|compliance|marketing|techadmin|developer|devops|support|auditor
  label TEXT NOT NULL,
  template TEXT NOT NULL        -- JSON array of permission keys
);
CREATE TABLE permissions (
  id TEXT PRIMARY KEY,          -- staff:view, finance:approve, ...
  description TEXT
);
-- Staff
CREATE TABLE staff (
  id TEXT PRIMARY KEY,          -- UUID
  staff_code TEXT UNIQUE NOT NULL,   -- ST-001 (searchable directory)
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  department TEXT NOT NULL,
  role_id TEXT NOT NULL REFERENCES roles(id),
  manager_id TEXT,
  employment_status TEXT DEFAULT 'active',  -- active|suspended|locked|on_leave|resigned|archived
  security_status TEXT DEFAULT 'pending',   -- pending|verified
  password_hash TEXT,
  custom_permissions TEXT DEFAULT '[]',
  deleted_at INTEGER,           -- soft delete
  created_at INTEGER NOT NULL
);
-- Invitations (SMS invitation with expiry + self-service activation)
CREATE TABLE staff_invitations (
  id TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL REFERENCES staff(id),
  invite_code_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  status TEXT DEFAULT 'pending',   -- pending|used|expired
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
-- Sessions + devices (login security)
CREATE TABLE staff_sessions (
  id TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL REFERENCES staff(id),
  device_id TEXT NOT NULL,
  browser TEXT, os TEXT, ip TEXT,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  revoked INTEGER DEFAULT 0
);
CREATE TABLE staff_devices (
  id TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL REFERENCES staff(id),
  device_fingerprint TEXT NOT NULL,
  verified INTEGER DEFAULT 0,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
-- Audit (every admin action: actor, timestamp, target, device, outcome)
CREATE TABLE staff_audit_logs (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  device TEXT,
  outcome TEXT NOT NULL,       -- success|failed
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_staff_name ON staff(name);
CREATE INDEX idx_staff_dept ON staff(department);
CREATE INDEX idx_audit_actor ON staff_audit_logs(actor);
`;

module.exports = { SCHEMA_SQL };
