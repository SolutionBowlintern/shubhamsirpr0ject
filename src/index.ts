export interface Env {
  AI: any;
}

interface BrandDNA {
  name?: string;
  palette?: string[];
  typography?: { heading?: string; body?: string };
  tone?: string;
  logo_base64?: string;
  logo_description?: string;
  guidelines?: string;
  tags?: string[];
}

const DEFAULT_DNA: BrandDNA = {
  name: 'Ethereal Form',
  palette: ['#FFFDD0', '#1C1C1C'],
  typography: { heading: 'Oswald Bold', body: 'Geist Mono Regular' },
  tone: 'luxury architectural minimalism editorial photography style',
  tags: ['#EtherealForm'],
};

function mergeDNA(input: BrandDNA): Required<BrandDNA> {
  const name = input.name || DEFAULT_DNA.name!;
  return {
    name,
    palette: input.palette || DEFAULT_DNA.palette!,
    typography: { ...DEFAULT_DNA.typography, ...input.typography },
    tone: input.tone || DEFAULT_DNA.tone!,
    logo_base64: input.logo_base64 || '',
    logo_description: input.logo_description || '',
    guidelines: input.guidelines || '',
    tags: input.tags || [`#${name.replace(/\s+/g, '')}`],
  };
}

function buildSystemPrompt(brand: Required<BrandDNA>): string {
  return `
You are the AI Creative Director for '${brand.name}'.
Your job: convert product ideas into brand-consistent marketing assets.

BRAND IDENTITY:
- Name: ${brand.name}
- Palette: ${brand.palette.join(', ')}
- Heading Font: ${brand.typography.heading}
- Body Font: ${brand.typography.body}
- Visual Tone: ${brand.tone}
${brand.logo_description ? `- Logo: ${brand.logo_description}` : ''}
${brand.guidelines ? `- Guidelines: ${brand.guidelines}` : ''}

RULES:
- Headline: punchy, minimalist, max 6 words.
- Caption: elegant, evocative, 1-2 sentences.
- Tags: relevant hashtags including brand tag.
- image_direction: one sentence — the ideal shot for this product.

Output ONLY raw JSON, no markdown, no preamble:
{
  "headline": "Short brand headline",
  "caption": "Elegant product caption.",
  "palette": ${JSON.stringify(brand.palette)},
  "typography": ${JSON.stringify(brand.typography)},
  "tags": ${JSON.stringify(brand.tags)},
  "image_direction": "One sentence describing the ideal shot."
}
`.trim();
}

function buildImagePrompt(userPrompt: string, brand: Required<BrandDNA>): string {
  return [
    userPrompt,
    brand.tone,
    `color palette of ${brand.palette.slice(0, 2).join(' and ')}`,
    'clean studio lighting',
    'ultra high quality commercial photography',
    brand.logo_description ? `featuring ${brand.logo_description}` : '',
    brand.guidelines,
  ].filter(Boolean).join(', ');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders, status: 204 });
    }

    if (request.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Please send a JSON POST request.' }),
        { status: 405, headers: corsHeaders }
      );
    }

    try {
      const body: any = await request.json();
      const userPrompt: string = body.prompt;
      const brandDNA: BrandDNA = body.brand_dna || {};

      if (!userPrompt) {
        return new Response(
          JSON.stringify({ error: "Missing 'prompt' parameter." }),
          { status: 400, headers: corsHeaders }
        );
      }

      const brand = mergeDNA(brandDNA);
      const systemPrompt = buildSystemPrompt(brand);
      const imagePrompt = buildImagePrompt(userPrompt, brand);

      const [imageResult, textResult] = await Promise.all([
        env.AI.run('@cf/black-forest-labs/flux-1-schnell', {
          prompt: imagePrompt,
          height: 1024,
          width: 1024,
        }),
        env.AI.run('@cf/meta/llama-3.1-8b-instruct-fp8', {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Generate brand assets for: ${userPrompt}` },
          ],
          temperature: 0.1,
          max_tokens: 500,
        }),
      ]);

      // Image — Flux returns base64 directly in .image
      const base64String: string = imageResult.image;

      // Text — strip markdown fences if present
      let cleanText: string = textResult.response.trim();
      if (cleanText.startsWith('```')) {
        cleanText = cleanText.replace(/```json|```/g, '').trim();
      }

      let parsedAssets: any;
      try {
        parsedAssets = JSON.parse(cleanText);
      } catch {
        parsedAssets = {
          headline: 'The Art of Space',
          caption: 'A deep study in visual calmness and material structure.',
          palette: brand.palette,
          typography: brand.typography,
          tags: brand.tags,
          image_direction: 'Minimal product on white surface, dramatic side lighting.',
        };
      }

      const responsePayload: any = {
        status: 'SUCCESS',
        image_url: `data:image/jpeg;base64,${base64String}`,
        brand_assets: parsedAssets,
        brand_dna_active: {
          name: brand.name,
          palette: brand.palette,
          typography: brand.typography,
          tone: brand.tone,
        },
      };

      // Echo logo back so frontend can overlay it
      if (brand.logo_base64) {
        responsePayload.logo_url = brand.logo_base64;
      }

      return new Response(JSON.stringify(responsePayload), {
        status: 200,
        headers: corsHeaders,
      });

    } catch (err: any) {
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 500, headers: corsHeaders }
      );
    }
  },
};
