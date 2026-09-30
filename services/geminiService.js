const { GoogleGenAI } = require('@google/genai');

// Initialize Gemini client
const getClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === 'your_google_gemini_api_key_here') {
    throw new Error(
      'Gemini API key is not configured. Please add GEMINI_API_KEY to your .env file.'
    );
  }

  return new GoogleGenAI({ apiKey });
};

// Gemini models
const PRIMARY_MODEL = 'gemini-3.5-flash';
const FALLBACK_MODEL = 'gemini-3.6-flash';

// Wait helper
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Check whether the error is a temporary Gemini server error.
 */
const isRetryableError = (error) => {
  const message = error?.message || String(error);

  return (
    message.includes('503') ||
    message.includes('UNAVAILABLE') ||
    message.includes('high demand') ||
    message.includes('429') ||
    message.includes('RESOURCE_EXHAUSTED')
  );
};

/**
 * Generate content with retry.
 */
const generateWithRetry = async (ai, model, contents, config = undefined) => {
  const maxRetries = 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(
        `Gemini request: model=${model}, attempt=${attempt + 1}/${maxRetries}`
      );

      const request = {
        model,
        contents,
      };

      if (config) {
        request.config = config;
      }

      return await ai.models.generateContent(request);

    } catch (error) {
      console.error(
        `Gemini ${model} attempt ${attempt + 1} failed:`,
        error.message
      );

      if (!isRetryableError(error) || attempt === maxRetries - 1) {
        throw error;
      }

      // 3 seconds, 6 seconds, 12 seconds
      const delay = 3000 * Math.pow(2, attempt);

      console.log(`Retrying Gemini in ${delay / 1000} seconds...`);

      await wait(delay);
    }
  }
};

/**
 * Generates an answer for a user's question.
 */
const generateAnswer = async (question) => {
  try {
    const ai = getClient();

    const contents = `You are a helpful assistant.

Provide a clear, concise and direct answer to the following question.
Do not include introductory text.
Do not say "Sure" or "Here is the answer".
Return only the answer.

Question: ${question}`;

    let response;

    try {
      // Try primary model
      response = await generateWithRetry(
        ai,
        PRIMARY_MODEL,
        contents
      );

    } catch (primaryError) {
      console.warn(
        `Primary model ${PRIMARY_MODEL} failed. Trying fallback model ${FALLBACK_MODEL}...`
      );

      // Try fallback model
      response = await generateWithRetry(
        ai,
        FALLBACK_MODEL,
        contents
      );
    }

    if (!response || !response.text) {
      throw new Error('No response text received from Gemini API');
    }

    return response.text.trim();

  } catch (error) {
    console.error(
      'Error in geminiService.generateAnswer:',
      error
    );

    throw new Error(
      `AI Answer Generation failed: ${error.message}`
    );
  }
};


/**
 * Generates a FAQ question and answer pair.
 */
const generateFAQ = async (topic) => {
  try {
    const ai = getClient();

    const contents = `Generate a single frequently asked question and its comprehensive answer about the topic: "${topic}".`;

    const config = {
      responseMimeType: 'application/json',

      responseSchema: {
        type: 'OBJECT',

        properties: {
          question: {
            type: 'STRING',
            description:
              'A clear and common question about the topic.'
          },

          answer: {
            type: 'STRING',
            description:
              'A detailed, helpful and accurate answer.'
          }
        },

        required: ['question', 'answer']
      }
    };

    let response;

    try {
      // Try primary model
      response = await generateWithRetry(
        ai,
        PRIMARY_MODEL,
        contents,
        config
      );

    } catch (primaryError) {
      console.warn(
        `Primary model ${PRIMARY_MODEL} failed. Trying fallback model ${FALLBACK_MODEL}...`
      );

      // Try fallback model
      response = await generateWithRetry(
        ai,
        FALLBACK_MODEL,
        contents,
        config
      );
    }

    if (!response || !response.text) {
      throw new Error('No response received from Gemini API');
    }

    const faqPair = JSON.parse(response.text);

    return faqPair;

  } catch (error) {
    console.error(
      'Error in geminiService.generateFAQ:',
      error
    );

    throw new Error(
      `AI FAQ Generation failed: ${error.message}`
    );
  }
};


module.exports = {
  generateAnswer,
  generateFAQ
};