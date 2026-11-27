import AuditLog from '../models/AuditLog.js';

export function writeAudit({ actorId, action, resourceType, resourceId, changes = {} }) {
  return AuditLog.create({ actorId, action, resourceType, resourceId: String(resourceId), changes });
}
