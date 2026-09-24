/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** "1" only in the video pipeline's build (video/): see RECORDING in src/scene/index.ts. */
  readonly PUBLIC_RECORDING?: string;
}
