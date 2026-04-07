// Firebase Cloud Function — EBP article analysis proxy.
// Keeps the Anthropic API key server-side, away from the client.
//
// Deploy:
//   cd functions && npm install
//   firebase functions:secrets:set ANTHROPIC_API_KEY
//   firebase deploy --only functions
//
// The Firebase project must be on the Blaze (pay-as-you-go) plan.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret }       = require('firebase-functions/params');
const admin                  = require('firebase-admin');
const Anthropic              = require('@anthropic-ai/sdk');

admin.initializeApp();

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

exports.analyzeArticle = onCall(
  { secrets: [ANTHROPIC_API_KEY], region: 'us-central1' },
  async (request) => {
    // 1. Require authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'You must be signed in to use this feature.');
    }

    // 2. Verify role (student or supervisor only)
    const userSnap = await admin.firestore().doc(`users/${request.auth.uid}`).get();
    const role = userSnap.data()?.role;
    if (role !== 'student' && role !== 'supervisor') {
      throw new HttpsError('permission-denied', 'Invalid user role.');
    }

    // 3. Validate input
    const { pdfBase64, objectives } = request.data;
    if (!pdfBase64 || typeof pdfBase64 !== 'string') {
      throw new HttpsError('invalid-argument', 'pdfBase64 is required.');
    }
    if (pdfBase64.length > 11_000_000) {
      // ~8 MB base64 ≈ ~6 MB binary — reasonable ceiling
      throw new HttpsError('invalid-argument', 'PDF is too large. Please use a file under 8 MB.');
    }

    // 4. Build objectives text for the prompt
    const objectivesText = Array.isArray(objectives) && objectives.length > 0
      ? objectives.map((o, i) => `${i + 1}. ${o}`).join('\n')
      : '(No specific objectives provided — give a general EBP rationale.)';

    // 5. Call Anthropic API
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type:       'base64',
                media_type: 'application/pdf',
                data:       pdfBase64,
              },
            },
            {
              type: 'text',
              text: `You are assisting a speech-language pathology student in writing an evidence-based treatment plan.

The student's current treatment objectives are:
${objectivesText}

Analyze the attached research article and respond ONLY with valid JSON in this exact structure (no markdown fences, no extra text):
{
  "citation": "<complete APA 7th edition citation>",
  "summary": "<2–3 sentence clinical summary of the article's main findings and relevance>",
  "keyFindings": ["<finding 1>", "<finding 2>", "<finding 3>"],
  "rationale": "<1–2 sentences explaining how this article supports the treatment objectives listed above>"
}`,
            },
          ],
        },
      ],
    });

    // 6. Parse response (strip markdown fences if model adds them)
    const raw = message.content[0].text
      .replace(/^```json\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new HttpsError('internal', 'AI returned an unexpected format. Please try again.');
    }

    // 7. Validate shape
    if (typeof parsed.citation    !== 'string' ||
        typeof parsed.summary     !== 'string' ||
        !Array.isArray(parsed.keyFindings) ||
        typeof parsed.rationale   !== 'string') {
      throw new HttpsError('internal', 'AI response missing required fields. Please try again.');
    }

    return {
      citation:    parsed.citation,
      summary:     parsed.summary,
      keyFindings: parsed.keyFindings,
      rationale:   parsed.rationale,
    };
  }
);
