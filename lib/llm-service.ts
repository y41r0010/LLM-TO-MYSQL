import OpenAI from "openai";
import { ProxyAgent, fetch as undiciFetch } from "undici";

const apiKey = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY;
const baseURL = process.env.OPENAI_BASE_URL || process.env.LLM_BASE_URL;
const model = process.env.OPENAI_MODEL || process.env.LLM_MODEL;
const provider = (process.env.LLM_PROVIDER || "gemini").toLowerCase();
const defaultInstructions = "You are a helpful assistant.";

type GenerateParams = { input: string; instructions?: string; stream?: boolean; [key: string]: any };

// Validated on first use, not at import time: a missing variable then becomes a
// normal error the API route can return as JSON instead of crashing the module.
let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!apiKey || !baseURL || !model) {
    throw new Error(
      "Falta configurar el modelo de IA: define LLM_API_KEY, LLM_BASE_URL y LLM_MODEL en la configuración del servidor."
    );
  }
  if (!client) {
    // Servers without direct internet access reach the AI API through an HTTP proxy.
    const proxyUrl = process.env.LLM_PROXY_URL || process.env.HTTPS_PROXY || process.env.https_proxy;
    client = new OpenAI({
      apiKey,
      baseURL,
      timeout: 60_000,
      // Use undici's own fetch with its ProxyAgent: Node's built-in fetch may ship a different undici version.
      ...(proxyUrl
        ? { fetch: undiciFetch as unknown as typeof fetch, fetchOptions: { dispatcher: new ProxyAgent(proxyUrl) } as any }
        : {}),
    });
  }
  return client;
}

export interface LLMProvider {
  generate(params: GenerateParams): Promise<any>;
  /** Plain-text answer, whatever the provider's response shape. */
  generateText(params: { input: string; instructions?: string }): Promise<string>;
}

function checkInput(input: unknown) {
  if (!input || typeof input !== "string") {
    throw new Error("Missing or invalid 'input' string.");
  }
}

// Chat Completions API (used for Gemini through its OpenAI-compatible endpoint).
export class GeminiLLMService implements LLMProvider {
  async generate({ input, instructions, stream = false, ...rest }: GenerateParams) {
    checkInput(input);
    return await getClient().chat.completions.create({
      model: model as string,
      messages: [
        { role: "system", content: instructions || defaultInstructions },
        { role: "user", content: input },
      ],
      stream,
      ...rest,
    });
  }

  async generateText({ input, instructions }: { input: string; instructions?: string }) {
    // Gemini "thinks" a lot by default; "low" is ~3x faster and still writes good SQL.
    const effort = (process.env.LLM_REASONING_EFFORT || "low").toLowerCase();
    const res: any = await this.generate({
      input,
      instructions,
      ...(effort !== "default" ? { reasoning_effort: effort } : {}),
    });
    return (res.choices?.[0]?.message?.content ?? "").trim();
  }
}

// Responses API (OpenAI).
export class OpenAILLMService implements LLMProvider {
  async generate({ input, instructions, stream = false, ...rest }: GenerateParams): Promise<any> {
    checkInput(input);
    return await getClient().responses.create({
      model: model as string,
      input,
      instructions: instructions || defaultInstructions,
      stream,
      ...rest,
    });
  }

  async generateText({ input, instructions }: { input: string; instructions?: string }) {
    const res: any = await this.generate({ input, instructions });
    return (res.output_text ?? "").trim();
  }
}

let LLMService: LLMProvider;
if (provider === "openai") {
  LLMService = new OpenAILLMService();
} else if (provider === "gemini") {
  LLMService = new GeminiLLMService();
} else {
  throw new Error(`Unknown LLM_PROVIDER: ${provider}`);
}

export { LLMService };
