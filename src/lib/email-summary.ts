/**
 * Who sent an RFQ email and what it is about, for labeling a review or a draft so the rep
 * recognizes it (technical design 5.6 and 9). Display only: nothing is decided from it.
 *
 * The email is untrusted. These values are plain strings, rendered as text and never as
 * HTML, with control characters removed and whitespace collapsed.
 */
export type EmailSummary = {
  /** The sender's display name from the first "From:" line, or its address if it has no name. */
  customer: string | null;
  /** The first "Subject:" line, or the first non-empty line when the email has no headers. */
  subject: string | null;
};

/** Long enough for any real name or subject, short enough for a sidebar row. */
const MAX_LENGTH = 120;

/**
 * Reads the first `From:` and `Subject:` lines anywhere in the text, because pasted emails
 * often start with a greeting and keep their headers inside a forwarded part. Without
 * either, the first non-empty line stands in as the subject.
 */
export function summarizeEmail(emailText: string): EmailSummary {
  const lines = emailText.split(/\r?\n/);
  const header = (name: string) => {
    const pattern = new RegExp(`^\\s*${name}\\s*:\\s*(.*)$`, "i");
    for (const line of lines) {
      const value = pattern.exec(line)?.[1];
      if (value !== undefined) return clean(value);
    }
    return null;
  };

  const from = header("From");
  const subject = header("Subject");
  const customer = from === null ? null : senderName(from);
  if (customer !== null || subject !== null) return { customer, subject };

  const firstLine = lines.map(clean).find((line) => line !== null) ?? null;
  return { customer: null, subject: firstLine };
}

/** "Sam Okafor <sam@okafor.example>" → "Sam Okafor"; "<sam@okafor.example>" → the address. */
function senderName(from: string): string | null {
  const address = /<([^>]*)>/.exec(from)?.[1];
  const name = clean(from.replace(/<[^>]*>/g, "").trim().replace(/^["']+|["']+$/g, ""));
  return name ?? (address ? clean(address) : null);
}

function clean(text: string): string | null {
  // Control characters (including NUL and bidi overrides) never reach the screen.
  const plain = text
    .replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (plain === "") return null;
  return plain.length > MAX_LENGTH ? `${plain.slice(0, MAX_LENGTH - 1).trimEnd()}…` : plain;
}
