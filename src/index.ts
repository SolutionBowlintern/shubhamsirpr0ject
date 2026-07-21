export default {
  async fetch(request, env) {
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
      return new Response(JSON.stringify({ error: "Please send a JSON POST request." }), { 
        status: 405, 
        headers: corsHeaders 
      });
    }

    try {
      const body = await request.json();
      const userPrompt = body.prompt;

      if (!userPrompt) {
        return new Response(JSON.stringify({ error: "Missing 'prompt' in request body." }), { 
          status: 400, 
          headers: corsHeaders 
        });
      }

      // --- GUARDRAIL 1: BANNED TERM FILTER ---
      const sanitizedInput = userPrompt.toLowerCase();
      const FORBIDDEN = ["cheap", "discount", "neon", "cyberpunk", "ugly"];
      for (const token of FORBIDDEN) {
        if (sanitizedInput.includes(token)) {
          return new Response(JSON.stringify({
            status: "BLOCKED",
            reason: `The term '\${token}' violates brand identity parameters.`
          }), { status: 400, headers: corsHeaders });
        }
      }

      // --- GUARDRAIL 2: STRICT BRAND SYSTEM PROMPT ---
      const BRAND_SYSTEM_PROMPT = `
        You are the Design Director for 'Ethereal Form'. Convert product ideas into brand assets.
        
        [BRAND IDENTITY MANDATES]
        - COLOR PALETTE: Cream White (#FFFDD0), Charcoal Gray (#1C1C1C), Muted Moss (#606E5C). No other colors.
        - FONTS: Headers are 'Oswald Bold'. Paragraphs are 'Geist Mono Regular'.
        - TONE: High-end architectural minimalism, quiet luxury.

        Output ONLY a single raw JSON object. Do not use markdown blocks like \`\`\`json. Do not explain anything.
        
        Expected JSON Schema:
        {
          "typography": { "heading": "Oswald Bold", "body": "Geist Mono Regular" },
          "palette": ["#FFFDD0", "#1C1C1C", "#606E5C"],
          "headline": "A short minimalist title.",
          "caption": "An elegant, descriptive caption matching the image.",
          "tags": ["#EtherealForm", "#QuietLuxury"]
        }
      `.trim();

      // --- EXECUTION: UPDATED ACTIVE 2026 AI MODELS ---
      // Running image generation via standard flux-1-schnell model
      const imageTask = env.AI.run('@cf/blackforestlabs/flux-1-schnell', {
        prompt: `${userPrompt}, architectural minimalism luxury editorial style, color palette of cream white and muted moss, clean studio lighting, 8k resolution`,
        height: 1024,
        width: 1024
      });

      // Running copy generation via updated llama-3.1 model
      const copyTask = env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          { role: "system", content: BRAND_SYSTEM_PROMPT },
          { role: "user", content: `Generate brand data for: ${userPrompt}` }
        ],
        temperature: 0.1, 
        max_tokens: 500
      });

      const [imageResult, textResult] = await Promise.all([imageTask, copyTask]);

      // Transform raw binary data to Base64 URI string
      const imageBuffer = await imageResult.arrayBuffer();
      const base64String = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));

      // Clean text output from markdown debris
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
          palette: ["#FFFDD0", "#1C1C1C", "#606E5C"],
          headline: "The Art of Space",
          caption: "A deep study in visual calmness, material heritage, and structure.",
          tags: ["#EtherealForm", "#Minimalism"]
        };
      }

      return new Response(JSON.stringify({
        status: "SUCCESS",
        image_url: `data:image/jpeg;base64,${base64String}`,
        brand_assets: parsedAssets
      }), { status: 200, headers: corsHeaders });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { 
        status: 500, 
        headers: corsHeaders 
      });
    }
  }
};
