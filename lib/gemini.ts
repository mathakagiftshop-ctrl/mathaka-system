import type { ExtractionResult } from "./types";

export interface OrderExtractionService {
  extract(messages: Array<{ id: string; text: string; mediaUrl?: string }>): Promise<ExtractionResult>;
}

export class GeminiOrderExtractionService implements OrderExtractionService {
  async extract(): Promise<ExtractionResult> {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured. Demo mode does not call Gemini.");
    }
    throw new Error("Connect the Gemini server SDK here using model gemini-3.6-flash and validated JSON output.");
  }
}
