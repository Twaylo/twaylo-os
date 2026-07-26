/**
 * Transcription des vocaux Telegram via Whisper.
 *
 * Deux fournisseurs possibles, même API (Whisper), pris dans cet ordre :
 *   1. Groq — gratuit, sans carte bancaire, et le plus rapide. C'est celui à
 *      privilégier : Twaylo n'a qu'à créer une clé sur console.groq.com.
 *   2. OpenAI — le repli, si une clé OpenAI est présente.
 * Le premier dont la clé existe l'emporte. Aucune des deux : erreur claire.
 *
 * Le piège documenté en Partie 5 : Telegram sert les vocaux en OGG/Opus, et
 * Whisper les accepte — mais seulement si le nom de fichier ET le type MIME
 * annoncent l'OGG. Envoyé sans extension ou en `application/octet-stream`,
 * l'API répond une transcription vide, sans erreur. D'où le nom explicite
 * ci-dessous : il est fonctionnel, pas cosmétique.
 */

type Fournisseur = { nom: string; url: string; cle: string; modele: string };

/** Le premier fournisseur dont la clé est configurée, sinon null. */
function fournisseur(): Fournisseur | null {
  const groq = process.env.GROQ_API_KEY;
  if (groq) {
    return {
      nom: "Groq",
      url: "https://api.groq.com/openai/v1/audio/transcriptions",
      cle: groq,
      modele: "whisper-large-v3-turbo",
    };
  }
  const openai = process.env.OPENAI_API_KEY;
  if (openai) {
    return {
      nom: "OpenAI",
      url: "https://api.openai.com/v1/audio/transcriptions",
      cle: openai,
      modele: "whisper-1",
    };
  }
  return null;
}

export async function transcribeVoice(audio: Blob): Promise<string> {
  const f = fournisseur();
  if (!f) {
    throw new Error(
      "Aucune clé de transcription : ajoute GROQ_API_KEY (gratuit, console.groq.com) ou OPENAI_API_KEY.",
    );
  }

  const form = new FormData();
  form.append("file", new File([audio], "vocal.ogg", { type: "audio/ogg" }));
  form.append("model", f.modele);
  // Le français explicite évite que Whisper parte sur une autre langue quand
  // Twaylo enregistre au milieu d'un marché bolivien.
  form.append("language", "fr");

  const res = await fetch(f.url, {
    method: "POST",
    headers: { authorization: `Bearer ${f.cle}` },
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Transcription ${f.nom} ${res.status} : ${await res.text()}`);
  }

  const { text } = (await res.json()) as { text?: string };
  const transcript = (text ?? "").trim();
  if (!transcript) throw new Error(`${f.nom} a renvoyé une transcription vide`);
  return transcript;
}
