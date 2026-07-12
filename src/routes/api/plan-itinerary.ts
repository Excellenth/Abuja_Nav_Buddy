import { createFileRoute } from "@tanstack/react-router";
import Anthropic from "@anthropic-ai/sdk";

const STOP_SCHEMA = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description:
        "Best search phrase to geocode this stop in Abuja, Nigeria, e.g. 'Maitama District, Abuja' or a specific landmark name. Empty string if not resolvable to a searchable place.",
    },
    label: {
      type: "string",
      description: "Short human-readable label for this stop, e.g. 'Clinic', 'Sister's place', 'Home'",
    },
    resolvable: {
      type: "boolean",
      description:
        "True if `query` is specific enough to confidently geocode. False for vague references like 'my sister's house', 'home', or 'church' with no name given — the user will pick these manually.",
    },
  },
  required: ["query", "label", "resolvable"],
  additionalProperties: false,
} as const;

const ITINERARY_SCHEMA = {
  type: "object",
  properties: {
    stops: {
      type: "array",
      description:
        "Ordered list of physical stops the person will visit, in visiting order, including the starting point if mentioned.",
      items: STOP_SCHEMA,
    },
  },
  required: ["stops"],
  additionalProperties: false,
} as const;

type ParsedItinerary = {
  stops: { query: string; label: string; resolvable: boolean }[];
};

export const Route = createFileRoute("/api/plan-itinerary")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
          return new Response(
            JSON.stringify({ error: "Route planner isn't configured yet — missing ANTHROPIC_API_KEY." }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }

        let body: { text?: string };
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "Expected JSON body with a `text` field." }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        const text = body.text?.trim();
        if (!text) {
          return new Response(JSON.stringify({ error: "Describe your day first." }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const client = new Anthropic({ apiKey });
          const response = await client.messages.create({
            model: "claude-opus-4-8",
            max_tokens: 1024,
            system:
              "Extract an ordered list of physical stops from a description of someone's day in Abuja, Nigeria. " +
              "Preserve the order the person will visit them in. Skip people, activities, or times that aren't places. " +
              "If a stop is only described vaguely (a relative's house, an unnamed church/clinic, 'home'), still include it with resolvable: false so the app can ask the user to pick it manually.",
            messages: [{ role: "user", content: text }],
            output_config: { format: { type: "json_schema", schema: ITINERARY_SCHEMA }, effort: "low" },
          });

          const textBlock = response.content.find((b) => b.type === "text");
          if (!textBlock || textBlock.type !== "text") {
            return new Response(JSON.stringify({ error: "Couldn't understand that itinerary — try rephrasing." }), {
              status: 422,
              headers: { "Content-Type": "application/json" },
            });
          }

          const parsed = JSON.parse(textBlock.text) as ParsedItinerary;
          return new Response(JSON.stringify(parsed), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          if (err instanceof Anthropic.APIError && err.status === 401) {
            return new Response(JSON.stringify({ error: "Route planner isn't configured yet — invalid ANTHROPIC_API_KEY." }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }
          return new Response(JSON.stringify({ error: "Couldn't plan that route right now. Try again." }), {
            status: 502,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
