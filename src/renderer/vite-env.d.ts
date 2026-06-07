/// <reference types="vite/client" />

import type { EditorApi, ViewerApi } from "../shared/types";

declare global {
  interface Window {
    editorApi: EditorApi;
    viewerApi: ViewerApi;
  }
}
