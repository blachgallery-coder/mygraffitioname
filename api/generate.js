function sanitizeName(value) {
  return String(value || '')
    .replace(/[^a-zA-Z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function normalizeHex(value, fallback) {
  const candidate = String(value || '').trim();
  return /^#[0-9A-Fa-f]{6}$/.test(candidate) ? candidate.toUpperCase() : fallback;
}

function safeList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 4);
}

function buildPrompt(input) {
  const styleMap = {
    bubble: 'bubble letters graffiti, round inflated glossy letters',
    block: 'block letters graffiti, bold square geometric letterforms',
    cartoon: 'cartoon graffiti style, fun colorful rounded letters with thick outline',
    wildstyle: 'wildstyle graffiti, complex interlocking angular artistic letters',
    script: 'graffiti script, flowing cursive street calligraphy',
    neon: 'neon graffiti, glowing outlined letters with light effect',
    street_tag: 'street tag graffiti, fluid marker-style linework with authentic urban energy',
  };

  const backgroundMap = {
    street_wall: 'clean brick wall background',
    cracked_wall: 'cracked concrete wall background',
    clean_white: 'clean white studio background',
    colored_wall: `solid colored wall background (${input.solidColor})`,
    solid_color: `solid colored wall background (${input.solidColor})`,
    neon_city: 'dark neon city background',
    paris_neon: 'night Paris skyline with subtle neon glow',
    galaxy: 'galaxy space background',
    graffiti_hole: 'urban broken wall with a stylized central graffiti hole effect',
    transparent: 'plain white background, isolated artwork for easy background removal',
  };

  const effectsText = input.effects.length
    ? `Add these graffiti effects: ${input.effects.join(', ')}.`
    : 'Keep the finish clean with no extra effect.';

  const brandText = input.brandAssetId && input.brandAssetId !== 'none'
    ? `Include a very subtle branded detail inspired by ${input.brandAssetId}, without adding extra readable text.`
    : '';

  const decorText = input.decorAssetId && input.decorAssetId !== 'none'
    ? `Add subtle decor inspired by ${input.decorAssetId}, only if it does not reduce readability.`
    : '';

  return [
    `Create a high-quality graffiti artwork of the name "${input.cleanName}" in ${styleMap[input.style] || 'bubble letters graffiti'} style.`,
    `Colors: primary fill ${input.primaryColor}, secondary highlight ${input.secondaryColor}, outline ${input.outlineColor}.`,
    `Background: ${backgroundMap[input.background] || 'clean brick wall background'}.`,
    effectsText,
    brandText,
    decorText,
    'CRITICAL RULES:',
    `- The name "${input.cleanName}" must be perfectly readable, readability is the #1 priority`,
    '- Authentic premium street art graffiti aesthetic',
    '- Centered composition, clean lines, dynamic but balanced energy',
    '- Subtle spray paint texture and controlled splatter around letters only if useful',
    '- Horizontal format 3:2 ratio',
    '- High resolution, suitable for web preview and print workflow',
    `- Spell the name exactly as "${input.cleanName}" with zero modifications`,
    '- No extra words or additional readable text',
  ].filter(Boolean).join('\n');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'Missing OPENAI_API_KEY on the server' });
  }

  try {
    const cleanName = sanitizeName(req.body?.name);
    if (cleanName.length < 2 || cleanName.length > 20) {
      return res.status(400).json({ error: 'Name must be 2-20 letters' });
    }

    const payload = {
      cleanName,
      style: String(req.body?.style || 'bubble'),
      background: String(req.body?.background || 'street_wall'),
      solidColor: normalizeHex(req.body?.solidColor, '#222222'),
      primaryColor: normalizeHex(req.body?.primaryColor, '#FF6B35'),
      secondaryColor: normalizeHex(req.body?.secondaryColor, '#FFE66D'),
      outlineColor: normalizeHex(req.body?.outlineColor, '#000000'),
      effects: safeList(req.body?.effects),
      brandAssetId: String(req.body?.brandAssetId || 'none'),
      decorAssetId: String(req.body?.decorAssetId || 'none'),
    };

    const prompt = buildPrompt(payload);

    const openaiRes = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size: '1792x1024',
        quality: 'standard',
        response_format: 'url',
      }),
    });

    const data = await openaiRes.json();
    if (!openaiRes.ok) {
      console.error('OpenAI error:', data);
      return res.status(500).json({
        error: 'Image generation failed',
        details: data?.error?.message || 'Unknown OpenAI error',
      });
    }

    const imageUrl = data?.data?.[0]?.url;
    const revisedPrompt = data?.data?.[0]?.revised_prompt || '';
    if (!imageUrl) {
      return res.status(500).json({ error: 'No image returned by OpenAI' });
    }

    return res.status(200).json({
      success: true,
      imageUrl,
      prompt,
      revisedPrompt,
    });
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({
      error: 'Server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
