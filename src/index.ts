export interface Env {
  AI: any;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders, status: 204 });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Please send a JSON POST request." }), { status: 405, headers: corsHeaders });
    }

    try {
      const body: any = await request.json();
      const userPrompt = body.prompt;

      if (!userPrompt) {
        return new Response(JSON.stringify({ error: "Missing 'prompt' parameter." }), { status: 400, headers: corsHeaders });
      }

      const BRAND_SYSTEM_PROMPT = `
        You are the Design Director for 'Ethereal Form'. Convert product ideas into brand assets.
        MANDATES: Color palette is Cream White (#FFFDD0), Charcoal Gray (#1C1C1C).
        Output ONLY raw JSON matching this schema:
        {
          "typography": { "heading": "Oswald Bold", "body": "Geist Mono Regular" },
          "palette": ["#FFFDD0", "#1C1C1C"],
          "headline": "A short minimalist title.",
          "caption": "An elegant description.",
          "tags": ["#EtherealForm"]
        }
      `.trim();

      const imageTask = env.AI.run('@cf/black-forest-labs/flux-1-schnell', {
        prompt: `${userPrompt}, luxury architectural minimalism editorial photography style, color palette of cream white, clean studio lighting`,
        height: 1024,
        width: 1024
      });

      const copyTask = env.AI.run('@cf/meta/llama-3.1-8b-instruct-fp8', {
        messages: [
          { role: "system", content: BRAND_SYSTEM_PROMPT },
          { role: "user", content: `Generate brand data for: ${userPrompt}` }
        ],
        temperature: 0.1,
        max_tokens: 400
      });

      const [imageResult, textResult] = await Promise.all([imageTask, copyTask]);

      const imageBuffer = await imageResult.arrayBuffer();
      const base64String = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));

      let cleanText = textResult.response.trim();
      if (cleanText.startsWith("```")) {
        cleanText = cleanText.replace(/```json|```/g, "").trim();
      }

      let parsedAssets;
      try {
        parsedAssets = JSON.parse(cleanText);
      } catch (e) {
        parsedAssets = {
          typography: { "heading": "Oswald Bold", "body": "Geist Mono Regular" },
          palette: ["#FFFDD0", "#1C1C1C"],
          headline: "The Art of Space",
          caption: "A deep study in visual calmness and material structure.",
          tags: ["#EtherealForm"]
        };
      }

      return new Response(JSON.stringify({
        status: "SUCCESS",
        image_url: `data:image/jpeg;base64,${base64String}`,
        brand_assets: parsedAssets
      }), { status: 200, headers: corsHeaders });

    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
    }
  }
};
