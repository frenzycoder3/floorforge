import express from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const app = express();
app.use(express.json({ limit: '25mb' }));

// Initialize Gemini client on server-side with required User-Agent header
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

// Endpoint to inspect the Python FastAPI reference files directly from the UI
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

// Server-side AI floor-plan segmentation & vectorization endpoint using Gemini Vision
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
        reason: 'GEMINI_API_KEY not configured; falling back to local modular pipeline.',
      });
      return;
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');

    const prompt = `You are FloorForge (HNX26EPS06), an architectural 2D floor-plan segmentation and vectorization engine.
Analyze this floor-plan image (coordinate system: X from 0 to ${imageWidth}, Y from 0 to ${imageHeight}, where (0,0) is top-left).
Perform the 4-stage analysis:
1. Detect all structural exterior and interior walls as straight line segments (start X,Y to end X,Y). Snap orthogonal walls so horizontal walls share identical Y and vertical walls share identical X. Ensure exterior walls form a closed perimeter around the floor plan.
2. Detect doors and windows along those walls, specifying parent wall_id, normalized position_t (0.05 to 0.95 along the wall), width_px, and kind ("door" or "window").
3. Detect enclosed rooms as closed 4-to-8 point polygons (in pixel coordinates 0..${imageWidth}, 0..${imageHeight}), with architectural room names and categories ("living", "bedroom", "kitchen", "bathroom", "hallway", "office", "utility", "balcony").
4. Estimate scale (meters_per_pixel) by reading any visible dimension text in the floor plan or using standard 0.90m door widths, plus list any architectural topology or scale warnings.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType || 'image/png',
              data: cleanBase64,
            },
          },
          { text: prompt },
        ],
      },
      config: {
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
                  swing_direction: { type: Type.STRING },
                  confidence: { type: Type.NUMBER },
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
                },
                required: ['id', 'name', 'category', 'points', 'confidence'],
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
            warnings: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  code: { type: Type.STRING },
                  severity: { type: Type.STRING },
                  stage: { type: Type.STRING },
                  message: { type: Type.STRING },
                },
                required: ['code', 'severity', 'stage', 'message'],
              },
            },
          },
          required: ['walls', 'openings', 'rooms', 'scale', 'warnings'],
        },
      },
    });

    const rawText = response.text;
    if (!rawText) {
      res.status(200).json({
        fallbackToMock: true,
        reason: 'Empty response from vision model; using deterministic mock pipeline.',
      });
      return;
    }

    const parsed = JSON.parse(rawText);
    res.json({
      fallbackToMock: false,
      blueprintName,
      data: parsed,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error during Gemini Vision analysis';
    console.error('Gemini Vision pipeline error:', message);
    res.status(200).json({
      fallbackToMock: true,
      reason: message,
    });
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
