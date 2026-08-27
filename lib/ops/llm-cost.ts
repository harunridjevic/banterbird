type LlmProvider = "cerebras" | "groq" | "gemini" | "openai";

/** Estimated USD cost from token counts (defaults match common list prices). */
export function estimateLlmCostUsd(
  provider: LlmProvider,
  inputTokens: number,
  outputTokens: number,
): number {
  const inputPerM =
    provider === "cerebras"
      ? parseFloat(process.env.CEREBRAS_INPUT_PRICE_PER_1M ?? "0.60")
      : provider === "groq"
        ? parseFloat(process.env.GROQ_INPUT_PRICE_PER_1M ?? "0.075")
        : provider === "gemini"
          ? parseFloat(process.env.GEMINI_INPUT_PRICE_PER_1M ?? "0.15")
          : parseFloat(process.env.OPENAI_INPUT_PRICE_PER_1M ?? "0.15");
  const outputPerM =
    provider === "cerebras"
      ? parseFloat(process.env.CEREBRAS_OUTPUT_PRICE_PER_1M ?? "0.60")
      : provider === "groq"
        ? parseFloat(process.env.GROQ_OUTPUT_PRICE_PER_1M ?? "0.30")
        : provider === "gemini"
          ? parseFloat(process.env.GEMINI_OUTPUT_PRICE_PER_1M ?? "0.60")
          : parseFloat(process.env.OPENAI_OUTPUT_PRICE_PER_1M ?? "0.60");

  const cost =
    (inputTokens / 1_000_000) * inputPerM + (outputTokens / 1_000_000) * outputPerM;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
