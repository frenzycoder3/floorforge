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
    const { imageBase64, mimeType, imageWidth = 1000, imageHeight = 750, blueprintName = 'Uploaded Plan' } = req.body;

    if (!imageBase64) {
      res.status(400).json({ error: 'Missing imageBase64 payload' });
      return;
    }

    const ai = getGenAI();
    if (!ai) {
      res.status(200).json({
        fallbackToMock: true,
        reason: 'GEMINI_API_KEY not configured; using fast local multi-room + furniture pipeline.',
      });
      return;
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');

    const prompt = `You are FloorForge (HNX26EPS06), a 2D floor-plan to 3D scene & furniture reconstruction engine.
Analyze this floor-plan image (coordinates: X from 0 to ${imageWidth}, Y from 0 to ${imageHeight}, top-left is 0,0).
CRITICAL REQUIREMENTS:
1. Detect BOTH the exterior perimeter walls AND all interior room partition walls (separating bedrooms, bathrooms, kitchen, living room, hallway). Do NOT return only outer borders.
2. Detect doors and windows along walls.
3. Detect all enclosed rooms ("living", "bedroom", "kitchen", "bathroom", "hallway", "office", "balcony") as 4-point polygons.
4. Detect or plausibly complete interior furniture and bathroom/kitchen fixtures ("bed", "nightstand", "wardrobe", "sofa", "coffee_table", "tv_stand", "dining_table", "kitchen_counter", "fridge", "bathtub", "toilet", "sink_vanity", "desk") inside each room, marking provenance as "observed" if drawn on the plan or "generated_completion" if inferred from room semantics.
5. Estimate scale (meters_per_pixel).`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
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
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            walls: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  startX: { type: Type.NUMBER },
                  startY: { type: Type.NUMBER },
                  endX: { type: Type.NUMBER },
                  endY: { type: Type.NUMBER },
                  thickness_px: { type: Type.NUMBER },
                  is_exterior: { type: Type.BOOLEAN },
                  confidence: { type: Type.NUMBER },
                  provenance: { type: Type.STRING },
                },
                required: ['id', 'startX', 'startY', 'endX', 'endY', 'thickness_px', 'is_exterior', 'confidence'],
              },
            },
            openings: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  kind: { type: Type.STRING },
                  wall_id: { type: Type.STRING },
                  position_t: { type: Type.NUMBER },
                  width_px: { type: Type.NUMBER },
                  confidence: { type: Type.NUMBER },
                  provenance: { type: Type.STRING },
                },
                required: ['id', 'kind', 'wall_id', 'position_t', 'width_px', 'confidence'],
              },
            },
            rooms: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  name: { type: Type.STRING },
                  category: { type: Type.STRING },
                  points: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        x: { type: Type.NUMBER },
                        y: { type: Type.NUMBER },
                      },
                      required: ['x', 'y'],
                    },
                  },
                  confidence: { type: Type.NUMBER },
                  provenance: { type: Type.STRING },
                },
                required: ['id', 'name', 'category', 'points', 'confidence'],
              },
            },
            furniture: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  room_id: { type: Type.STRING },
                  kind: { type: Type.STRING },
                  label: { type: Type.STRING },
                  centerX: { type: Type.NUMBER },
                  centerY: { type: Type.NUMBER },
                  width_px: { type: Type.NUMBER },
                  depth_px: { type: Type.NUMBER },
                  rotation_deg: { type: Type.NUMBER },
                  provenance: { type: Type.STRING },
                },
                required: ['id', 'room_id', 'kind', 'label', 'centerX', 'centerY', 'width_px', 'depth_px', 'provenance'],
              },
            },
            scale: {
              type: Type.OBJECT,
              properties: {
                method: { type: Type.STRING },
                meters_per_pixel: { type: Type.NUMBER },
                confidence: { type: Type.NUMBER },
                reference_label: { type: Type.STRING },
                detected_dimension_text: { type: Type.STRING },
              },
              required: ['method', 'meters_per_pixel', 'confidence', 'reference_label'],
            },
          },
          required: ['walls', 'openings', 'rooms', 'scale'],
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
