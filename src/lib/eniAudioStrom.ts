/** Playback of signed-in server PCM chunks. No audio or personal text is persisted here. */
let kontext: AudioContext | null = null;
export function weckeAudioStrom(): AudioContext | null {
  try {
    if (typeof AudioContext === "undefined") return null;
    kontext ??= new AudioContext();
    void kontext.resume().catch(() => {});
    return kontext;
  } catch {
    return null;
  }
}

export function audioWarteschlange(
  ctx: AudioContext,
  fertig: () => void,
) {
  let zeit = ctx.currentTime;
  let ende = false;
  let gestoppt = false;
  let rest: number | null = null;
  const quellen = new Set<AudioBufferSourceNode>();
  const pruefe = () => {
    if (ende && !gestoppt && quellen.size === 0) fertig();
  };
  return {
    anhaengen(base64: string) {
      if (gestoppt) return;
      const roh = atob(base64);
      const bytes = new Uint8Array(roh.length + (rest === null ? 0 : 1));
      let i = 0;
      if (rest !== null) bytes[i++] = rest;
      for (const zeichen of roh) bytes[i++] = zeichen.charCodeAt(0);
      rest = bytes.length % 2 ? bytes[bytes.length - 1]! : null;
      const anzahl = Math.floor(bytes.length / 2);
      if (!anzahl) return;
      const buffer = ctx.createBuffer(1, anzahl, 24_000);
      const floats = buffer.getChannelData(0);
      const view = new DataView(bytes.buffer);
      for (let n = 0; n < anzahl; n++)
        floats[n] = view.getInt16(n * 2, true) / 32768;
      const quelle = ctx.createBufferSource();
      quelle.buffer = buffer;
      quelle.connect(ctx.destination);
      quellen.add(quelle);
      quelle.onended = () => {
        quellen.delete(quelle);
        quelle.disconnect();
        pruefe();
      };
      const start = Math.max(zeit, ctx.currentTime + 0.04);
      quelle.start(start);
      zeit = start + buffer.duration;
    },
    abschliessen() {
      ende = true;
      pruefe();
    },
    halt() {
      gestoppt = true;
      for (const q of quellen) {
        q.onended = null;
        try {
          q.stop();
        } catch {
          /* already ended */
        }
        q.disconnect();
      }
      quellen.clear();
    },
  };
}
