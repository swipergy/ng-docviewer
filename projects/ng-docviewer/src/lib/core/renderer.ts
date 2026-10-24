import { DocViewerConfig } from '../config';
import { LoadedDocument } from './types';

export interface RenderContext {
  /** Element, in das der Renderer zeichnet (exklusiv für ihn). */
  host: HTMLElement;
  /** Scroll-Container (für lazy Rendering per IntersectionObserver). */
  scrollContainer: HTMLElement;
  doc: LoadedDocument;
  config: DocViewerConfig;
  signal: AbortSignal;
}

/** Inhalt für den Druck: Seitenbilder oder HTML-Seiten. Das Wasserzeichen ergänzt der PrintService. */
export type PrintContent =
  | { kind: 'images'; images: Blob[] }
  | { kind: 'html'; css: string; pages: HTMLElement[]; landscape?: boolean };

export interface DocRenderer {
  /** Seiten-Elemente in Lesereihenfolge (für Seitenanzeige und Navigation). */
  readonly pages: HTMLElement[];
  /** Breite des Inhalts bei Zoom 1 in CSS-Pixeln (für „an Breite anpassen“). */
  readonly contentWidth: number;
  render(): Promise<void>;
  setZoom(zoom: number): void;
  /** Dreht um 90° im Uhrzeigersinn (nur wo sinnvoll). */
  rotate?(): void;
  /** Liefert druckbaren Inhalt (ohne Wasserzeichen). */
  printContent?(): Promise<PrintContent>;
  destroy(): void;
}

export type RendererFactory = (ctx: RenderContext) => DocRenderer;
