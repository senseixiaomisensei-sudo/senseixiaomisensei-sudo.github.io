import { serveRvcMedia } from "../api/_rvc-media.js";

export async function onRequest(context) {
  return serveRvcMedia(context);
}
