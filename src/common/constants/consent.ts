// Backend-authoritative supported consent version per registration path.
// The client submits a version, but only this exact value is accepted —
// it cannot choose an arbitrary or future version.
// Kept as two independent constants (not shared) since teacher and
// Telegram registration present separate consent copy and could diverge
// in the future; both currently reference edition 1 of the legal documents.
export const CURRENT_TEACHER_CONSENT_VERSION = 1;
export const CURRENT_TELEGRAM_CONSENT_VERSION = 1;
