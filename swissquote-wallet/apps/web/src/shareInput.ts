// Lecture de la part CLIENT saisie par le client : papier (20 mots) ou copie cloud (fichier C2 +
// phrase de passe). Utilisé par la récupération et par la sortie sans Swissquote.
import { openWithPassphrase, shareGroup, type PassphraseBox } from '@sqw/core';

/** Part CLIENT depuis le papier : vérifie la somme de contrôle SLIP-39 et le groupe. */
export function clientShareFromWords(words: string): string {
  const normalized = words.trim().toLowerCase().split(/\s+/).join(' ');
  if (shareGroup(normalized) !== 'client') throw new Error('Ces mots sont une part du partenaire, pas votre part');
  return normalized;
}

/** Part CLIENT depuis la copie cloud (fichier C2 + phrase de passe). */
export async function clientShareFromFile(file: File, passphrase: string): Promise<string> {
  const json = JSON.parse(await file.text()) as { type?: string; box?: PassphraseBox };
  if (json.type !== 'swissquote-wallet/backup-c2' || !json.box) throw new Error('Fichier de sauvegarde C2 non reconnu');
  let words: string;
  try {
    words = await openWithPassphrase(json.box, passphrase);
  } catch {
    throw new Error('Phrase de passe incorrecte');
  }
  return clientShareFromWords(words);
}
