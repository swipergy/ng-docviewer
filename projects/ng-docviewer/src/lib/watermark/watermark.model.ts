/** Konfiguration des Wasserzeichens. Text und Bild sind kombinierbar. */
export interface WatermarkConfig {
  /** Text mit Platzhaltern, z. B. `"{user} · {date}"`. Zeilenumbrüche mit `\n`. */
  text?: string;
  /** URL (auch data:/blob:) eines Bildes/Logos. Muss CORS-fähig sein, wenn von fremder Domain. */
  image?: string;
  /** Breite des Bildes in CSS-Pixeln (Höhe proportional). Standard: 120. */
  imageWidth?: number;
  /** Deckkraft 0–1. Standard: 0.18. */
  opacity?: number;
  /** Drehwinkel in Grad. Standard: -30. */
  angle?: number;
  /** Textfarbe. Standard: `#000`. */
  color?: string;
  /** Schriftgröße in CSS-Pixeln. Standard: 20. */
  fontSize?: number;
  /** Schriftfamilie. Standard: `sans-serif`. */
  fontFamily?: string;
  /** Schriftstärke. Standard: `600`. */
  fontWeight?: string | number;
  /** Abstand zwischen den Kacheln in CSS-Pixeln. Standard: 80. */
  gap?: number;
  /** `tile` = über die Fläche gekachelt, `center` = einmal mittig. Standard: `tile`. */
  layout?: 'tile' | 'center';
}

/** Werte für Platzhalter. `{date}`, `{time}` und `{datetime}` werden automatisch befüllt. */
export type WatermarkContext = Record<string, string | number | undefined>;

export const WATERMARK_DEFAULTS: Required<Omit<WatermarkConfig, 'text' | 'image'>> = {
  imageWidth: 120,
  opacity: 0.18,
  angle: -30,
  color: '#000',
  fontSize: 20,
  fontFamily: 'sans-serif',
  fontWeight: '600',
  gap: 80,
  layout: 'tile',
};

export function hasWatermark(config: WatermarkConfig | null | undefined): config is WatermarkConfig {
  return !!config && (!!config.text?.trim() || !!config.image);
}
