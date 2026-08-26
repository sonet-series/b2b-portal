import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      /**
       * Registration posts three documents in one multipart request, and
       * src/lib/uploads.ts allows 5MB each. Next's default cap is 1MB for the
       * WHOLE request body, which rejected uploads before that check ever ran
       * — the agent got an opaque "server error" page rather than a message
       * telling them the file was too large. A phone photo alone clears 1MB.
       *
       * 16mb = 3 × 5MB plus room for multipart boundaries and the text fields.
       * The per-file limit stays the real guard; this only stops Next refusing
       * the request before the app can give a useful answer.
       */
      bodySizeLimit: "16mb",
    },
  },
};

export default nextConfig;
