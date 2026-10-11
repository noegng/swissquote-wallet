// Reads the CLIENT share entered by the client: paper (20 words) or cloud copy (C2 file +
// passphrase). Used by the recovery and by the exit without Swissquote.
import { openWithPassphrase, shareGroup, type PassphraseBox } from '@sqw/core';

/** CLIENT share from paper: checks the SLIP-39 checksum and the group. */
export function clientShareFromWords(words: string): string {
  const normalized = words.trim().toLowerCase().split(/\s+/).join(' ');
  if (shareGroup(normalized) !== 'client') throw new Error('These words are our partner’s share, not yours');
  return normalized;
}

/** CLIENT share from the cloud copy (C2 file + passphrase). */
export async function clientShareFromFile(file: File, passphrase: string): Promise<string> {
  const json = JSON.parse(await file.text()) as { type?: string; box?: PassphraseBox };
  if (json.type !== 'swissquote-wallet/backup-c2' || !json.box) throw new Error('This is not an encrypted backup file');
  let words: string;
  try {
    words = await openWithPassphrase(json.box, passphrase);
  } catch {
    throw new Error('Wrong passphrase');
  }
  return clientShareFromWords(words);
}
