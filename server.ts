import express from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

dotenv.config();

const app = express();
app.use(express.json({ limit: '25mb' }));

function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

app.get('/api/fastapi-source', (_req, res) => {
  const files = [
    'backend/main.py',
    'backend/schemas.py',
    'backend/pipeline/predict.py',
    'backend/pipeline/vectorize.py',
    'backend/pipeline/solve_scale.py',
    'backend/pipeline/build_model.py',
    'backend/requirements.txt',
  ];

  const payload: Record<string, string> = {};
  for (const relPath of files) {
    const fullPath = path.resolve(process.cwd(), relPath);
    if (fs.existsSync(fullPath)) {
      payload[relPath] = fs.readFileSync(fullPath, 'utf-8');
    }
  }
  res.json({ files: payload });
});

app.post('/api/pipeline/analyze', async (req, res) => {
  try {
    const {
      imageBase64,
      mimeType,
      blueprintName = 'Uploaded Floor Plan',
    } = req.body;

    if (!imageBase64) {
      res.status(400).json({ error: 'Missing imageBase64 payload' });
      return;
    }

    const ai = getGenAI();
    if (!ai) {
      res.status(200).json({
        fallbackToMock: true,
        reason: 'GEMINI_API_KEY not configured; using local computer-vision contour detector.',
      });
      return;
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');

    // Use Gemini's native 0..1000 normalized spatial coordinate system for high geometric accuracy
    const prompt = `Analyze this 2D architectural floor-plan image with high spatial precision.
All coordinates MUST use a normalized 0 to 1000 scale where (x=0, y=0) is top-left and (x=1000, y=1000) is bottom-right.

STRICT ACCURACY RULES:
1. WALLS: Detect all visible exterior perimeter walls and interior room partition walls. Return each wall segment with start (x1, y1) and end (x2, y2) in 0..1000 coordinates, is_exterior (true for outer boundary walls, false for interior partition walls), and confidence (0.60 to 0.99 based on line clarity and connectivity).
2. ROOMS: Detect each enclosed room or zone visible in the floor plan. Return its bounding box (xmin, ymin, xmax, ymax) in 0..1000 coordinates, its exact text label if written on the plan (or accurate room name like "Bedroom", "Bathroom", "Kitchen", "Living Room", "Hallway", "Balcony"), category ("living", "bedroom", "kitchen", "bathroom", "hallway", "office", "utility", "balcony"), and confidence (0.60 to 0.99).
3. DOORS & WINDOWS: Carefully locate actual door swing arcs / doorway gaps on interior partition walls (plus main entrance door) and window symbols on exterior walls. Return kind ("door" or "window"), exact center (cx, cy) on the wall line, span width_norm in 0..1000 coordinates, and confidence (0.60 to 0.99; use <0.85 if the doorway symbol is faint or ambiguous). Never place interior room doors on exterior bedroom/bathroom walls.
4. FURNITURE & FIXTURES (STRICT GROUNDING): ONLY return furniture or plumbing fixtures that are ACTUALLY DRAWN in this floor-plan image (such as a drawn bed, sofa, dining table, toilet, bathtub, sink, kitchen stove/counter, desk, or wardrobe).
   - If a room has NO furniture drawn inside it on the image, do NOT invent any furniture for that room!
   - For each drawn object visible in the image, return its exact bounding box (xmin, ymin, xmax, ymax) in 0..1000 coordinates, its kind ("bed", "nightstand", "wardrobe", "sofa", "coffee_table", "tv_stand", "dining_table", "kitchen_counter", "fridge", "bathtub", "toilet", "sink_vanity", "shower", "desk"), orientation rotation_deg (0, 90, 180, or 270), and confidence (0.60 to 0.99).
5. SCALE: Read any dimension numbers printed on the plan to estimate total_width_meters of the floor plan (default to 11.0 if no numbers are printed).`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType || 'image/jpeg',
              data: cleanBase64,
            },
          },
          { text: prompt },
        ],
      },
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            total_width_meters: { type: Type.NUMBER },
            detected_dimension_text: { type: Type.STRING },
            walls: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  x1: { type: Type.NUMBER },
                  y1: { type: Type.NUMBER },
                  x2: { type: Type.NUMBER },
                  y2: { type: Type.NUMBER },
                  is_exterior: { type: Type.BOOLEAN },
                  confidence: { type: Type.NUMBER },
                },
                required: ['x1', 'y1', 'x2', 'y2', 'is_exterior'],
              },
            },
            rooms: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  category: { type: Type.STRING },
                  xmin: { type: Type.NUMBER },
                  ymin: { type: Type.NUMBER },
                  xmax: { type: Type.NUMBER },
                  ymax: { type: Type.NUMBER },
                  confidence: { type: Type.NUMBER },
                },
                required: ['name', 'category', 'xmin', 'ymin', 'xmax', 'ymax'],
              },
            },
            openings: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  kind: { type: Type.STRING },
                  cx: { type: Type.NUMBER },
                  cy: { type: Type.NUMBER },
                  width_norm: { type: Type.NUMBER },
                  confidence: { type: Type.NUMBER },
                },
                required: ['kind', 'cx', 'cy', 'width_norm'],
              },
            },
            furniture: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  kind: { type: Type.STRING },
                  label: { type: Type.STRING },
                  xmin: { type: Type.NUMBER },
                  ymin: { type: Type.NUMBER },
                  xmax: { type: Type.NUMBER },
                  ymax: { type: Type.NUMBER },
                  rotation_deg: { type: Type.NUMBER },
                  confidence: { type: Type.NUMBER },
                },
                required: ['kind', 'label', 'xmin', 'ymin', 'xmax', 'ymax'],
              },
            },
          },
          required: ['walls', 'rooms', 'openings', 'furniture'],
        },
      },
    });

    const rawText = response.text;
    if (!rawText) {
      res.status(200).json({ fallbackToMock: true, reason: 'Empty model output' });
      return;
    }

    res.json({
      fallbackToMock: false,
      blueprintName,
      data: JSON.parse(rawText),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Gemini Vision analysis error:', message);
    res.status(200).json({ fallbackToMock: true, reason: message });
  }
});

async function startServer() {
  const PORT = 3000;
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FloorForge (HNX26EPS06) server listening on http://localhost:${PORT}`);
  });
}

startServer();
