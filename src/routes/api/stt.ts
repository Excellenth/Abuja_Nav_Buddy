import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/stt")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) {
          return new Response(
            JSON.stringify({ error: "Voice search is not configured." }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return new Response(
            JSON.stringify({ error: "Expected multipart form-data." }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }
        const file = form.get("file");
        if (!(file instanceof Blob)) {
          return new Response(
            JSON.stringify({ error: "Audio file required." }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }
        if (file.size < 1024) {
          return new Response(
            JSON.stringify({ error: "Recording too short — please try again." }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }
        const mime = file.type.split(";")[0] || "audio/webm";
        const ext =
          ({
            "audio/webm": "webm",
            "audio/mp4": "mp4",
            "audio/mpeg": "mp3",
            "audio/wav": "wav",
            "audio/wave": "wav",
            "audio/x-wav": "wav",
            "audio/ogg": "ogg",
          } as Record<string, string>)[mime] ?? "webm";

        const upstream = new FormData();
        upstream.append("file", file, `voice.${ext}`);
        upstream.append("model", "openai/gpt-4o-transcribe");
        // Give the model a hint about likely place names
        upstream.append(
          "prompt",
          "Nigerian place names in Abuja such as Wuse, Garki, Maitama, Jabi, Kubwa, Gwarinpa, Asokoro, Nyanya, Berger.",
        );

        const res = await fetch(
          "https://ai.gateway.lovable.dev/v1/audio/transcriptions",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}` },
            body: upstream,
          },
        );
        const bodyText = await res.text();
        return new Response(bodyText, {
          status: res.status,
          headers: {
            "Content-Type":
              res.headers.get("Content-Type") ?? "application/json",
          },
        });
      },
    },
  },
});
