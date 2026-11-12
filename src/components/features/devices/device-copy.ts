/**
 * Plain English for every code the device API returns (spec ZKTECO_PUSH_DEVICE_SYNC.md §7.1, §8.1,
 * §9.2). Codes come from gymsera_be device-push.service / device-screens.service; nothing here shows a
 * raw server code to the person.
 */
import { agoText } from './device-ui'
import type { PushDeviceState, PushStatus } from '@/lib/api/devices'

const REASONS: Record<string, string> = {
  no_valid_package: 'No active package that covers this branch',
  user_blocked: 'Account suspended',
  pin_retired: 'Member deleted',
  no_user: 'Account not found',
  branch_sync_frozen: 'Branch locked: the GymsEra plan has lapsed, so no new members are added',
  not_on_device: 'Not on the device',
  device_storage_full: 'Device storage is full',
  command_unsupported: 'The device does not support this',
  unknown_pin: 'The device did not know the member yet',
  empty_template: 'The stored face or fingerprint is empty',
  template_version_mismatch: 'The face or fingerprint does not fit this device; the comparison photo is used instead',
  device_busy: 'The device was busy; it retries by itself',
  device_error: 'The device refused it',
  no_answer: 'The device did not answer',
  enroll_not_supported: 'This device cannot enrol remotely',
}

export const reasonText = (reason: string | null | undefined, returnCode?: number | null): string => {
  if (!reason) return returnCode ? `The device refused it (code ${returnCode})` : 'Unknown reason'
  const text = REASONS[reason] ?? 'The device refused it'
  return reason === 'device_error' && returnCode ? `${text} (code ${returnCode})` : text
}

/** One device row of a push in progress. */
export function pushStateText(d: PushStatus['devices'][number], kind: PushStatus['kind']): string {
  const states: Record<PushDeviceState, string> = {
    queued: 'Waiting for the device to ask',
    delivered: 'The device has it, waiting for its answer',
    applied: kind === 'remove' ? 'Removed' : kind === 'enroll' ? 'Enrolled' : 'Done',
    failed: d.reason === 'enroll_not_supported' && d.pin
      ? `This device cannot enrol remotely. Enrol on the device menu with PIN ${d.pin}.`
      : `Failed: ${reasonText(d.reason, d.returnCode)}`,
    offline: `Device offline${agoText(d.lastSeenSecondsAgo) ? `, last seen ${agoText(d.lastSeenSecondsAgo)}` : ''}. It will update when it reconnects.`,
    no_answer: 'No answer in 15 seconds. The change stays queued and lands when the device answers.',
    not_entitled: `Not pushed: ${reasonText(d.reason)}`,
    waiting_for_member: 'Ask the member to stand in front of the device',
  }
  return states[d.state] ?? 'Waiting'
}

export const PUSH_STATE_TONE: Record<PushDeviceState, string> = {
  queued: 'bg-gray-100 text-gray-800',
  delivered: 'bg-blue-100 text-blue-800',
  waiting_for_member: 'bg-blue-100 text-blue-800',
  applied: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  offline: 'bg-amber-100 text-amber-900',
  no_answer: 'bg-amber-100 text-amber-900',
  not_entitled: 'bg-gray-100 text-gray-800',
}

/** Sync state of a member on a device (the member card and the device's Members tab). */
export const SYNC_STATE_LABEL: Record<string, string> = {
  in_sync: 'In sync',
  pending_add: 'Pending',
  pending_update: 'Pending',
  pending_remove: 'Being removed',
  failed: 'Failed',
  removed: 'Not on device',
  not_on_device: 'Not on device',
}

/** The live feed: what happened after a scan. */
/** Phase 5: the push protocol a device speaks, in words. */
export function deviceTypeText(type: string | null | undefined): string | null {
  if (!type) return null
  if (type === 'att') return 'T&A PUSH (attendance)'
  if (type === 'acc') return 'Access control PUSH'
  return 'Other'
}

export function scanOutcomeText(e: { result: string; reason: string | null; attendanceNote: string | null }): string {
  // Phase 5: punches from before the device was activated (or went live after an import) are history.
  if (e.attendanceNote === 'history') return 'From the device history, before it joined GymsEra: not counted'
  if (e.result === 'denied') {
    const denied: Record<string, string> = {
      expired: 'Refused: package ended',
      not_registered: 'Refused: not on this device',
      unauthorized: 'Refused: no access to this door',
      wrong_time: 'Refused: outside the allowed hours',
    }
    return denied[e.reason ?? ''] ?? 'Refused by the device'
  }
  if (e.result !== 'granted') return 'Door event'
  const notes: Record<string, string> = {
    check_in: 'Checked in',
    check_out: 'Checked out',
    duplicate: 'Let in, already checked in',
    member_checkin_grace_expired: 'Let in, not counted: branch locked (GymsEra plan lapsed)',
    unlinked_pin: 'Let in: device user not linked to a member',
    retired_pin: 'Let in: deleted member, being removed',
  }
  return notes[e.attendanceNote ?? ''] ?? 'Let in, not counted as a visit'
}

export const BIO_TYPE_LABEL: Record<number, string> = {
  1: 'Fingerprint',
  2: 'Face',
  6: 'Palm',
  7: 'Palm',
  8: 'Palm',
  9: 'Face',
  10: 'Palm',
}

export const ERROR_KIND_LABEL: Record<string, string> = {
  device_storage_full: 'Device storage full',
  command_failed: 'Command refused',
  command_unsupported: 'Not supported by the device',
  template_version_mismatch: 'Template does not fit the device',
  empty_template: 'Empty template',
  no_answer: 'No answer from the device',
  granted_not_desired: 'Let in someone without access (removed)',
  granted_retired_pin: 'Let in a deleted member (removed)',
  denied_but_desired: 'Refused a member with access (sent again)',
  device_errorlog: 'Error reported by the device',
}

// ── Phase 4: import from GymBioSync, cut-over, command log ────────────────────────────────────────
export const IMPORT_STATUS_LABEL: Record<string, string> = {
  querying: 'Reading the device',
  ready: 'Ready to match',
  applying: 'Applying',
  applied: 'Applied, not live yet',
  live: 'Live',
  rolled_back: 'Rolled back',
  cancelled: 'Cancelled',
  failed: 'Failed: the device did not send its users',
}

export const IMPORT_CONFLICT_TEXT: Record<string, string> = {
  pin_taken: 'This PIN belongs to another GymsEra member. Remove this device user at go-live, or match it to that member.',
  member_has_pin: 'The member already has PIN {pin} in GymsEra. They are sent under that PIN and this device user is removed at go-live.',
}

export const importConflictText = (conflict: string | null, memberPin?: string | null): string | null =>
  conflict ? (IMPORT_CONFLICT_TEXT[conflict] ?? 'Needs a decision').replace('{pin}', memberPin ?? '') : null

/** CSV mapping line errors (device-import.service#mapCsv). */
export const CSV_ERROR_TEXT: Record<string, string> = {
  invalid_pin: 'The PIN is not a number',
  pin_not_on_device: 'No user with this PIN on the device',
  device_admin: 'This is an administrator of the device: it stays as it is',
  member_missing: 'No member id, e-mail or phone on this line',
  member_not_found: 'No member of this gym matches',
  ambiguous_member: 'More than one member matches (use the member id or e-mail)',
  member_already_matched: 'This member is already matched to another device user',
}

export const CUTOVER_STEP_LABEL: Record<string, { title: string; help: string }> = {
  connected: { title: 'Device connected', help: 'The device talks to GymsEra. Until go-live it keeps letting people in exactly as GymBioSync left it.' },
  imported: { title: 'Users read from the device', help: 'GymsEra reads every user and face or fingerprint on the device. Nothing on the device changes.' },
  matched: { title: 'Device users matched to members', help: 'Each device user is linked to a GymsEra member, by CSV or one by one. Unmatched users stay on the device as they are.' },
  conflicts: { title: 'No conflicts left', help: 'A PIN that belongs to another GymsEra member needs a decision before you apply.' },
  applied: { title: 'Import applied', help: 'Members keep their device PIN; faces and fingerprints are stored, encrypted. Still nothing changes on the device.' },
  consent: { title: 'Biometric consent', help: 'Members without consent keep their face or fingerprint on this device only, for 7 days after go-live. Record their consent before then.' },
  capacity: { title: 'Device capacity', help: 'Users after go-live against what the device can hold.' },
  live: { title: 'Gone live', help: 'GymsEra now decides who the device lets in: packages, freezes and expiries apply from here.' },
  verified: { title: 'Verified on the device', help: 'Members confirmed by the device, and the audit after go-live finished.' },
  gymbiosync_stopped: { title: 'GymBioSync stopped', help: 'Stop the GymBioSync service on the gym PC so nothing else sends to this device.' },
}

export const STEP_STATUS_LABEL: Record<string, string> = {
  done: 'Done',
  todo: 'To do',
  in_progress: 'In progress',
  warning: 'Check',
  blocked: 'Blocked',
}

export const STEP_STATUS_TONE: Record<string, string> = {
  done: 'bg-green-100 text-green-800',
  todo: 'bg-gray-100 text-gray-800',
  in_progress: 'bg-blue-100 text-blue-800',
  warning: 'bg-amber-100 text-amber-900',
  blocked: 'bg-red-100 text-red-800',
}

export const COMMAND_KIND_LABEL: Record<string, string> = {
  user_upsert: 'Add or update user',
  user_authorize: 'Door access',
  bio_upsert: 'Face or fingerprint',
  bio_photo: 'Comparison photo',
  user_pic: 'Profile photo',
  user_delete: 'Remove user',
  bio_delete: 'Remove face or fingerprint',
  photo_delete: 'Remove comparison photo',
  pic_delete: 'Remove profile photo',
  auth_delete: 'Remove door access',
  query_users: 'Read users',
  query_bio: 'Read faces or fingerprints',
  count: 'Count users',
  info: 'Device information',
  check: 'Check',
  enroll_bio: 'Enrol on the device',
  wipe: 'Wipe',
}

export const COMMAND_STATUS_LABEL: Record<string, string> = {
  queued: 'Waiting',
  sent: 'Sent, waiting for the answer',
  acked: 'Done',
  failed: 'Failed',
  expired: 'Expired',
  superseded: 'Replaced by a newer change',
}
