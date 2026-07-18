/**
 * Transcription des vocaux Telegram via Whisper.
 *
 * Le piège documenté en Partie 5 : Telegram sert les vocaux en OGG/Opus, et
 * Whisper les accepte — mais seulement si le nom de fichier ET le type MIME
 * annoncent l'OGG. Envoyé sans extension ou en `application/octet-stream`,
 * l'API répond une transcription vide, sans erreur. D'où le nom explicite
 * ci-dessous : il est fonctionnel, pas cosmétique.
 */
export async function transcribeVoice(audio: Blob): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY manquant — transcription impossible");

  const form = new FormData();
  form.append("file", new File([audio], "vocal.ogg", { type: "audio/ogg" }));
  form.append("model", "whisper-1");
  // Le français explicite évite que Whisper parte sur une autre langue quand
  // Twaylo enregistre au milieu d'un marché bolivien.
  form.append("language", "fr");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}` },
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Whisper ${res.status} : ${await res.text()}`);
  }

  const { text } = await res.json();
  const transcript = (text ?? "").trim();
  if (!transcript) throw new Error("Whisper a renvoyé une transcription vide");
  return transcript;
}
