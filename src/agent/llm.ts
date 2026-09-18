// Inference on the agent's own key: an OpenAI-compatible client pointed at the Orbio gateway.
import OpenAI from 'openai'
import type { AgentKey } from './keys.js'

export const VERDICT_MODEL = process.env.VERDICT_MODEL ?? 'anthropic/claude-sonnet-5'

export function gateway(key: AgentKey): OpenAI {
  return new OpenAI({ apiKey: key.key, baseURL: key.baseUrl, maxRetries: 1 })
}

interface Price {
  prompt: number
  completion: number
}

const prices = new Map<string, Promise<Price>>()

/**
 * Per-token prices from the gateway's own model list. Orbio charges exactly these, so a call's
 * cost is known the moment it returns (the balance only settles a few seconds later).
 */
export function priceOf(key: AgentKey, model: string): Promise<Price> {
  let price = prices.get(model)
  if (!price) {
    price = fetch(`${key.baseUrl}/models`)
      .then((res) => res.json() as Promise<{ data: { id: string; pricing: Record<string, string> }[] }>)
      .then(({ data }) => {
        const pricing = data.find((m) => m.id === model)?.pricing
        if (!pricing) throw new Error(`${model} is not on the gateway`)
        return { prompt: Number(pricing.prompt), completion: Number(pricing.completion) }
      })
    price.catch(() => prices.delete(model))
    prices.set(model, price)
  }
  return price
}
