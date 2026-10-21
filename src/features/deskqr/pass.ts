// What a DASH visitor pass QR carries, and how a scan is read back.
//
// The server's pass image (GET /visitors/invites/:id/pass) shows the 6-digit check-in code as text only.
// The app draws its own pass with a QR of that same code, so reception (or the kiosk) can scan it instead
// of typing it. The QR holds nothing but the code: "DASHPASS:482615". A scanned code still goes through
// the normal check (POST /public/visit/<company>/<token>/invite), so the QR grants nothing by itself.

const PREFIX = 'DASHPASS:';

export const passPayload = (code: string) => `${PREFIX}${String(code).replace(/\D/g, '').slice(0, 6)}`;

/** The 6-digit code in a scanned QR: our pass ("DASHPASS:123456") or a QR of the bare code. Else null. */
export function codeFromScan(data: string | null | undefined): string | null {
  const s = String(data ?? '').trim();
  const ours = /^DASHPASS:(\d{6})$/i.exec(s);
  if (ours) return ours[1]!;
  const bare = /^(\d{6})$/.exec(s);
  return bare ? bare[1]! : null;
}

/** The plain words for a QR that is not a pass (a poster, a website, anything else). */
export function notAPassMessage(data: string | null | undefined): string {
  const s = String(data ?? '');
  if (/\/visit\//.test(s)) return 'That is the check-in poster, not a visitor pass. Scan the pass the guest was sent.';
  return 'That QR code is not a DASH visitor pass. Type the 6-digit code instead.';
}
